package service

import (
	"errors"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
)

// Wallet errors. Sentinels so callers can branch (e.g. the client-create path
// maps ErrInsufficientBalance to a user-facing "Insufficient balance").
var (
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrInvalidAmount       = errors.New("amount must be positive")
	ErrBalanceConflict     = errors.New("balance changed concurrently, retry")
)

// WalletService owns balance mutations and the auditable transaction log. Every
// balance change is recorded as a model.Transaction with the before/after
// snapshot, and every change is applied inside a DB transaction using a
// compare-and-swap update so concurrent debits cannot oversell a balance.
type WalletService struct{}

const walletMaxRetries = 4

// TxMeta carries accounting attribution recorded on the ledger entry: the
// canonical Source (model.TxSource*), a Reference id pointing at the originating
// record (deposit/order/payment), and the Actor for admin-initiated changes.
type TxMeta struct {
	Source string
	RefId  string
	Actor  string
}

// GetBalance returns the current balance for a user.
func (s *WalletService) GetBalance(userId int) (int64, error) {
	var u model.User
	if err := database.GetDB().Select("balance").Where("id = ?", userId).First(&u).Error; err != nil {
		return 0, err
	}
	return u.Balance, nil
}

// applyDelta mutates the balance by delta (signed) inside tx and writes the
// matching transaction row. delta>0 records a credit, delta<0 a debit. A debit
// that would drive the balance negative returns ErrInsufficientBalance. The
// balance update is a compare-and-swap (WHERE balance = before); a 0-row result
// means another writer moved the balance first and surfaces as
// ErrBalanceConflict for the retry wrapper.
func (s *WalletService) applyDelta(tx *gorm.DB, userId int, delta int64, txType, desc string, meta TxMeta) (*model.Transaction, error) {
	var u model.User
	if err := tx.Where("id = ?", userId).First(&u).Error; err != nil {
		return nil, err
	}
	before := u.Balance
	after := before + delta
	if after < 0 {
		return nil, ErrInsufficientBalance
	}
	res := tx.Model(&model.User{}).
		Where("id = ? AND balance = ?", userId, before).
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
	rec := &model.Transaction{
		UserId:        userId,
		TenantId:      u.TenantId, // ledger entry belongs to the user's workspace
		Amount:        amount,
		Type:          txType,
		Description:   desc,
		BalanceBefore: before,
		BalanceAfter:  after,
		Source:        meta.Source,
		RefId:         meta.RefId,
		Actor:         meta.Actor,
	}
	if err := tx.Create(rec).Error; err != nil {
		return nil, err
	}
	return rec, nil
}

// tenantManagerID returns the manager of `sellerTenantID` whose balance ALSO
// funds a purchase from that storefront, unless the buyer IS that manager (or the
// storefront is the global/admin store). 0 = no second charge. This models the
// manager's balance as the workspace's prepaid resource pool — every sale on a
// manager's storefront draws down both the buyer and that manager.
func (s *WalletService) tenantManagerID(sellerTenantID, buyerID int) int {
	if sellerTenantID == model.GlobalTenantId {
		return 0
	}
	var t model.Tenant
	if err := database.GetDB().Select("manager_user_id").Where("id = ?", sellerTenantID).First(&t).Error; err != nil {
		return 0
	}
	if t.ManagerUserId == buyerID {
		return 0
	}
	return t.ManagerUserId
}

// DebitWorkspacePurchase debits the buyer for `amount` and, when buying from a
// Manager storefront (sellerTenantID), debits that manager for the same amount in
// the SAME transaction — so a purchase needs BOTH the buyer and the storefront's
// pool to have enough balance, and either being short aborts the whole purchase
// (ErrInsufficientBalance). Returns the manager id charged (0 if none) so the
// caller can refund symmetrically if a later step (e.g. provisioning) fails.
func (s *WalletService) DebitWorkspacePurchase(buyer *model.User, sellerTenantID int, amount int64, desc string, meta TxMeta) (int, error) {
	if amount <= 0 {
		return 0, ErrInvalidAmount
	}
	managerID := s.tenantManagerID(sellerTenantID, buyer.Id)
	err := s.withRetry(func(tx *gorm.DB) error {
		if _, e := s.applyDelta(tx, buyer.Id, -amount, model.TxDebit, desc, meta); e != nil {
			return e
		}
		if managerID != 0 {
			mMeta := TxMeta{Source: meta.Source, RefId: meta.RefId, Actor: buyer.Username}
			if _, e := s.applyDelta(tx, managerID, -amount, model.TxDebit, desc+" — workspace pool", mMeta); e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return managerID, nil
}

// RefundWorkspacePurchase reverses DebitWorkspacePurchase: credits the buyer and,
// when managerID != 0, the workspace manager. Best-effort (used on the
// failure/rollback path); failures are surfaced to the caller's logger.
func (s *WalletService) RefundWorkspacePurchase(buyerID, managerID int, amount int64, desc string, meta TxMeta) error {
	if amount <= 0 {
		return nil
	}
	return s.withRetry(func(tx *gorm.DB) error {
		if _, e := s.applyDelta(tx, buyerID, amount, model.TxCredit, desc, meta); e != nil {
			return e
		}
		if managerID != 0 {
			if _, e := s.applyDelta(tx, managerID, amount, model.TxCredit, desc+" — workspace pool", meta); e != nil {
				return e
			}
		}
		return nil
	})
}

// withRetry runs fn inside a fresh DB transaction, retrying a bounded number of
// times when applyDelta reports a compare-and-swap conflict.
func (s *WalletService) withRetry(fn func(tx *gorm.DB) error) error {
	var err error
	for i := 0; i < walletMaxRetries; i++ {
		err = database.GetDB().Transaction(fn)
		if !errors.Is(err, ErrBalanceConflict) {
			return err
		}
	}
	return err
}

// Credit adds amount (>0) to a user's balance and records a credit transaction.
func (s *WalletService) Credit(userId int, amount int64, desc string) (*model.Transaction, error) {
	return s.CreditWithMeta(userId, amount, desc, TxMeta{})
}

// CreditWithMeta is Credit with accounting attribution (source/ref/actor) stamped
// onto the ledger entry.
func (s *WalletService) CreditWithMeta(userId int, amount int64, desc string, meta TxMeta) (*model.Transaction, error) {
	if amount <= 0 {
		return nil, ErrInvalidAmount
	}
	var rec *model.Transaction
	err := s.withRetry(func(tx *gorm.DB) error {
		r, e := s.applyDelta(tx, userId, amount, model.TxCredit, desc, meta)
		rec = r
		return e
	})
	return rec, err
}

// Debit subtracts amount (>0) from a user's balance, recording a debit
// transaction. Returns ErrInsufficientBalance when the balance is too low.
func (s *WalletService) Debit(userId int, amount int64, desc string) (*model.Transaction, error) {
	return s.DebitWithMeta(userId, amount, desc, TxMeta{})
}

// DebitWithMeta is Debit with accounting attribution.
func (s *WalletService) DebitWithMeta(userId int, amount int64, desc string, meta TxMeta) (*model.Transaction, error) {
	if amount <= 0 {
		return nil, ErrInvalidAmount
	}
	var rec *model.Transaction
	err := s.withRetry(func(tx *gorm.DB) error {
		r, e := s.applyDelta(tx, userId, -amount, model.TxDebit, desc, meta)
		rec = r
		return e
	})
	return rec, err
}

// SetBalance forces a user's balance to target (>=0), recording the difference
// as a credit or debit. A no-op (target == current) records nothing.
func (s *WalletService) SetBalance(userId int, target int64, desc string) (*model.Transaction, error) {
	return s.SetBalanceWithMeta(userId, target, desc, TxMeta{})
}

// SetBalanceWithMeta is SetBalance with accounting attribution.
func (s *WalletService) SetBalanceWithMeta(userId int, target int64, desc string, meta TxMeta) (*model.Transaction, error) {
	if target < 0 {
		return nil, ErrInvalidAmount
	}
	var rec *model.Transaction
	err := s.withRetry(func(tx *gorm.DB) error {
		var u model.User
		if e := tx.Where("id = ?", userId).First(&u).Error; e != nil {
			return e
		}
		delta := target - u.Balance
		if delta == 0 {
			rec = nil
			return nil
		}
		txType := model.TxCredit
		if delta < 0 {
			txType = model.TxDebit
		}
		r, e := s.applyDelta(tx, userId, delta, txType, desc, meta)
		rec = r
		return e
	})
	return rec, err
}

// ListTransactions returns the wallet history. When userId is non-nil it is
// scoped to that user; otherwise all transactions are returned (admin view).
// Results are newest-first and capped by limit/offset.
func (s *WalletService) ListTransactions(userId *int, limit, offset int) ([]model.Transaction, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	q := database.GetDB().Model(&model.Transaction{}).Order("id desc").Limit(limit).Offset(offset)
	if userId != nil {
		q = q.Where("user_id = ?", *userId)
	}
	var rows []model.Transaction
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
