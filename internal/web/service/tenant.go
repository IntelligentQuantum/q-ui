package service

import (
	"errors"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/util/crypto"

	"gorm.io/gorm"
)

// ErrTenantNotFound is returned when a lookup matches no tenant.
var ErrTenantNotFound = errors.New("tenant not found")

// TenantService owns reads/writes of the Tenant (Manager workspace) table. It is
// stateless; every method opens the shared DB via database.GetDB(). Lookups
// return ErrTenantNotFound (not gorm.ErrRecordNotFound) so callers map cleanly
// to a 404/forbidden without importing gorm.
type TenantService struct{}

// GetByID loads a tenant by primary key.
func (s *TenantService) GetByID(id int) (*model.Tenant, error) {
	if id <= model.GlobalTenantId {
		return nil, ErrTenantNotFound
	}
	var t model.Tenant
	err := database.GetDB().Where("id = ?", id).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetByManagerUserID loads the tenant a Manager owns (one per manager).
func (s *TenantService) GetByManagerUserID(userID int) (*model.Tenant, error) {
	if userID <= 0 {
		return nil, ErrTenantNotFound
	}
	var t model.Tenant
	err := database.GetDB().Where("manager_user_id = ?", userID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetBySlug loads a tenant by its (normalized) URL slug.
func (s *TenantService) GetBySlug(slug string) (*model.Tenant, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if slug == "" {
		return nil, ErrTenantNotFound
	}
	var t model.Tenant
	err := database.GetDB().Where("slug = ?", slug).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// DomainExists reports whether an ACTIVE tenant owns the given host as its custom
// domain. Used by the host validator to admit a Manager's own domain alongside
// the global webDomain. Cheap, exact-match lookup; empty host never matches.
func (s *TenantService) DomainExists(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	var count int64
	database.GetDB().Model(&model.Tenant{}).
		Where("domain = ? AND status = ?", host, model.TenantActive).Count(&count)
	return count > 0
}

// ManagerByApiKey resolves a presented Bearer token to the owning Manager user
// when it matches an ACTIVE tenant's API key (stored as a SHA-256 hash). Returns
// ErrTenantNotFound when no active tenant matches or the manager is missing. This
// is what makes each Manager's unique API key authenticate as that manager
// (scoped to their workspace by the tenant middleware).
func (s *TenantService) ManagerByApiKey(token string) (*model.User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrTenantNotFound
	}
	hash := crypto.HashTokenSHA256(token)
	var t model.Tenant
	err := database.GetDB().Where("api_key_hash = ? AND status = ?", hash, model.TenantActive).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, err
	}
	var u model.User
	if err := database.GetDB().Where("id = ?", t.ManagerUserId).First(&u).Error; err != nil {
		return nil, ErrTenantNotFound
	}
	return &u, nil
}

// RecalculateBandwidthUsage rolls each tenant's client traffic (up+down) up into
// tenants.bandwidth_used_bytes, so the admin's allocation view reflects real
// consumption. Run periodically. Clients are joined to traffic by email; tenants
// with no traffic reset to 0. The global tenant (0) is skipped.
func (s *TenantService) RecalculateBandwidthUsage() error {
	db := database.GetDB()
	type row struct {
		Tid  int
		Used int64
	}
	var rows []row
	if err := db.Table("clients AS c").
		Joins("JOIN client_traffics ct ON ct.email = c.email").
		Where("c.tenant_id <> ?", model.GlobalTenantId).
		Group("c.tenant_id").
		Select("c.tenant_id AS tid, COALESCE(SUM(ct.up + ct.down),0) AS used").
		Scan(&rows).Error; err != nil {
		return err
	}
	used := make(map[int]int64, len(rows))
	for _, r := range rows {
		used[r.Tid] = r.Used
	}
	var tenants []model.Tenant
	if err := db.Select("id").Find(&tenants).Error; err != nil {
		return err
	}
	for _, t := range tenants {
		if err := db.Model(&model.Tenant{}).Where("id = ?", t.Id).
			Update("bandwidth_used_bytes", used[t.Id]).Error; err != nil {
			return err
		}
	}
	return nil
}

// OverBandwidthQuota reports whether a tenant has consumed its admin-allocated
// bandwidth quota (0 quota = unlimited, never over). Used to gate a manager's
// provisioning of new services. The global tenant is never over quota.
func (s *TenantService) OverBandwidthQuota(tenantID int) bool {
	if tenantID <= model.GlobalTenantId {
		return false
	}
	t, err := s.GetByID(tenantID)
	if err != nil {
		return false
	}
	return t.BandwidthQuotaBytes > 0 && t.BandwidthUsedBytes >= t.BandwidthQuotaBytes
}

// GetByDomain loads a tenant by its custom domain (used for Host-header tenant
// resolution). Empty domain never matches.
func (s *TenantService) GetByDomain(domain string) (*model.Tenant, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, ErrTenantNotFound
	}
	var t model.Tenant
	err := database.GetDB().Where("domain = ?", domain).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}
