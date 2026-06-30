package service

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/internal/config"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"

	"gorm.io/gorm"
)

// Manual-deposit errors. Sentinels so the controller can map each to a precise,
// localized message instead of leaking internals.
var (
	ErrDepositNotFound    = errors.New("deposit request not found")
	ErrDepositNotPending  = errors.New("deposit request is not pending")
	ErrInvalidDeposit     = errors.New("invalid deposit request")
	ErrCardNotFound       = errors.New("payment card not found")
	ErrInvalidCard        = errors.New("invalid payment card")
	ErrInvalidReceipt     = errors.New("invalid receipt file")
	ErrReceiptTooLarge    = errors.New("receipt file too large")
	ErrInvalidReceiptType = errors.New("unsupported receipt file type")
)

// MaxReceiptSize bounds an uploaded receipt image (5 MiB) so a hostile or
// fat-fingered upload can't exhaust disk/memory.
const MaxReceiptSize = 5 << 20

// LargeDepositThreshold (credits) above which an approved deposit raises an admin
// alert. Documented fraud/finance-monitoring config point.
const LargeDepositThreshold int64 = 10_000_000

// DepositService owns the company payment cards and the manual card-to-card
// deposit lifecycle. Approving a request is the ONLY path that credits a wallet,
// and it does so atomically (state transition + ledger write in one DB
// transaction) so a balance is credited at most once per request.
type DepositService struct {
	walletService       WalletService
	notificationService NotificationService
}

// formatAmount renders an integer credit amount with thousands separators, e.g.
// 1500000 -> "1,500,000". Used in notification params; the recipient's UI adds
// the localized currency unit.
func formatAmount(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	digits := strconv.FormatInt(n, 10)
	var b strings.Builder
	if neg {
		b.WriteByte('-')
	}
	pre := len(digits) % 3
	if pre > 0 {
		b.WriteString(digits[:pre])
		if len(digits) > pre {
			b.WriteByte(',')
		}
	}
	for i := pre; i < len(digits); i += 3 {
		b.WriteString(digits[i : i+3])
		if i+3 < len(digits) {
			b.WriteByte(',')
		}
	}
	return b.String()
}

// ---------------------------------------------------------------------------
// Payment cards
// ---------------------------------------------------------------------------

// CardInput is the admin-supplied payload to create/update a payment card.
type CardInput struct {
	Title          string `json:"title"`
	CardHolderName string `json:"cardHolderName"`
	CardNumber     string `json:"cardNumber"`
	BankName       string `json:"bankName"`
	Iban           string `json:"iban"`
	AccountNumber  string `json:"accountNumber"`
	DisplayOrder   int    `json:"displayOrder"`
	Status         string `json:"status"`
}

func (in *CardInput) normalize() {
	in.Title = strings.TrimSpace(in.Title)
	in.CardHolderName = strings.TrimSpace(in.CardHolderName)
	// Keep digits/spacing readable but strip stray whitespace at the ends.
	in.CardNumber = strings.TrimSpace(in.CardNumber)
	in.BankName = strings.TrimSpace(in.BankName)
	in.Iban = strings.TrimSpace(in.Iban)
	in.AccountNumber = strings.TrimSpace(in.AccountNumber)
	in.Status = model.PaymentCardActive
}

// ListCards returns payment cards ordered for display. When activeOnly is true
// only active cards are returned (the buyer view); otherwise every card is
// returned (the admin view).
func (s *DepositService) ListCards(activeOnly bool, scope model.Scope) ([]model.PaymentCard, error) {
	q := scope.Apply(database.GetDB().Model(&model.PaymentCard{})).Order("display_order asc, id asc")
	if activeOnly {
		q = q.Where("status = ?", model.PaymentCardActive)
	}
	var rows []model.PaymentCard
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// GetCard loads a single payment card.
func (s *DepositService) GetCard(id int, scope model.Scope) (*model.PaymentCard, error) {
	var card model.PaymentCard
	if err := scope.Apply(database.GetDB()).Where("id = ?", id).First(&card).Error; err != nil {
		if database.IsNotFound(err) {
			return nil, ErrCardNotFound
		}
		return nil, err
	}
	return &card, nil
}

// CreateCard adds a payment card. Card holder name and card number are required.
func (s *DepositService) CreateCard(in CardInput, scope model.Scope) (*model.PaymentCard, error) {
	in.normalize()
	if in.CardHolderName == "" || in.CardNumber == "" {
		return nil, ErrInvalidCard
	}
	card := &model.PaymentCard{
		TenantId:       scope.OwnerTenantID(),
		Title:          in.Title,
		CardHolderName: in.CardHolderName,
		CardNumber:     in.CardNumber,
		BankName:       in.BankName,
		Iban:           in.Iban,
		AccountNumber:  in.AccountNumber,
		DisplayOrder:   in.DisplayOrder,
		Status:         model.PaymentCardActive,
	}
	if err := database.GetDB().Create(card).Error; err != nil {
		return nil, err
	}
	return card, nil
}

// UpdateCard edits an existing payment card's details (status is changed via
// SetCardStatus, not here).
func (s *DepositService) UpdateCard(id int, in CardInput, scope model.Scope) (*model.PaymentCard, error) {
	in.normalize()
	if in.CardHolderName == "" || in.CardNumber == "" {
		return nil, ErrInvalidCard
	}
	card, err := s.GetCard(id, scope)
	if err != nil {
		return nil, err
	}
	card.Title = in.Title
	card.CardHolderName = in.CardHolderName
	card.CardNumber = in.CardNumber
	card.BankName = in.BankName
	card.Iban = in.Iban
	card.AccountNumber = in.AccountNumber
	card.DisplayOrder = in.DisplayOrder
	if err := scope.Apply(database.GetDB().Model(&model.PaymentCard{})).Where("id = ?", id).
		Updates(map[string]any{
			"title":            card.Title,
			"card_holder_name": card.CardHolderName,
			"card_number":      card.CardNumber,
			"bank_name":        card.BankName,
			"iban":             card.Iban,
			"account_number":   card.AccountNumber,
			"display_order":    card.DisplayOrder,
		}).Error; err != nil {
		return nil, err
	}
	return card, nil
}

// SetCardStatus activates/deactivates a card. Inactive cards are hidden from buyers.
func (s *DepositService) SetCardStatus(id int, active bool, scope model.Scope) error {
	status := model.PaymentCardInactive
	if active {
		status = model.PaymentCardActive
	}
	res := scope.Apply(database.GetDB().Model(&model.PaymentCard{})).Where("id = ?", id).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrCardNotFound
	}
	return nil
}

// DeleteCard removes a payment card.
func (s *DepositService) DeleteCard(id int, scope model.Scope) error {
	res := scope.Apply(database.GetDB()).Where("id = ?", id).Delete(&model.PaymentCard{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrCardNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Receipt files
// ---------------------------------------------------------------------------

// receiptDir is where uploaded receipt images live: a private folder next to the
// database, NEVER under the public /assets static mount, so receipts are only
// reachable through the authenticated, ownership-checked receipt endpoint.
func receiptDir() string {
	return filepath.Join(config.GetDBFolderPath(), "uploads", "receipts")
}

// ValidateReceipt content-sniffs the uploaded bytes and returns the canonical
// file extension for an allowed image type (jpg/jpeg/png/webp). It rejects
// anything else and anything over MaxReceiptSize — the byte signature, not the
// client-supplied filename or Content-Type, is what's trusted.
func ValidateReceipt(data []byte) (ext string, err error) {
	if len(data) == 0 {
		return "", ErrInvalidReceipt
	}
	if len(data) > MaxReceiptSize {
		return "", ErrReceiptTooLarge
	}
	ct := http.DetectContentType(data)
	switch {
	case ct == "image/jpeg":
		return ".jpg", nil
	case ct == "image/png":
		return ".png", nil
	case ct == "image/webp" || isWebP(data):
		return ".webp", nil
	default:
		return "", ErrInvalidReceiptType
	}
}

// isWebP recognizes the RIFF....WEBP container that http.DetectContentType does
// not always classify on older toolchains.
func isWebP(b []byte) bool {
	return len(b) >= 12 && string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP"
}

// SaveReceipt writes validated receipt bytes to a freshly named file and returns
// the bare filename to persist on the request (never a path).
func (s *DepositService) SaveReceipt(data []byte, ext string) (string, error) {
	dir := receiptDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := uuid.NewString() + ext
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		return "", err
	}
	return name, nil
}

// ReceiptFilePath resolves a stored receipt filename to its absolute path,
// rejecting any value that isn't a bare filename (path-traversal guard).
func (s *DepositService) ReceiptFilePath(filename string) (string, error) {
	if filename == "" || filepath.Base(filename) != filename {
		return "", ErrInvalidReceipt
	}
	return filepath.Join(receiptDir(), filename), nil
}

// ---------------------------------------------------------------------------
// Deposit requests
// ---------------------------------------------------------------------------

// DepositInput is the buyer-supplied payload for a new deposit request. The
// receipt is handled separately (multipart) and passed in as ReceiptImage.
type DepositInput struct {
	Amount       int64
	Description  string
	ReceiptImage string // stored filename, already validated+saved; may be empty
}

// CreateRequest records a new pending deposit. It rejects a non-positive amount;
// only an approval credits the wallet — this entry point never touches it.
func (s *DepositService) CreateRequest(userId int, in DepositInput, scope model.Scope) (*model.ManualDepositRequest, error) {
	if userId <= 0 || in.Amount <= 0 {
		return nil, ErrInvalidDeposit
	}
	req := &model.ManualDepositRequest{
		UserId:       userId,
		TenantId:     scope.OwnerTenantID(),
		Amount:       in.Amount,
		Description:  strings.TrimSpace(in.Description),
		ReceiptImage: in.ReceiptImage,
		Status:       model.ManualDepositPending,
	}
	if err := database.GetDB().Create(req).Error; err != nil {
		return nil, err
	}
	logger.Infof("[audit] manual-deposit submitted: id=%d user=%d amount=%d",
		req.Id, userId, in.Amount)

	// Notify the workspace's staff that a request is awaiting review — tenant-
	// scoped so a manager never sees another workspace's deposits (best-effort).
	var username string
	database.GetDB().Model(&model.User{}).Select("username").Where("id = ?", userId).Scan(&username)
	_ = s.notificationService.NotifyTenantAdmins(req.TenantId,
		"notifications.depositSubmitted.title",
		"notifications.depositSubmitted.body",
		model.NotificationInfo,
		"/manual-deposits",
		map[string]any{"username": username, "amount": formatAmount(in.Amount)},
	)
	return req, nil
}

// ListForUser returns a user's own deposit requests, newest first. Tenant-scoped
// in addition to the user filter so the primitive stays safe if ever reused with
// a non-self id.
func (s *DepositService) ListForUser(userId, limit, offset int, scope model.Scope) ([]model.ManualDepositRequest, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	var rows []model.ManualDepositRequest
	err := scope.Apply(database.GetDB()).Where("user_id = ?", userId).
		Order("id desc").Limit(limit).Offset(offset).Find(&rows).Error
	return rows, err
}

// ManualDepositView is the admin list row: the request joined with the
// submitting user's username and (normalized) role for display.
type ManualDepositView struct {
	model.ManualDepositRequest
	Username string `json:"username"`
	Role     string `json:"role"`
}

// ListAll returns deposit requests for the admin review queue, optionally
// filtered by status and a search term (matched against the submitter's
// username), newest first.
func (s *DepositService) ListAll(status, search string, limit, offset int, scope model.Scope) ([]ManualDepositView, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	q := scope.ApplyCol(database.GetDB().
		Table("manual_deposit_requests AS d").
		Select("d.*, u.username AS username, u.role AS role").
		Joins("LEFT JOIN users u ON u.id = d.user_id"), "d.tenant_id").
		Order("d.id desc").Limit(limit).Offset(offset)

	switch status {
	case model.ManualDepositPending, model.ManualDepositApproved, model.ManualDepositRejected:
		q = q.Where("d.status = ?", status)
	}
	if search = strings.TrimSpace(search); search != "" {
		like := "%" + search + "%"
		q = q.Where("u.username LIKE ?", like)
	}

	var views []ManualDepositView
	if err := q.Scan(&views).Error; err != nil {
		return nil, err
	}
	for i := range views {
		views[i].Role = model.NormalizeRole(views[i].Role)
	}
	return views, nil
}

// Get loads a single deposit request.
func (s *DepositService) Get(id int, scope model.Scope) (*model.ManualDepositRequest, error) {
	var req model.ManualDepositRequest
	if err := scope.Apply(database.GetDB()).Where("id = ?", id).First(&req).Error; err != nil {
		if database.IsNotFound(err) {
			return nil, ErrDepositNotFound
		}
		return nil, err
	}
	return &req, nil
}

// Approve transitions a pending request to approved and credits the buyer's
// wallet, atomically. The compare-and-swap on status (pending -> approved) is
// the single idempotency guard: only the call that flips it proceeds to credit,
// so concurrent/duplicate approvals can never double-credit. The status flip and
// the ledger write share one DB transaction, so a credit failure rolls the whole
// thing back and the request stays pending.
func (s *DepositService) Approve(adminId, id int, scope model.Scope) (*model.ManualDepositRequest, error) {
	// Surface a clear not-found/not-pending error before entering the tx. The
	// scoped Get also guarantees a manager can only approve their own tenant's
	// deposits (a cross-tenant id reads as not-found).
	if _, err := s.Get(id, scope); err != nil {
		return nil, err
	}

	var result *model.ManualDepositRequest
	err := s.walletService.withRetry(func(tx *gorm.DB) error {
		var dep model.ManualDepositRequest
		if e := scope.Apply(tx).Where("id = ?", id).First(&dep).Error; e != nil {
			return e
		}
		if dep.Status != model.ManualDepositPending {
			return ErrDepositNotPending
		}
		now := time.Now().UnixMilli()
		res := scope.Apply(tx.Model(&model.ManualDepositRequest{})).
			Where("id = ? AND status = ?", id, model.ManualDepositPending).
			Updates(map[string]any{
				"status":      model.ManualDepositApproved,
				"approved_by": adminId,
				"approved_at": now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			// Lost the race — another approval already won.
			return ErrDepositNotPending
		}
		desc := fmt.Sprintf("Manual deposit #%d approved", id)
		meta := TxMeta{Source: model.TxSourceManualDeposit, RefId: itoa(id), Actor: itoa(adminId)}
		if _, e := s.walletService.applyDelta(tx, dep.UserId, dep.Amount, model.TxCredit, desc, meta); e != nil {
			return e
		}
		dep.Status = model.ManualDepositApproved
		dep.ApprovedBy = adminId
		dep.ApprovedAt = now
		result = &dep
		return nil
	})
	if err != nil {
		return nil, err
	}
	logger.Infof("[audit] manual-deposit APPROVED: id=%d user=%d amount=%d by-admin=%d",
		result.Id, result.UserId, result.Amount, adminId)

	// Notify the buyer their balance was credited (best-effort).
	_ = s.notificationService.Notify(
		result.UserId,
		"notifications.depositApproved.title",
		"notifications.depositApproved.body",
		model.NotificationSuccess,
		"/manual-deposit",
		map[string]any{"amount": formatAmount(result.Amount)},
	)
	// Fraud/finance alert: a large deposit pings the workspace's staff and global
	// admins — never leaks into another tenant (best-effort).
	if result.Amount >= LargeDepositThreshold {
		_ = s.notificationService.NotifyTenantAdmins(result.TenantId,
			"notifications.largeDeposit.title",
			"notifications.largeDeposit.body",
			model.NotificationWarning,
			"/finance",
			map[string]any{"amount": formatAmount(result.Amount)},
		)
	}
	return result, nil
}

// Reject transitions a pending request to rejected with a reason. No balance is
// credited. The CAS on status guarantees a request can't be rejected after it
// was already approved (or vice versa).
func (s *DepositService) Reject(adminId, id int, reason string, scope model.Scope) (*model.ManualDepositRequest, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, ErrInvalidDeposit
	}
	if _, err := s.Get(id, scope); err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	res := scope.Apply(database.GetDB().Model(&model.ManualDepositRequest{})).
		Where("id = ? AND status = ?", id, model.ManualDepositPending).
		Updates(map[string]any{
			"status":           model.ManualDepositRejected,
			"rejection_reason": reason,
			"approved_by":      adminId,
			"approved_at":      now,
		})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrDepositNotPending
	}
	logger.Infof("[audit] manual-deposit REJECTED: id=%d by-admin=%d reason=%q", id, adminId, reason)

	req, gerr := s.Get(id, scope)
	if gerr == nil {
		// Notify the buyer their request was rejected, with the reason (best-effort).
		_ = s.notificationService.Notify(
			req.UserId,
			"notifications.depositRejected.title",
			"notifications.depositRejected.body",
			model.NotificationWarning,
			"/manual-deposit",
			map[string]any{"amount": formatAmount(req.Amount), "reason": reason},
		)
	}
	return req, gerr
}
