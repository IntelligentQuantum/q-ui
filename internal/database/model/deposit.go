package model

// This file defines the manual card-to-card deposit subsystem:
//
//   - PaymentCard          — a company/admin bank card shown to buyers so they
//                            know where to transfer money. Managed by admin.
//   - ManualDepositRequest — a buyer's claim that they transferred money to one
//                            of those cards. Created Pending; an admin reviews it
//                            and Approves (credits the wallet) or Rejects (with a
//                            reason). Never credits a balance until approved.
//
// The flow deliberately mirrors the external-gateway Payment model: the request
// is recorded first and a state transition (pending -> approved) is the single
// idempotency guard that guarantees a balance is credited at most once.

// PaymentCard is a destination bank card the panel shows buyers for manual
// card-to-card top-ups. Only active cards are exposed to buyers; admins manage
// the full set and control display ordering.
type PaymentCard struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Title          string `json:"title" gorm:"default:''"`                                  // human label, e.g. "Main account"
	CardHolderName string `json:"cardHolderName" gorm:"column:card_holder_name;not null"`   // name printed on the card
	CardNumber     string `json:"cardNumber" gorm:"column:card_number;not null"`           // 16-digit PAN (stored as given)
	BankName       string `json:"bankName" gorm:"column:bank_name;default:''"`             // e.g. "Mellat"
	Iban           string `json:"iban" gorm:"column:iban;default:''"`                       // optional IBAN (Sheba)
	AccountNumber  string `json:"accountNumber" gorm:"column:account_number;default:''"`   // optional account number
	Status         string `json:"status" gorm:"index;default:'active'"`                     // active | inactive
	DisplayOrder   int    `json:"displayOrder" gorm:"column:display_order;default:0;index"` // lower = shown first
	CreatedAt      int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt      int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (PaymentCard) TableName() string { return "payment_cards" }

// PaymentCard status constants.
const (
	PaymentCardActive   = "active"
	PaymentCardInactive = "inactive"
)

// ManualDepositRequest is a buyer's manual card-to-card top-up claim. It is
// created Pending and stays that way until an admin Approves it (which credits
// the buyer's wallet and writes a Transaction) or Rejects it (with a reason, no
// credit). ApprovedBy/ApprovedAt are set on either terminal transition so the
// row is self-auditing.
type ManualDepositRequest struct {
	Id     int   `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId int   `json:"userId" gorm:"index;not null;column:user_id"`
	Amount int64 `json:"amount" gorm:"not null"` // credits requested (always positive)
	// TrackingNumber is the bank's transfer reference the buyer reports. It is
	// uniquely indexed so the same receipt can't be submitted twice (duplicate
	// detection); a blank value is allowed and not deduplicated.
	TrackingNumber string `json:"trackingNumber" gorm:"column:tracking_number;index"`
	Description    string `json:"description" gorm:"default:''"`
	// ReceiptImage is the stored filename (not a path) of the uploaded receipt,
	// served back only through the authenticated receipt endpoint. Empty when no
	// receipt was attached.
	ReceiptImage    string `json:"receiptImage" gorm:"column:receipt_image;default:''"`
	Status          string `json:"status" gorm:"index;default:'pending'"` // pending | approved | rejected
	RejectionReason string `json:"rejectionReason" gorm:"column:rejection_reason;default:''"`
	ApprovedBy      int    `json:"approvedBy" gorm:"column:approved_by;default:0"` // admin user id, 0 until reviewed
	ApprovedAt      int64  `json:"approvedAt" gorm:"column:approved_at;default:0"` // ms, 0 until reviewed
	CreatedAt       int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt       int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (ManualDepositRequest) TableName() string { return "manual_deposit_requests" }

// ManualDepositRequest status constants.
const (
	ManualDepositPending  = "pending"
	ManualDepositApproved = "approved"
	ManualDepositRejected = "rejected"
)
