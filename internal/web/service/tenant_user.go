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
	userService   UserService
	walletService WalletService
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

// AdjustBalance applies a wallet op (add/deduct/set) to a customer's balance,
// but only for a member/reseller inside the manager's own tenant. The ledger
// entry is tenant-stamped by the wallet service, so it shows up in the manager's
// (tenant-scoped) finance reports. Returns the new balance.
func (s *TenantUserService) AdjustBalance(id int, op string, amount int64, desc, actor string, scope model.Scope) (int64, error) {
	if _, err := s.loadInScope(id, scope); err != nil {
		return 0, err
	}
	if desc == "" {
		desc = "workspace adjustment"
	}
	var err error
	switch op {
	case "add":
		_, err = s.walletService.CreditWithMeta(id, amount, desc, TxMeta{Source: model.TxSourceAdminCredit, Actor: actor})
	case "deduct":
		_, err = s.walletService.DebitWithMeta(id, amount, desc, TxMeta{Source: model.TxSourceAdminDebit, Actor: actor})
	case "set":
		_, err = s.walletService.SetBalanceWithMeta(id, amount, desc, TxMeta{Source: model.TxSourceAdminSet, Actor: actor})
	default:
		return 0, ErrInvalidBalanceOp
	}
	if err != nil {
		return 0, err
	}
	return s.walletService.GetBalance(id)
}
