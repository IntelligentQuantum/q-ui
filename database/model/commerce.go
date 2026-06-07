package model

// Product is a first-class sellable item in the catalog (a VPN plan: some
// traffic for some duration at a price). Admins and moderators manage the
// catalog; resellers and members purchase from it.
type Product struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Name         string `json:"name" gorm:"not null"`
	TrafficLimit int64  `json:"trafficLimit" gorm:"column:traffic_limit;default:0"` // bytes; 0 = unlimited
	DurationDays int    `json:"durationDays" gorm:"column:duration_days;default:0"` // 0 = no expiry
	Price        int64  `json:"price" gorm:"not null;default:0"`                    // credits
	// InboundId is the inbound a purchased config (client) is provisioned on.
	// 0 = no provisioning (e.g. a pure balance/credit product) — buying it just
	// records an order without creating an Xray config.
	InboundId int    `json:"inboundId" gorm:"column:inbound_id;default:0"`
	Status    string `json:"status" gorm:"index;default:'active'"`     // active | inactive
	CreatedBy int    `json:"createdBy" gorm:"column:created_by;index"` // user id of creator
	CreatedAt int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (Product) TableName() string { return "products" }

// Product status constants.
const (
	ProductActive   = "active"
	ProductInactive = "inactive"
)

// Order records a purchase of a product by a user. The amount is captured at
// purchase time (so later price changes never rewrite history). An order is
// owned by user_id, which is how ownership filtering scopes it.
type Order struct {
	Id        int `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int `json:"userId" gorm:"index;not null;column:user_id"`
	ProductId int `json:"productId" gorm:"index;not null;column:product_id"`
	// ProductName is the product's name captured at purchase time so order
	// history stays readable even if the product is later renamed or deleted.
	ProductName string `json:"productName" gorm:"column:product_name;default:''"`
	Amount      int64  `json:"amount" gorm:"not null"`                // credits charged, snapshot of product price
	Status      string `json:"status" gorm:"index;default:'pending'"` // pending | paid | completed | cancelled
	// ClientEmail is the email of the Xray config (client) provisioned for this
	// order, linking the purchase to the actual service the buyer received.
	// Empty when the product does not provision a config.
	ClientEmail string `json:"clientEmail" gorm:"column:client_email;default:''"`
	CreatedAt   int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt   int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (Order) TableName() string { return "orders" }

// Order status constants.
const (
	OrderPending   = "pending"
	OrderPaid      = "paid"
	OrderCompleted = "completed"
	OrderCancelled = "cancelled"
)
