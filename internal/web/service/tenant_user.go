package service

import (
	"errors"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"

	"gorm.io/gorm"
)

// Tenant-user guard sentinels.
var (
	// ErrTenantUserForbidden — the target user is outside the manager's tenant.
	ErrTenantUserForbidden = errors.New("user is outside your workspace")
	// ErrTenantRoleForbidden — a manager may only create/manage member & reseller
	// accounts, never another manager or an admin (no privilege escalation).
	ErrTenantRoleForbidden = errors.New("managers may only manage member and reseller accounts")
	// ErrInvalidBalanceOp — unknown wallet operation.
	ErrInvalidBalanceOp = errors.New("invalid balance operation")
)

// TenantUserService is the manager-scoped user-management surface (gated by
// tenant.users). It is deliberately separate from the admin UserService control
// plane: a manager may CRUD and promote between member/reseller WITHIN THEIR OWN
// tenant only, and can never touch manager/admin accounts or other tenants. It
// reuses the canonical UserService validation/creation so there is no duplicated
// logic — it only adds the tenant + role guards.
type TenantUserService struct {
	userService     UserService
	walletService   WalletService
	treasuryService WorkspaceWalletService
}

// tenantManageableRole reports whether a role is one a manager may assign/manage:
// member or reseller only.
func tenantManageableRole(role string) bool {
	switch model.NormalizeRole(role) {
	case model.RoleReseller, model.RoleMember:
		return true
	default:
		return false
	}
}

// List returns the manager's workspace users (password cleared). Scoped so a
// manager never sees another tenant's accounts.
func (s *TenantUserService) List(scope model.Scope) ([]model.User, error) {
	var users []model.User
	if err := scope.Apply(database.GetDB()).Order("id asc").Find(&users).Error; err != nil {
		return nil, err
	}
	for i := range users {
		users[i].Password = ""
	}
	return users, nil
}

// loadInScope returns the target user only when it is inside the caller's tenant
// AND is a manager-manageable role (member/reseller). Used to authorize edits and
// deletes — a manager/admin target or a foreign-tenant target is rejected.
func (s *TenantUserService) loadInScope(id int, scope model.Scope) (*model.User, error) {
	var u model.User
	if err := scope.Apply(database.GetDB()).Where("id = ?", id).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTenantUserForbidden
		}
		return nil, err
	}
	if !tenantManageableRole(u.Role) {
		return nil, ErrTenantRoleForbidden
	}
	return &u, nil
}

// Create makes a new member/reseller in the manager's tenant. The role is forced
// into the manageable set and the new account is stamped with the caller's tenant.
func (s *TenantUserService) Create(in AdminUserInput, scope model.Scope) (*model.User, error) {
	if !tenantManageableRole(in.Role) {
		return nil, ErrTenantRoleForbidden
	}
	// Create the account directly IN this workspace so per-workspace uniqueness is
	// checked against the right tenant (the same username may exist elsewhere).
	in.TenantID = scope.OwnerTenantID()
	var user *model.User
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		u, err := s.userService.adminCreateUserTx(tx, in)
		if err != nil {
			return err
		}
		if err := tx.Model(model.User{}).Where("id = ?", u.Id).
			Update("tenant_id", scope.OwnerTenantID()).Error; err != nil {
			return err
		}
		u.TenantId = scope.OwnerTenantID()
		user = u
		return nil
	})
	if err != nil {
		return nil, err
	}
	user.Password = ""
	return user, nil
}

// Update edits a member/reseller in the manager's tenant. Both the existing
// account and the requested new role must be manageable, so a manager can never
// promote a user to manager/admin or edit an account outside their tenant.
func (s *TenantUserService) Update(id int, in AdminUserInput, scope model.Scope) (*model.User, error) {
	if _, err := s.loadInScope(id, scope); err != nil {
		return nil, err
	}
	if !tenantManageableRole(in.Role) {
		return nil, ErrTenantRoleForbidden
	}
	// AdminUpdateUser never mutates tenant_id, so the account stays in this tenant.
	return s.userService.AdminUpdateUser(id, in)
}

// Delete removes a member/reseller in the manager's tenant.
func (s *TenantUserService) Delete(id int, scope model.Scope) error {
	if _, err := s.loadInScope(id, scope); err != nil {
		return err
	}
	return s.userService.DeleteUser(id)
}

// AdjustBalance applies a wallet op (add/deduct/set) to a customer's balance, only
// for a member/reseller inside the manager's own tenant. In a real workspace the
// change is funded by (or returned to) the workspace TREASURY in the SAME
// transaction — so a manager can never mint customer credit from nowhere and the
// books stay balanced. The admin/global scope (tenant 0) has no treasury and keeps
// the plain single-ledger behaviour. Returns the customer's new balance.
func (s *TenantUserService) AdjustBalance(id int, op string, amount int64, desc, actor string, scope model.Scope) (int64, error) {
	if _, err := s.loadInScope(id, scope); err != nil {
		return 0, err
	}
	if amount < 0 {
		return 0, ErrInvalidAmount
	}
	if op != "add" && op != "deduct" && op != "set" {
		return 0, ErrInvalidBalanceOp
	}
	if desc == "" {
		desc = "workspace adjustment"
	}
	tenantID := scope.OwnerTenantID()
	useTreasury := tenantID > model.GlobalTenantId

	err := s.walletService.withRetry(func(tx *gorm.DB) error {
		var u model.User
		if e := tx.Where("id = ?", id).First(&u).Error; e != nil {
			return e
		}
		var delta int64
		switch op {
		case "add":
			delta = amount
		case "deduct":
			delta = -amount
		case "set":
			delta = amount - u.Balance
		}
		if delta == 0 {
			return nil
		}
		custType := model.TxCredit
		if delta < 0 {
			custType = model.TxDebit
		}
		if _, e := s.walletService.applyDelta(tx, id, delta, custType, desc, TxMeta{Source: adjustSource(op, delta), Actor: actor}); e != nil {
			return e
		}
		if useTreasury {
			// Treasury moves OPPOSITE the customer: gifting credit costs the
			// workspace, deducting returns funds to it. Allowed to go transiently
			// negative so a manager can always correct a customer balance even if the
			// workspace revenue was already withdrawn (visible and reconcilable).
			tDelta := -delta
			tType := model.TxCredit
			if tDelta < 0 {
				tType = model.TxDebit
			}
			if _, e := s.treasuryService.applyTreasuryDelta(tx, tenantID, tDelta, tType, desc, TxMeta{Source: model.WsSourceCustomerAdjust, Actor: actor}, id, true); e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return s.walletService.GetBalance(id)
}

// adjustSource maps a tenant-user balance op + computed delta to the canonical
// per-user ledger source.
func adjustSource(op string, delta int64) string {
	if op == "set" {
		return model.TxSourceAdminSet
	}
	if delta < 0 {
		return model.TxSourceAdminDebit
	}
	return model.TxSourceAdminCredit
}
