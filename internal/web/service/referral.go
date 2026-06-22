package service

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/util/random"
	"gorm.io/gorm"
)

// Referral errors. Sentinel values so callers can map to user-facing messages.
var (
	ErrReferralCodeFormat  = errors.New("invalid referral code format")
	ErrReferralCodeTaken   = errors.New("referral code already in use")
	ErrReferralNotReseller = errors.New("referral codes can only be assigned to resellers")
)

// referralCodeRegex constrains codes to 4–32 chars of upper letters, digits,
// underscore and hyphen. The frontend capture logic mirrors this exactly so a
// spoofed/garbage `?ref=` value never reaches the backend as a "valid" code.
var referralCodeRegex = regexp.MustCompile(`^[A-Z0-9_-]{4,32}$`)

// ReferralService owns referral-code assignment, first-party attribution at
// registration, and the reseller/admin reporting. It is stateless.
type ReferralService struct{}

// NormalizeCode upper-cases and trims a referral code so lookups and storage are
// case-insensitive ("arash123" and "ARASH123" are the same code).
func (s *ReferralService) NormalizeCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// ReferredCustomer is one row in a reseller's customer roster (the "My Customers"
// page). Read-only, safe fields only.
type ReferredCustomer struct {
	Id        int    `json:"id"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	Balance   int64  `json:"balance"`
	CreatedAt int64  `json:"createdAt"`
}

// ListReferredCustomers returns the users a reseller brought in
// (referred_by_user_id == resellerId), newest-first. The predicate inherently
// confines results to the caller's own referrals, so no extra scope is needed.
func (s *ReferralService) ListReferredCustomers(resellerId int) ([]ReferredCustomer, error) {
	var rows []ReferredCustomer
	if err := database.GetDB().Model(&model.User{}).
		Select("id, username, role, balance, created_at").
		Where("referred_by_user_id = ?", resellerId).
		Order("created_at DESC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].Role = model.NormalizeRole(rows[i].Role)
	}
	return rows, nil
}

// ValidateCodeFormat reports whether a (normalized) code matches the allowed
// shape. Validation is intentionally cheap and total — no DB access.
func (s *ReferralService) ValidateCodeFormat(code string) bool {
	return referralCodeRegex.MatchString(code)
}

// ResolveReseller looks up the enabled reseller that owns the given code. It
// returns (nil, nil) when the code is blank, malformed, unknown, disabled, or
// owned by a non-reseller — i.e. "no valid referral", never an error the caller
// must handle. This is the single source of truth for "is this code usable".
func (s *ReferralService) ResolveReseller(code string) (*model.User, error) {
	norm := s.NormalizeCode(code)
	if norm == "" || !s.ValidateCodeFormat(norm) {
		return nil, nil
	}
	db := database.GetDB()
	var reseller model.User
	err := db.Model(model.User{}).
		Where("referral_code = ? AND referral_enabled = ?", norm, true).
		First(&reseller).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// Only resellers (and never any other role) may own/attribute referrals.
	if reseller.CanonicalRole() != model.RoleReseller {
		return nil, nil
	}
	return &reseller, nil
}

// Attribute applies FIRST-TOUCH, IMMUTABLE attribution for a freshly-registered
// user. It is best-effort by contract: callers ignore the error so a referral
// problem can NEVER block or roll back a registration.
//
// Security invariants enforced here:
//   - code must resolve to an enabled reseller (ResolveReseller),
//   - no self-referral (reseller != the new user),
//   - write only if the user has no prior attribution (idempotent / immutable),
//   - the referrals.referred_user_id unique index is the hard backstop against
//     reassignment / hijacking / loops even under a race.
func (s *ReferralService) Attribute(referredUserID int, code string) error {
	reseller, err := s.ResolveReseller(code)
	if err != nil {
		return err
	}
	if reseller == nil {
		return nil // no valid referral — registration proceeds with no owner
	}
	if reseller.Id == referredUserID {
		return nil // self-referral is silently ignored
	}

	db := database.GetDB()
	// Referrals never cross workspaces: a code only attributes a user who
	// registered in the SAME workspace as the reseller. (A reseller in workspace A
	// cannot earn commission on a signup in workspace B — they are unrelated.)
	var referred model.User
	if err := db.Select("tenant_id").Where("id = ?", referredUserID).First(&referred).Error; err != nil {
		return err
	}
	if referred.TenantId != reseller.TenantId {
		return nil
	}
	return db.Transaction(func(tx *gorm.DB) error {
		// Immutability: never overwrite an existing attribution.
		var existing int64
		if err := tx.Model(&model.Referral{}).
			Where("referred_user_id = ?", referredUserID).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return nil
		}
		ref := &model.Referral{
			ResellerId:     reseller.Id,
			TenantId:       reseller.TenantId, // attribution belongs to the reseller's workspace
			ReferredUserId: referredUserID,
			ReferralCode:   s.NormalizeCode(code),
		}
		if err := tx.Create(ref).Error; err != nil {
			return err
		}
		// Denormalized pointer on the user row for cheap reporting joins.
		return tx.Model(&model.User{}).
			Where("id = ? AND referred_by_user_id = 0", referredUserID).
			Update("referred_by_user_id", reseller.Id).Error
	})
}

// codeTakenByOther reports whether `code` is already used by a user other than
// userID (uniqueness is enforced in the service, not by a DB unique index).
func (s *ReferralService) codeTakenByOther(code string, userID int) (bool, error) {
	db := database.GetDB()
	var count int64
	err := db.Model(model.User{}).
		Where("referral_code = ? AND id <> ?", code, userID).
		Count(&count).Error
	return count > 0, err
}

// SetCode assigns (or edits) a reseller's referral code. Admin-only operation.
// Validates format, reseller role, and uniqueness. An empty code clears it.
func (s *ReferralService) SetCode(userID int, rawCode string) error {
	db := database.GetDB()
	var user model.User
	if err := db.Model(model.User{}).Where("id = ?", userID).First(&user).Error; err != nil {
		return err
	}
	if user.CanonicalRole() != model.RoleReseller {
		return ErrReferralNotReseller
	}
	norm := s.NormalizeCode(rawCode)
	if norm == "" {
		return db.Model(&model.User{}).Where("id = ?", userID).Update("referral_code", "").Error
	}
	if !s.ValidateCodeFormat(norm) {
		return ErrReferralCodeFormat
	}
	taken, err := s.codeTakenByOther(norm, userID)
	if err != nil {
		return err
	}
	if taken {
		return ErrReferralCodeTaken
	}
	return db.Model(&model.User{}).Where("id = ?", userID).Update("referral_code", norm).Error
}

// SetEnabled toggles a reseller's code on/off without deleting it. Admin-only.
func (s *ReferralService) SetEnabled(userID int, enabled bool) error {
	return database.GetDB().Model(&model.User{}).Where("id = ?", userID).Update("referral_enabled", enabled).Error
}

// EnsureCode returns the reseller's code, generating a unique one from their
// username on first use. Lets a reseller "just have a link" without admin setup.
func (s *ReferralService) EnsureCode(user *model.User) (string, error) {
	if code := s.NormalizeCode(user.ReferralCode); code != "" {
		return code, nil
	}
	code, err := s.generateUniqueCode(user)
	if err != nil {
		return "", err
	}
	if err := database.GetDB().Model(&model.User{}).Where("id = ?", user.Id).Update("referral_code", code).Error; err != nil {
		return "", err
	}
	user.ReferralCode = code
	return code, nil
}

// generateUniqueCode derives a base from the username (kept to [A-Z0-9], padded
// if short) and appends a random numeric suffix, retrying until unique.
func (s *ReferralService) generateUniqueCode(user *model.User) (string, error) {
	base := strings.ToUpper(regexp.MustCompile(`[^A-Za-z0-9]`).ReplaceAllString(user.Username, ""))
	if len(base) > 12 {
		base = base[:12]
	}
	for len(base) < 4 {
		base += "X"
	}
	for range 20 {
		candidate := fmt.Sprintf("%s%04d", base, random.Num(10000))
		if len(candidate) > 32 {
			candidate = candidate[:32]
		}
		taken, err := s.codeTakenByOther(candidate, user.Id)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", errors.New("could not generate a unique referral code")
}

// ResellerReferral is one row in the admin referral-management table: a reseller
// with their code, enabled flag, and headline stats.
type ResellerReferral struct {
	Id             int    `json:"id"`
	Username       string `json:"username"`
	Code           string `json:"code"`
	Enabled        bool   `json:"enabled"`
	TotalReferrals int64  `json:"totalReferrals"`
	PurchasedUsers int64  `json:"purchasedUsers"`
	Revenue        int64  `json:"revenue"`
}

// ListResellers returns every reseller with their referral code/enabled flag and
// headline stats, for the admin referral-management page. Stats are computed per
// reseller (bounded — resellers are few relative to customers).
func (s *ReferralService) ListResellers() ([]ResellerReferral, error) {
	var users []model.User
	if err := database.GetDB().
		Where("role IN ?", []string{model.RoleReseller}).
		Order("username asc").Find(&users).Error; err != nil {
		return nil, err
	}
	out := make([]ResellerReferral, 0, len(users))
	for i := range users {
		u := users[i]
		st, _ := s.Stats(u.Id)
		out = append(out, ResellerReferral{
			Id:             u.Id,
			Username:       u.Username,
			Code:           s.NormalizeCode(u.ReferralCode),
			Enabled:        u.ReferralEnabled,
			TotalReferrals: st.TotalReferrals,
			PurchasedUsers: st.PurchasedUsers,
			Revenue:        st.Revenue,
		})
	}
	return out, nil
}

// ReferralStats is the reseller/admin report payload.
type ReferralStats struct {
	TotalReferrals  int64 `json:"totalReferrals"`  // accounts attributed to this reseller
	RegisteredUsers int64 `json:"registeredUsers"` // same set, named for the dashboard
	ActiveUsers     int64 `json:"activeUsers"`     // referred users who placed any order
	PurchasedUsers  int64 `json:"purchasedUsers"`  // referred users with a paid/completed order
	Revenue         int64 `json:"revenue"`         // credits from paid/completed orders by them
}

// Stats computes the referral report for a single reseller. All counts are
// scoped to users whose referred_by_user_id == resellerID.
func (s *ReferralService) Stats(resellerID int) (ReferralStats, error) {
	db := database.GetDB()
	var out ReferralStats

	if err := db.Model(&model.Referral{}).Where("reseller_id = ?", resellerID).Count(&out.TotalReferrals).Error; err != nil {
		return out, err
	}
	out.RegisteredUsers = out.TotalReferrals

	referredIDs := db.Model(&model.User{}).Select("id").Where("referred_by_user_id = ?", resellerID)

	if err := db.Model(&model.Order{}).
		Where("user_id IN (?)", referredIDs).
		Distinct("user_id").Count(&out.ActiveUsers).Error; err != nil {
		return out, err
	}
	paid := []string{"paid", "completed"}
	if err := db.Model(&model.Order{}).
		Where("user_id IN (?) AND status IN ?", referredIDs, paid).
		Distinct("user_id").Count(&out.PurchasedUsers).Error; err != nil {
		return out, err
	}
	var revenue *int64
	if err := db.Model(&model.Order{}).
		Where("user_id IN (?) AND status IN ?", referredIDs, paid).
		Select("COALESCE(SUM(amount),0)").Scan(&revenue).Error; err != nil {
		return out, err
	}
	if revenue != nil {
		out.Revenue = *revenue
	}
	return out, nil
}

// logAttributeError centralizes the best-effort logging used by Register so a
// referral failure is observable but never user-visible.
func logAttributeError(referredUserID int, code string, err error) {
	if err != nil {
		logger.Warningf("referral attribution failed for user %d (code %q): %v", referredUserID, code, err)
	}
}
