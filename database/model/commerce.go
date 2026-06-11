package model

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"strings"
)

// IntList is a list of ints persisted as a comma-separated string in a single
// column (so it fits the flat settings/catalog tables) while marshaling to JSON
// as a normal array. It implements driver.Valuer/sql.Scanner so GORM stores and
// loads it transparently.
type IntList []int

// Value serializes the list to a comma-separated string ("" when empty).
func (l IntList) Value() (driver.Value, error) {
	if len(l) == 0 {
		return "", nil
	}
	parts := make([]string, len(l))
	for i, n := range l {
		parts[i] = strconv.Itoa(n)
	}
	return strings.Join(parts, ","), nil
}

// Scan parses the stored string back into the list (nil/empty -> empty list).
func (l *IntList) Scan(src any) error {
	*l = nil
	var s string
	switch v := src.(type) {
	case nil:
		return nil
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("IntList: unsupported scan type %T", src)
	}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		n, err := strconv.Atoi(part)
		if err != nil {
			return fmt.Errorf("IntList: invalid element %q: %w", part, err)
		}
		*l = append(*l, n)
	}
	return nil
}

// Product is a first-class sellable item in the catalog (a VPN plan: some
// traffic for some duration at a price). Admins and moderators manage the
// catalog; resellers and members purchase from it.
type Product struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Name         string `json:"name" gorm:"not null"`
	Description  string `json:"description" gorm:"default:''"`                      // optional marketing/notes text shown in the store
	TrafficLimit int64  `json:"trafficLimit" gorm:"column:traffic_limit;default:0"` // bytes; 0 = unlimited
	DurationDays int    `json:"durationDays" gorm:"column:duration_days;default:0"` // 0 = no expiry
	Price        int64  `json:"price" gorm:"not null;default:0"`                    // credits
	// Audience controls which buyer role sees/can purchase this product in the
	// store: "all" (everyone), "reseller" (resellers only), or "member" (members
	// only). admin/moderator always see every product. Default "all" keeps every
	// existing product visible to everyone.
	Audience string `json:"audience" gorm:"index;default:'all'"`
	// InboundIds are the inbounds a purchased config (client) is provisioned on
	// (the buyer's config is attached to every one). Empty = no provisioning
	// (e.g. a pure balance/credit product) — buying it just records an order
	// without creating an Xray config.
	InboundIds IntList `json:"inboundIds" gorm:"column:inbound_ids;type:text"`
	Status     string  `json:"status" gorm:"index;default:'active'"`     // active | inactive
	CreatedBy  int     `json:"createdBy" gorm:"column:created_by;index"` // user id of creator
	CreatedAt  int64   `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt  int64   `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (Product) TableName() string { return "products" }

// Product status constants.
const (
	ProductActive   = "active"
	ProductInactive = "inactive"
)

// Product audience constants — which buyer role a product is offered to.
const (
	ProductAudienceAll      = "all"
	ProductAudienceReseller = "reseller"
	ProductAudienceMember   = "member"
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
