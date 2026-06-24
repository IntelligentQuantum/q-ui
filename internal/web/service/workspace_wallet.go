package service

import (
	"errors"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"

	"gorm.io/gorm"
)

// Treasury errors. ErrInsufficientTreasury mirrors ErrInsufficientBalance for the
// workspace ledger; ErrNotTenantScoped guards against treasury ops on the
// global/admin scope (tenant 0 has no treasury).
var (
	ErrInsufficientTreasury = errors.New("insufficient workspace balance")
	ErrNotTenantScoped      = errors.New("operation requires a workspace scope")
)

// WorkspaceWalletService owns the workspace TREASURY — a per-tenant balance kept
// physically separate from any personal User.Balance (a different table mutated by
// a different service), so workspace funds and a manager's personal account can
// never mix. Every change is a compare-and-swap with a matching
// model.WorkspaceTransaction, exactly like WalletService does for User.Balance.
//
// Standalone ops (admin top-up, settlement, manual adjust) use the public
// Credit/Debit/Set methods. CROSS-LEDGER transfers (a sale that moves money from a
// buyer's User.Balance into the treasury, and its refund) apply the treasury leg via
// applyTreasuryDelta INSIDE the same DB transaction as the user-balance leg — see
// WalletService.DebitWorkspacePurchase / RefundWorkspacePurchase — so a transfer is
// all-or-nothing. Funding a customer's prepaid wallet (TenantUserService.AdjustBalance)
// deliberately does NOT touch the treasury: the workspace earns its margin when the
// customer spends, not when their wallet is topped up.
type WorkspaceWalletService struct{}

// GuardTenant rejects the global/admin scope: the treasury is a per-workspace
// concept that never exists for tenant 0.
func (s *WorkspaceWalletService) GuardTenant(tenantID int) error {
	if tenantID <= model.GlobalTenantId {
		return ErrNotTenantScoped
	}
	return nil
}

// GetTreasuryBalance returns a workspace's treasury balance (0 when no wallet has
// been provisioned yet).
func (s *WorkspaceWalletService) GetTreasuryBalance(tenantID int) (int64, error) {
	var w model.WorkspaceWallet
	err := database.GetDB().Select("balance").Where("tenant_id = ?", tenantID).First(&w).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return w.Balance, nil
}

// ensureWallet returns the tenant's treasury row inside tx, lazily creating a
// zero-balance one on first use. The provisioning migration + tenant-create path
// pre-create wallets, so the lazy create is a rarely-hit fallback.
func (s *WorkspaceWalletService) ensureWallet(tx *gorm.DB, tenantID int) (*model.WorkspaceWallet, error) {
	var w model.WorkspaceWallet
	err := tx.Where("tenant_id = ?", tenantID).First(&w).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		w = model.WorkspaceWallet{TenantId: tenantID, Balance: 0, Status: model.WorkspaceWalletActive}
		if cerr := tx.Create(&w).Error; cerr != nil {
			return nil, cerr
		}
		return &w, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// applyTreasuryDelta mutates a workspace treasury by delta (signed) inside tx and
// writes the matching ledger row. Mirrors WalletService.applyDelta: a compare-and-
// swap (WHERE balance = before) so concurrent debits cannot oversell, a 0-row
// result surfaces as ErrBalanceConflict for the retry wrapper, and a debit that
// would drive the balance negative returns ErrInsufficientTreasury — UNLESS
// allowNegative is set (reversals/refunds, which must always succeed and may leave
// a transiently negative, reconcilable balance when revenue was already withdrawn).
func (s *WorkspaceWalletService) applyTreasuryDelta(tx *gorm.DB, tenantID int, delta int64, txType, desc string, meta TxMeta, counterpartyUserId int, allowNegative bool) (*model.WorkspaceTransaction, error) {
	w, err := s.ensureWallet(tx, tenantID)
	if err != nil {
		return nil, err
	}
	before := w.Balance
	after := before + delta
	if after < 0 && !allowNegative {
		return nil, ErrInsufficientTreasury
	}
	res := tx.Model(&model.WorkspaceWallet{}).
		Where("tenant_id = ? AND balance = ?", tenantID, before).
		Update("balance", after)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrBalanceConflict
	}
	amount := delta
	if amount < 0 {
		amount = -amount
	}
	rec := &model.WorkspaceTransaction{
		TenantId:           tenantID,
		Amount:             amount,
		Type:               txType,
		Description:        desc,
		BalanceBefore:      before,
		BalanceAfter:       after,
		Source:             meta.Source,
		RefId:              meta.RefId,
		Actor:              meta.Actor,
		CounterpartyUserId: counterpartyUserId,
	}
	if err := tx.Create(rec).Error; err != nil {
		return nil, err
	}
	return rec, nil
}

// withRetry runs fn inside a fresh DB transaction, retrying a bounded number of
// times on a compare-and-swap conflict (shared budget with WalletService).
func (s *WorkspaceWalletService) withRetry(fn func(tx *gorm.DB) error) error {
	var err error
	for i := 0; i < walletMaxRetries; i++ {
		err = database.GetDB().Transaction(fn)
		if !errors.Is(err, ErrBalanceConflict) {
			return err
		}
	}
	return err
}

// CreditTreasury adds amount (>0) to a workspace treasury (admin top-up / inbound
// settlement). Standalone — no counterparty leg.
func (s *WorkspaceWalletService) CreditTreasury(tenantID int, amount int64, desc string, meta TxMeta) error {
	if err := s.GuardTenant(tenantID); err != nil {
		return err
	}
	if amount <= 0 {
		return ErrInvalidAmount
	}
	return s.withRetry(func(tx *gorm.DB) error {
		_, e := s.applyTreasuryDelta(tx, tenantID, amount, model.TxCredit, desc, meta, 0, false)
		return e
	})
}

// DebitTreasury subtracts amount (>0) from a workspace treasury (quota purchase /
// settlement / payout). Returns ErrInsufficientTreasury when the balance is too
// low — the treasury is never silently overdrawn here.
func (s *WorkspaceWalletService) DebitTreasury(tenantID int, amount int64, desc string, meta TxMeta) error {
	if err := s.GuardTenant(tenantID); err != nil {
		return err
	}
	if amount <= 0 {
		return ErrInvalidAmount
	}
	return s.withRetry(func(tx *gorm.DB) error {
		_, e := s.applyTreasuryDelta(tx, tenantID, -amount, model.TxDebit, desc, meta, 0, false)
		return e
	})
}

// DebitCostOfGoods debits a workspace treasury for the bandwidth cost-of-goods of
// a sale. Unlike DebitTreasury it is ALLOWED to drive the balance negative: a
// loss-leader product (priced below cost) must never block a customer's purchase —
// the manager simply runs a treasury deficit they owe the admin, which is visible
// and reconcilable.
func (s *WorkspaceWalletService) DebitCostOfGoods(tenantID int, amount int64, desc string, meta TxMeta) error {
	if err := s.GuardTenant(tenantID); err != nil {
		return err
	}
	if amount <= 0 {
		return ErrInvalidAmount
	}
	return s.withRetry(func(tx *gorm.DB) error {
		_, e := s.applyTreasuryDelta(tx, tenantID, -amount, model.TxDebit, desc, meta, 0, true)
		return e
	})
}

// SetTreasury forces a workspace treasury to target (>=0), recording the
// difference as a credit or debit. A no-op (target == current) records nothing.
func (s *WorkspaceWalletService) SetTreasury(tenantID int, target int64, desc string, meta TxMeta) error {
	if err := s.GuardTenant(tenantID); err != nil {
		return err
	}
	if target < 0 {
		return ErrInvalidAmount
	}
	return s.withRetry(func(tx *gorm.DB) error {
		w, err := s.ensureWallet(tx, tenantID)
		if err != nil {
			return err
		}
		delta := target - w.Balance
		if delta == 0 {
			return nil
		}
		txType := model.TxCredit
		if delta < 0 {
			txType = model.TxDebit
		}
		_, e := s.applyTreasuryDelta(tx, tenantID, delta, txType, desc, meta, 0, false)
		return e
	})
}

// ListTransactions returns a workspace treasury's ledger, newest-first, capped by
// limit/offset. Always tenant-scoped — a treasury history never spans workspaces.
func (s *WorkspaceWalletService) ListTransactions(tenantID, limit, offset int) ([]model.WorkspaceTransaction, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	var rows []model.WorkspaceTransaction
	err := database.GetDB().Model(&model.WorkspaceTransaction{}).
		Where("tenant_id = ?", tenantID).
		Order("id desc").Limit(limit).Offset(offset).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// tenantBandwidthCost returns the bandwidth cost-of-goods (credits) for
// provisioning trafficBytes in a workspace: the admin's per-GB rate for that
// workspace's MANAGER (plus the manager's per-account override) × GB. 0 for the
// global tenant or an unresolvable manager. This is what the manager owes the
// admin for bandwidth — distinct from the workspace's own selling price.
func tenantBandwidthCost(tenantID int, trafficBytes int64) int64 {
	if tenantID <= model.GlobalTenantId {
		return 0
	}
	var t model.Tenant
	if err := database.GetDB().Select("manager_user_id").Where("id = ?", tenantID).First(&t).Error; err != nil {
		return 0
	}
	var mgr model.User
	if err := database.GetDB().Select("role, cost_per_gb_override").Where("id = ?", t.ManagerUserId).First(&mgr).Error; err != nil {
		return 0
	}
	perGB, _ := (&SettingService{}).GetClientCostPerGBForRole(mgr.CanonicalRole())
	if mgr.CostPerGBOverride > 0 {
		perGB = mgr.CostPerGBOverride
	}
	return ComputeClientCost(0, perGB, trafficBytes)
}

// DebitProvisionBandwidth depletes a workspace's prepaid bandwidth pool by the
// cost-of-goods for trafficBytes (see tenantBandwidthCost). Called on every
// provision (store sale, direct client create, traffic reset). No-op for the
// global tenant or a zero cost. Allowed to run the treasury negative (a visible,
// reconcilable debt). Returns the amount debited so a caller can refund it.
func (s *WorkspaceWalletService) DebitProvisionBandwidth(tenantID int, trafficBytes int64, desc string, meta TxMeta) (int64, error) {
	cost := tenantBandwidthCost(tenantID, trafficBytes)
	if cost <= 0 {
		return 0, nil
	}
	if err := s.DebitCostOfGoods(tenantID, cost, desc, meta); err != nil {
		return 0, err
	}
	return cost, nil
}
