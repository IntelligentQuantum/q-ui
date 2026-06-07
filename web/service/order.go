package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mhsanaei/3x-ui/v3/database"
	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/logger"
)

// Errors returned by OrderService.
var (
	ErrOrderNotFound      = errors.New("order not found")
	ErrProductUnavailable = errors.New("product is not available for purchase")
	ErrBuyerRequired      = errors.New("buyer is required")
	ErrServiceNotFound    = errors.New("service not found")
	ErrServiceForbidden   = errors.New("you do not own this service")
)

// OrderService handles product purchases, provisioning and order history.
//
// Purchasing a product:
//  1. debits the buyer's wallet for the price (atomic, writes a Transaction),
//  2. records an Order,
//  3. when the product targets an inbound, PROVISIONS a real Xray config
//     (a client owned by the buyer) on that inbound — the same mechanism the
//     Clients page uses — so the buyer immediately has a usable subscription,
//  4. on any failure refunds the debit and cancels the order so the buyer is
//     never charged for a service they did not receive.
type OrderService struct {
	walletService  WalletService
	productService ProductService
	clientService  ClientService
	inboundService InboundService
	xrayService    XrayService
}

// Purchase buys a product for the given buyer (taken from the session, never
// from request input, so a caller cannot purchase as someone else).
func (s *OrderService) Purchase(buyer *model.User, productId int) (*model.Order, error) {
	if buyer == nil {
		return nil, ErrBuyerRequired
	}
	product, err := s.productService.Get(productId)
	if err != nil || product.Status != model.ProductActive {
		return nil, ErrProductUnavailable
	}

	var charged int64
	if product.Price > 0 {
		if _, err := s.walletService.Debit(buyer.Id, product.Price,
			fmt.Sprintf("purchase: %s (#%d)", product.Name, product.Id)); err != nil {
			return nil, err // ErrInsufficientBalance bubbles up to the controller
		}
		charged = product.Price
	}

	order := &model.Order{
		UserId:      buyer.Id,
		ProductId:   product.Id,
		ProductName: product.Name,
		Amount:      product.Price,
		Status:      model.OrderPending,
	}
	if err := database.GetDB().Create(order).Error; err != nil {
		s.refund(buyer.Id, charged, product)
		return nil, err
	}

	// Provision a real Xray config when the product targets one or more inbounds.
	if len(product.InboundIds) > 0 {
		email, provErr := s.provision(buyer, product, order.Id)
		if provErr != nil {
			s.refund(buyer.Id, charged, product)
			_ = database.GetDB().Model(&model.Order{}).Where("id = ?", order.Id).
				Update("status", model.OrderCancelled).Error
			return nil, provErr
		}
		order.ClientEmail = email
	}

	order.Status = model.OrderCompleted
	if err := database.GetDB().Model(&model.Order{}).Where("id = ?", order.Id).
		Updates(map[string]any{"status": order.Status, "client_email": order.ClientEmail}).Error; err != nil {
		logger.Warningf("order %d provisioned but final status update failed: %v", order.Id, err)
	}
	return order, nil
}

// Renew applies a product to an EXISTING service (a client the buyer owns):
// it charges the product price, records an order, then extends the config's
// expiry by the product's duration, sets its quota to the product's, resets
// usage counters and re-enables it. Used for both "renew" (same product) and
// "change plan" (a different product). Refunds and cancels on failure.
//
// Ownership: the buyer must own the target service (admins may act on any).
func (s *OrderService) Renew(buyer *model.User, productId int, email string) (*model.Order, error) {
	if buyer == nil {
		return nil, ErrBuyerRequired
	}
	product, err := s.productService.Get(productId)
	if err != nil || product.Status != model.ProductActive {
		return nil, ErrProductUnavailable
	}
	owner, err := s.clientService.GetOwnerByEmail(email)
	if err != nil {
		return nil, ErrServiceNotFound
	}
	if !buyer.IsAdmin() && owner != buyer.Id {
		return nil, ErrServiceForbidden
	}

	var charged int64
	if product.Price > 0 {
		if _, err := s.walletService.Debit(buyer.Id, product.Price,
			fmt.Sprintf("renew: %s (#%d)", product.Name, product.Id)); err != nil {
			return nil, err
		}
		charged = product.Price
	}

	order := &model.Order{
		UserId:      buyer.Id,
		ProductId:   product.Id,
		ProductName: product.Name,
		Amount:      product.Price,
		Status:      model.OrderPending,
		ClientEmail: email,
	}
	if err := database.GetDB().Create(order).Error; err != nil {
		s.refund(buyer.Id, charged, product)
		return nil, err
	}

	if err := s.applyPlan(email, product); err != nil {
		s.refund(buyer.Id, charged, product)
		_ = database.GetDB().Model(&model.Order{}).Where("id = ?", order.Id).
			Update("status", model.OrderCancelled).Error
		return nil, err
	}
	order.Status = model.OrderCompleted
	_ = database.GetDB().Model(&model.Order{}).Where("id = ?", order.Id).
		Update("status", model.OrderCompleted).Error
	return order, nil
}

// applyPlan re-sizes an existing client to a product: new expiry (extended from
// the later of now / current expiry), new quota, usage reset, re-enabled.
func (s *OrderService) applyPlan(email string, product *model.Product) error {
	rec, err := s.clientService.GetRecordByEmail(nil, email)
	if err != nil {
		return ErrServiceNotFound
	}
	updated := recordToClient(rec)
	if product.DurationDays > 0 {
		base := max(time.Now().UnixMilli(), updated.ExpiryTime)
		updated.ExpiryTime = time.UnixMilli(base).AddDate(0, 0, product.DurationDays).UnixMilli()
	} else {
		updated.ExpiryTime = 0
	}
	updated.TotalGB = product.TrafficLimit
	updated.Enable = true

	needRestart, err := s.clientService.UpdateByEmail(&s.inboundService, email, updated)
	if err != nil {
		return err
	}
	// Reset usage counters so the renewed quota starts fresh.
	if nr, rErr := s.clientService.ResetTrafficByEmail(&s.inboundService, email); rErr != nil {
		logger.Warningf("renew: reset traffic for %s failed: %v", email, rErr)
	} else if nr {
		needRestart = true
	}
	if needRestart {
		s.xrayService.SetToNeedRestart()
	}
	return nil
}

func (s *OrderService) refund(userId int, amount int64, product *model.Product) {
	if amount <= 0 {
		return
	}
	if _, err := s.walletService.Credit(userId, amount,
		fmt.Sprintf("refund (order failed): %s (#%d)", product.Name, product.Id)); err != nil {
		logger.Errorf("order: refund of %d to user %d failed (manual reconciliation needed): %v", amount, userId, err)
	}
}

// provision creates a buyer-owned Xray client on the product's inbound(s), sized
// by the product's traffic limit and duration. The single config is attached to
// every inbound the product targets. Returns the client's email.
func (s *OrderService) provision(buyer *model.User, product *model.Product, orderId int) (string, error) {
	var expiry int64
	if product.DurationDays > 0 {
		expiry = time.Now().AddDate(0, 0, product.DurationDays).UnixMilli()
	}
	payload := &ClientCreatePayload{
		Client: model.Client{
			Email:      buildClientEmail(buyer.Username, orderId),
			TotalGB:    product.TrafficLimit,
			ExpiryTime: expiry,
			Enable:     true,
		},
		InboundIds: []int(product.InboundIds),
		OwnerId:    buyer.Id,
	}
	needRestart, err := s.clientService.Create(&s.inboundService, payload)
	if err != nil {
		return "", err
	}
	if needRestart {
		s.xrayService.SetToNeedRestart()
	}
	return payload.Client.Email, nil
}

// buildClientEmail derives a unique, valid client email from the buyer's
// username and the order id. Usernames are already restricted to [A-Za-z0-9_]
// but we defensively replace any forbidden character, and append a short random
// token so retries never collide.
func buildClientEmail(username string, orderId int) string {
	u := strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ' ' || r < 0x20 || r == 0x7f {
			return '-'
		}
		return r
	}, strings.TrimSpace(username))
	if u == "" {
		u = "user"
	}
	token := strings.ReplaceAll(uuid.NewString(), "-", "")[:6]
	return fmt.Sprintf("%s-o%d-%s", u, orderId, token)
}

// ListOrders returns orders newest-first. When userId is non-nil results are
// scoped to that user (the ownership filter for resellers/members); nil returns
// every order (admin / moderator view).
func (s *OrderService) ListOrders(userId *int, limit, offset int) ([]model.Order, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	q := database.GetDB().Model(&model.Order{}).Order("id DESC").Limit(limit).Offset(offset)
	if userId != nil {
		q = q.Where("user_id = ?", *userId)
	}
	var orders []model.Order
	if err := q.Find(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}

// Get loads a single order by id.
func (s *OrderService) Get(id int) (*model.Order, error) {
	var o model.Order
	if err := database.GetDB().Where("id = ?", id).First(&o).Error; err != nil {
		return nil, ErrOrderNotFound
	}
	return &o, nil
}

// GetOrderOwner returns the user_id that owns an order, for ownership checks.
func (s *OrderService) GetOrderOwner(id int) (int, error) {
	var o model.Order
	if err := database.GetDB().Select("user_id").Where("id = ?", id).First(&o).Error; err != nil {
		return 0, ErrOrderNotFound
	}
	return o.UserId, nil
}
