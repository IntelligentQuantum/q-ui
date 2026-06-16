package service

import (
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"

	"gorm.io/gorm"
)

// PaymentService persists payment-gateway attempts and flips their status
// idempotently so a balance is credited at most once per payment.
type PaymentService struct{}

// CreatePending records a new pending payment for a user/authority.
func (s *PaymentService) CreatePending(userId int, gateway, authority string, amount int64) (*model.Payment, error) {
	p := &model.Payment{
		UserId:    userId,
		Gateway:   gateway,
		Authority: authority,
		Amount:    amount,
		Status:    model.PaymentPending,
	}
	if err := database.GetDB().Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// CreateCryptoPending records a new pending crypto top-up, capturing the source
// (fiat) currency the invoice is priced in. The authority is the merchant order
// reference we send to the gateway and match callbacks against.
func (s *PaymentService) CreateCryptoPending(userId int, gateway, authority, currency string, amount int64) (*model.Payment, error) {
	p := &model.Payment{
		UserId:    userId,
		Gateway:   gateway,
		Authority: authority,
		Amount:    amount,
		Currency:  currency,
		Status:    model.PaymentPending,
	}
	if err := database.GetDB().Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// GetByAuthority loads a payment by its gateway authority.
func (s *PaymentService) GetByAuthority(authority string) (*model.Payment, error) {
	var p model.Payment
	if err := database.GetDB().Where("authority = ?", authority).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

// MarkPaid atomically transitions a payment from pending to paid. It returns
// true only for the call that performed the transition (so exactly one caller
// credits the wallet); concurrent/duplicate callbacks see false.
func (s *PaymentService) MarkPaid(authority, refID string) (bool, *model.Payment, error) {
	db := database.GetDB()
	var p model.Payment
	if err := db.Where("authority = ?", authority).First(&p).Error; err != nil {
		return false, nil, err
	}
	res := db.Model(&model.Payment{}).
		Where("authority = ? AND status = ?", authority, model.PaymentPending).
		Updates(map[string]any{"status": model.PaymentPaid, "ref_id": refID})
	if res.Error != nil {
		return false, &p, res.Error
	}
	p.Status = model.PaymentPaid
	p.RefId = refID
	return res.RowsAffected == 1, &p, nil
}

// MarkPaidWithBonus atomically transitions a payment from pending to paid and
// records the granted bonus plus the cryptocurrency actually paid (e.g. BTC),
// in a single CAS update. It returns true only for the call that performed the
// transition, so a balance (deposit + bonus) is credited at most once even
// under duplicate/replayed webhooks. A blank coin leaves the stored currency
// (the invoice fiat) untouched.
func (s *PaymentService) MarkPaidWithBonus(authority, refID, coin string, bonus int64) (bool, *model.Payment, error) {
	db := database.GetDB()
	var p model.Payment
	if err := db.Where("authority = ?", authority).First(&p).Error; err != nil {
		return false, nil, err
	}
	updates := map[string]any{"status": model.PaymentPaid, "ref_id": refID, "bonus_amount": bonus}
	if coin != "" {
		updates["currency"] = coin
	}
	res := db.Model(&model.Payment{}).
		Where("authority = ? AND status = ?", authority, model.PaymentPending).
		Updates(updates)
	if res.Error != nil {
		return false, &p, res.Error
	}
	p.Status = model.PaymentPaid
	p.RefId = refID
	p.BonusAmount = bonus
	if coin != "" {
		p.Currency = coin
	}
	return res.RowsAffected == 1, &p, nil
}

// MarkFailed flips a still-pending payment to failed (best effort).
func (s *PaymentService) MarkFailed(authority string) error {
	return database.GetDB().Model(&model.Payment{}).
		Where("authority = ? AND status = ?", authority, model.PaymentPending).
		Update("status", model.PaymentFailed).Error
}

// ListForUser returns a user's payment history, newest first.
func (s *PaymentService) ListForUser(userId, limit, offset int) ([]model.Payment, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	var rows []model.Payment
	err := database.GetDB().Where("user_id = ?", userId).
		Order("id desc").Limit(limit).Offset(offset).Find(&rows).Error
	return rows, err
}

// CryptoBucket is a grouped aggregate row (by currency or by user role).
type CryptoBucket struct {
	Key    string `json:"key"`
	Amount int64  `json:"amount"`
	Bonus  int64  `json:"bonus"`
	Count  int64  `json:"count"`
}

// CryptoReport is the admin reporting view over confirmed crypto deposits.
type CryptoReport struct {
	TotalDeposits int64           `json:"totalDeposits"`
	TotalBonus    int64           `json:"totalBonus"`
	DepositCount  int64           `json:"depositCount"`
	ByCurrency    []CryptoBucket  `json:"byCurrency"`
	ByRole        []CryptoBucket  `json:"byRole"`
	Recent        []model.Payment `json:"recent"`
}

// CryptoReport aggregates confirmed (paid) crypto deposits for the admin
// dashboard: grand totals, breakdown by currency and by buyer role, and the
// most recent deposits.
func (s *PaymentService) CryptoReport(gateway string, recentLimit int) (*CryptoReport, error) {
	db := database.GetDB()
	if recentLimit <= 0 || recentLimit > 200 {
		recentLimit = 20
	}
	rep := &CryptoReport{ByCurrency: []CryptoBucket{}, ByRole: []CryptoBucket{}, Recent: []model.Payment{}}

	base := func() *gorm.DB {
		return db.Model(&model.Payment{}).Where("gateway = ? AND status = ?", gateway, model.PaymentPaid)
	}

	var totals struct {
		Amount int64
		Bonus  int64
		Count  int64
	}
	if err := base().Select("COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(bonus_amount),0) AS bonus, COUNT(*) AS count").
		Scan(&totals).Error; err != nil {
		return nil, err
	}
	rep.TotalDeposits = totals.Amount
	rep.TotalBonus = totals.Bonus
	rep.DepositCount = totals.Count

	if err := base().
		Select("COALESCE(NULLIF(currency,''),'?') AS key, COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(bonus_amount),0) AS bonus, COUNT(*) AS count").
		Group("currency").Order("amount desc").Scan(&rep.ByCurrency).Error; err != nil {
		return nil, err
	}

	if err := base().
		Joins("JOIN users ON users.id = payments.user_id").
		Select("COALESCE(NULLIF(users.role,''),'member') AS key, COALESCE(SUM(payments.amount),0) AS amount, COALESCE(SUM(payments.bonus_amount),0) AS bonus, COUNT(*) AS count").
		Group("users.role").Order("amount desc").Scan(&rep.ByRole).Error; err != nil {
		return nil, err
	}
	// Normalize legacy role aliases (e.g. "user" -> reseller) for display.
	for i := range rep.ByRole {
		rep.ByRole[i].Key = model.NormalizeRole(rep.ByRole[i].Key)
	}

	if err := base().Order("id desc").Limit(recentLimit).Find(&rep.Recent).Error; err != nil {
		return nil, err
	}
	return rep, nil
}
