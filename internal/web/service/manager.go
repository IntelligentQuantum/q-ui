package service

import (
	"errors"
	"regexp"
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/util/crypto"
	"github.com/mhsanaei/3x-ui/v3/internal/util/random"

	"gorm.io/gorm"
)

// Manager-service sentinels so the controller can map to localized messages.
var (
	ErrSlugInvalid   = errors.New("invalid workspace slug")
	ErrSlugTaken     = errors.New("workspace slug already in use")
	ErrDomainInvalid = errors.New("invalid domain")
	ErrDomainTaken   = errors.New("domain already in use")
)

// domainPattern is a permissive hostname check (labels of letters/digits/hyphen,
// at least one dot) so a Manager can point a domain or subdomain at their panel.
var domainPattern = regexp.MustCompile(`^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)

const managerApiKeyLength = 48

// ManagerService is the admin-only control plane for Manager workspaces: it
// creates the {manager user + tenant + API key} triple, lists/edits them, and
// handles suspension, bandwidth allocation, key rotation and deletion. It is
// stateless; cross-row work runs in a single DB transaction so a half-created
// workspace can never persist.
type ManagerService struct {
	userService UserService
}

// CreateManagerInput is the admin's payload for provisioning a new workspace.
type CreateManagerInput struct {
	Username string // login for the manager account
	Password string
	FullName string
	Email    string
	Phone    string
	Slug     string // workspace URL id (/panel/<slug>)
	Name     string // workspace display/brand name
}

// ManagerView is the admin-facing projection of a workspace. ApiKey is set only
// on create/rotate (the plaintext is shown exactly once); UserCount is a cheap
// rollup for the list.
type ManagerView struct {
	Tenant    *model.Tenant `json:"tenant"`
	Manager   *model.User   `json:"manager"`
	UserCount int64         `json:"userCount"`
	ApiKey    string        `json:"apiKey,omitempty"`
}

// Create provisions a workspace: a manager user (role=manager), its tenant, and
// a one-time API key. All writes are atomic; the manager's tenant_id is set to
// the new tenant so the tenant middleware confines them immediately.
func (s *ManagerService) Create(in CreateManagerInput) (*ManagerView, error) {
	slug := strings.ToLower(strings.TrimSpace(in.Slug))
	if !model.ValidateSlug(slug) {
		return nil, ErrSlugInvalid
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = in.Username
	}

	apiKeyPlain := random.Seq(managerApiKeyLength)
	view := &ManagerView{ApiKey: apiKeyPlain}

	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		// Slug uniqueness inside the txn so two concurrent creates can't collide.
		var count int64
		if err := tx.Model(model.Tenant{}).Where("slug = ?", slug).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrSlugTaken
		}

		// Reuse the canonical user-creation path (hashing, username/email
		// uniqueness, password policy) so there is no duplicated logic.
		user, err := s.userService.adminCreateUserTx(tx, AdminUserInput{
			Username: in.Username,
			Password: in.Password,
			FullName: in.FullName,
			Email:    in.Email,
			Phone:    in.Phone,
			Role:     model.RoleManager,
		})
		if err != nil {
			return err
		}

		tenant := &model.Tenant{
			Slug:          slug,
			ManagerUserId: user.Id,
			Name:          name,
			Status:        model.TenantActive,
			ApiKeyHash:    crypto.HashTokenSHA256(apiKeyPlain),
		}
		if err := tx.Create(tenant).Error; err != nil {
			return err
		}
		if err := tx.Model(model.User{}).Where("id = ?", user.Id).Update("tenant_id", tenant.Id).Error; err != nil {
			return err
		}
		user.TenantId = tenant.Id
		user.Password = ""
		view.Tenant = tenant
		view.Manager = user
		return nil
	})
	if err != nil {
		return nil, err
	}
	return view, nil
}

// EnsureWorkspaceForUser provisions a Tenant for a user who has been promoted to
// manager (e.g. from the admin Users page) but does not own one yet. Idempotent:
// if the user already owns a workspace it just makes sure their tenant_id points
// at it. The slug is derived from the username (uniquified + reserved-word safe).
// No API key is issued here — the admin mints one via RotateApiKey on the
// Managers page when needed.
func (s *ManagerService) EnsureWorkspaceForUser(userID int) (*model.Tenant, error) {
	if userID <= 0 {
		return nil, ErrTenantNotFound
	}
	ts := &TenantService{}
	if t, err := ts.GetByManagerUserID(userID); err == nil {
		// Keep the user row pointing at their workspace.
		_ = database.GetDB().Model(model.User{}).
			Where("id = ? AND tenant_id <> ?", userID, t.Id).Update("tenant_id", t.Id).Error
		return t, nil
	}
	var user model.User
	if err := database.GetDB().Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	tenant := &model.Tenant{ManagerUserId: userID, Name: user.Username, Status: model.TenantActive}
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		slug, err := s.uniqueSlug(tx, deriveSlug(user.Username))
		if err != nil {
			return err
		}
		tenant.Slug = slug
		if err := tx.Create(tenant).Error; err != nil {
			return err
		}
		return tx.Model(model.User{}).Where("id = ?", userID).Update("tenant_id", tenant.Id).Error
	})
	if err != nil {
		return nil, err
	}
	return tenant, nil
}

// ReconcileWorkspaces enforces the invariant "every manager owns a workspace and
// their tenant_id points at it". It loads every user whose role is manager and
// runs EnsureWorkspaceForUser on each — idempotent, so managers already wired are
// untouched and only broken rows are repaired.
//
// This is the SELF-HEALING migration for existing installs: a user promoted to
// manager before workspace auto-provisioning existed (or whose promotion-time
// provisioning failed) would otherwise sit at tenant_id 0, which the tenant
// middleware resolves to the ADMIN's global tenant — so the manager would see and
// manage the admin's data. Running this once on every startup fixes such rows
// without anyone having to recreate the database. Best-effort: a per-manager
// failure is logged and the rest still run; the first error (if any) is returned.
func (s *ManagerService) ReconcileWorkspaces() error {
	var managers []model.User
	if err := database.GetDB().Where("role = ?", model.RoleManager).Find(&managers).Error; err != nil {
		return err
	}
	var firstErr error
	repaired := 0
	for _, m := range managers {
		// A manager already pointing at a positive tenant they own is the common
		// case; EnsureWorkspaceForUser is a no-op relink for them. Only rows that
		// truly lack a workspace get a freshly-provisioned one.
		hadNoTenant := m.TenantId <= model.GlobalTenantId
		t, err := s.EnsureWorkspaceForUser(m.Id)
		if err != nil {
			logger.Warningf("reconcile workspace for manager %d (%s) failed: %v", m.Id, m.Username, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if hadNoTenant && t != nil {
			repaired++
			logger.Infof("reconcile: provisioned workspace %d (slug %q) for manager %d (%s)", t.Id, t.Slug, m.Id, m.Username)
		}
	}
	if repaired > 0 {
		logger.Infof("reconcile: repaired %d manager workspace(s)", repaired)
	}
	return firstErr
}

// SuspendWorkspaceForUser suspends any ACTIVE workspace owned by the user. Called
// when an account is demoted from manager (from the admin Users page) so its
// workspace isn't left running headless. No-op for users who own no workspace
// (the vast majority), so it's safe to call on every non-manager user save.
func (s *ManagerService) SuspendWorkspaceForUser(userID int) error {
	if userID <= 0 {
		return nil
	}
	return database.GetDB().Model(model.Tenant{}).
		Where("manager_user_id = ? AND status = ?", userID, model.TenantActive).
		Update("status", model.TenantSuspended).Error
}

// deriveSlug turns a username into a slug candidate: lowercase, non-alphanumerics
// to single hyphens, trimmed, padded/clamped to the 3–32 length the slug pattern
// requires.
func deriveSlug(username string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(username)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	if len(out) < 3 {
		out += "-ws"
	}
	if len(out) > 32 {
		out = strings.Trim(out[:32], "-")
	}
	return out
}

// uniqueSlug returns base (or base-2, base-3, …) — valid, non-reserved and free.
func (s *ManagerService) uniqueSlug(tx *gorm.DB, base string) (string, error) {
	if !model.ValidateSlug(base) {
		base = "ws-" + base
		if len(base) > 32 {
			base = base[:32]
		}
	}
	candidate := base
	for i := 2; i < 1000; i++ {
		if model.ValidateSlug(candidate) {
			var count int64
			if err := tx.Model(model.Tenant{}).Where("slug = ?", candidate).Count(&count).Error; err != nil {
				return "", err
			}
			if count == 0 {
				return candidate, nil
			}
		}
		suffix := "-" + strconv.Itoa(i)
		trimTo := 32 - len(suffix)
		b := base
		if len(b) > trimTo {
			b = strings.Trim(b[:trimTo], "-")
		}
		candidate = b + suffix
	}
	return "", errors.New("could not derive a unique workspace slug")
}

// List returns every workspace with its manager and a user-count rollup.
func (s *ManagerService) List() ([]*ManagerView, error) {
	db := database.GetDB()
	var tenants []*model.Tenant
	if err := db.Order("id asc").Find(&tenants).Error; err != nil {
		return nil, err
	}
	out := make([]*ManagerView, 0, len(tenants))
	for _, t := range tenants {
		view := &ManagerView{Tenant: t}
		var mgr model.User
		if err := db.Where("id = ?", t.ManagerUserId).First(&mgr).Error; err == nil {
			mgr.Password = ""
			view.Manager = &mgr
		}
		var n int64
		db.Model(model.User{}).Where("tenant_id = ?", t.Id).Count(&n)
		view.UserCount = n
		out = append(out, view)
	}
	return out, nil
}

// Get returns a single workspace view by tenant id.
func (s *ManagerService) Get(tenantID int) (*ManagerView, error) {
	db := database.GetDB()
	var t model.Tenant
	if err := db.Where("id = ?", tenantID).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTenantNotFound
		}
		return nil, err
	}
	view := &ManagerView{Tenant: &t}
	var mgr model.User
	if err := db.Where("id = ?", t.ManagerUserId).First(&mgr).Error; err == nil {
		mgr.Password = ""
		view.Manager = &mgr
	}
	var n int64
	db.Model(model.User{}).Where("tenant_id = ?", t.Id).Count(&n)
	view.UserCount = n
	return view, nil
}

// WorkspaceOverview is a read-only, at-a-glance snapshot of one workspace for the
// admin Managers page — so an admin can see "things about a workspace" (size,
// catalog, sales, pending work, balance, bandwidth) WITHOUT impersonating it.
type WorkspaceOverview struct {
	Tenant          *model.Tenant `json:"tenant"`
	Manager         *model.User   `json:"manager"`
	UserCount       int64         `json:"userCount"`
	ProductCount    int64         `json:"productCount"`
	OrderCount      int64         `json:"orderCount"`
	Revenue         int64         `json:"revenue"` // sum of completed orders' amount
	PendingDeposits int64         `json:"pendingDeposits"`
	OpenTickets     int64         `json:"openTickets"`
	ManagerBalance  int64         `json:"managerBalance"`
}

// Overview aggregates per-workspace stats for the given tenant. Every count is
// confined to that tenant_id, so it reflects exactly one workspace.
func (s *ManagerService) Overview(tenantID int) (*WorkspaceOverview, error) {
	db := database.GetDB()
	var t model.Tenant
	if err := db.Where("id = ?", tenantID).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTenantNotFound
		}
		return nil, err
	}
	out := &WorkspaceOverview{Tenant: &t}
	if mgr := (model.User{}); db.Where("id = ?", t.ManagerUserId).First(&mgr).Error == nil {
		mgr.Password = ""
		out.Manager = &mgr
		out.ManagerBalance = mgr.Balance
	}
	db.Model(model.User{}).Where("tenant_id = ?", tenantID).Count(&out.UserCount)
	db.Model(model.Product{}).Where("tenant_id = ?", tenantID).Count(&out.ProductCount)
	db.Model(model.Order{}).Where("tenant_id = ?", tenantID).Count(&out.OrderCount)
	db.Model(model.Order{}).Where("tenant_id = ? AND status = ?", tenantID, model.OrderCompleted).
		Select("COALESCE(SUM(amount), 0)").Scan(&out.Revenue)
	db.Model(model.ManualDepositRequest{}).Where("tenant_id = ? AND status = ?", tenantID, model.ManualDepositPending).Count(&out.PendingDeposits)
	db.Model(model.Ticket{}).Where("tenant_id = ? AND status = ?", tenantID, model.TicketStatusOpen).Count(&out.OpenTickets)
	return out, nil
}

// SetStatus suspends or re-activates a workspace.
func (s *ManagerService) SetStatus(tenantID int, status string) error {
	if status != model.TenantActive && status != model.TenantSuspended {
		return errors.New("invalid status")
	}
	return s.update(tenantID, map[string]any{"status": status})
}

// AllocateBandwidth sets the workspace's resell quota in bytes (0 = unlimited).
func (s *ManagerService) AllocateBandwidth(tenantID int, quotaBytes int64) error {
	if quotaBytes < 0 {
		quotaBytes = 0
	}
	return s.update(tenantID, map[string]any{"bandwidth_quota_bytes": quotaBytes})
}

// SetDomain assigns (or clears, when blank) a workspace's custom domain. The
// domain is validated and must be globally unique across tenants.
func (s *ManagerService) SetDomain(tenantID int, domain string) error {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain != "" {
		if !domainPattern.MatchString(domain) {
			return ErrDomainInvalid
		}
		var count int64
		if err := database.GetDB().Model(model.Tenant{}).
			Where("domain = ? AND id <> ?", domain, tenantID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrDomainTaken
		}
	}
	return s.update(tenantID, map[string]any{"domain": domain})
}

// RotateApiKey issues a fresh API key, stores its hash, and returns the new
// plaintext exactly once.
func (s *ManagerService) RotateApiKey(tenantID int) (string, error) {
	plain := random.Seq(managerApiKeyLength)
	if err := s.update(tenantID, map[string]any{"api_key_hash": crypto.HashTokenSHA256(plain)}); err != nil {
		return "", err
	}
	return plain, nil
}

// Delete removes a workspace and its manager account in one transaction. The
// tenant-scoped data (clients/orders/...) is intentionally left in place — it
// stays visible to the admin (global scope) and can be reassigned; purging it is
// a separate, deliberate admin action.
func (s *ManagerService) Delete(tenantID int) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var t model.Tenant
		if err := tx.Where("id = ?", tenantID).First(&t).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTenantNotFound
			}
			return err
		}
		if err := tx.Where("id = ?", t.ManagerUserId).Delete(model.User{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", tenantID).Delete(model.Tenant{}).Error
	})
}

// update applies a column patch to a tenant, returning ErrTenantNotFound when no
// row matched.
func (s *ManagerService) update(tenantID int, patch map[string]any) error {
	if tenantID <= model.GlobalTenantId {
		return ErrTenantNotFound
	}
	res := database.GetDB().Model(model.Tenant{}).Where("id = ?", tenantID).Updates(patch)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrTenantNotFound
	}
	return nil
}
