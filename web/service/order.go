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
	settingService SettingService
}

// payReferralCommission credits the referring reseller a configurable percentage
// of a completed paid order. Best-effort: any problem is logged, never surfaced
// to the buyer, and never affects the purchase. Guards: the order must have been
// charged (Amount > 0), the buyer must have a referrer, the referrer must still
// be a reseller, and the configured percentage must be positive.
func (s *OrderService) payReferralCommission(buyer *model.User, order *model.Order) {
	if order == nil || order.Amount <= 0 || buyer == nil || buyer.ReferredByUserId <= 0 {
		return
	}
	percent, err := s.settingService.GetReferralCommissionPercent()
	if err != nil || percent <= 0 {
		return
	}
	var referrer model.User
	if err := database.GetDB().Where("id = ?", buyer.ReferredByUserId).First(&referrer).Error; err != nil {
		return
	}
	// Only an account that is still a reseller earns commission.
	if referrer.CanonicalRole() != model.RoleReseller {
		return
	}
	commission := order.Amount * int64(percent) / 100
	if commission <= 0 {
		return
	}
	if _, err := s.walletService.CreditWithMeta(referrer.Id, commission,
		fmt.Sprintf("referral commission %d%% — %s order #%d", percent, buyer.Username, order.Id),
		TxMeta{Source: model.TxSourceReferral, RefId: fmt.Sprintf("%d", order.Id), Actor: buyer.Username}); err != nil {
		logger.Errorf("order: referral commission of %d to reseller %d failed: %v", commission, referrer.Id, err)
	}
}

// Purchase buys a product for the given buyer (taken from the session, never
// from request input, so a caller cannot purchase as someone else). name is the
// buyer-chosen config name (the client "email"); blank falls back to an
// auto-generated name.
func (s *OrderService) Purchase(buyer *model.User, productId int, name string) (*model.Order, error) {
	if buyer == nil {
		return nil, ErrBuyerRequired
	}
	product, err := s.productService.Get(productId)
	if err != nil || product.Status != model.ProductActive {
		return nil, ErrProductUnavailable
	}
	// Audience gate: a buyer may only purchase products targeted at their role
	// ("all" or their own). admin/moderator manage the catalog and may buy any.
	if !buyer.Can(model.PermProductManage) && !ProductAudienceAllows(product.Audience, buyer.CanonicalRole()) {
		return nil, ErrProductUnavailable
	}

	var charged int64
	if product.Price > 0 {
		if _, err := s.walletService.DebitWithMeta(buyer.Id, product.Price,
			fmt.Sprintf("purchase: %s (#%d)", product.Name, product.Id),
			TxMeta{Source: model.TxSourcePurchase, RefId: fmt.Sprintf("%d", product.Id), Actor: buyer.Username}); err != nil {
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
		email, provErr := s.provision(buyer, product, order.Id, name)
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
	// Reward the referring reseller (if any) once the purchase is complete.
	s.payReferralCommission(buyer, order)
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
	// Audience gate: a buyer may only purchase products targeted at their role
	// ("all" or their own). admin/moderator manage the catalog and may buy any.
	if !buyer.Can(model.PermProductManage) && !ProductAudienceAllows(product.Audience, buyer.CanonicalRole()) {
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
		if _, err := s.walletService.DebitWithMeta(buyer.Id, product.Price,
			fmt.Sprintf("renew: %s (#%d)", product.Name, product.Id),
			TxMeta{Source: model.TxSourceRenewal, RefId: fmt.Sprintf("%d", product.Id), Actor: buyer.Username}); err != nil {
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
	// Change-plan / renew may target a product with a DIFFERENT inbound set than
	// the config currently sits on. Converge the config onto the new product's
	// inbounds (additive + idempotent; node push handled by AttachByEmail) so a
	// plan switch doesn't leave the client stuck on the old product's inbounds.
	if len(product.InboundIds) > 0 {
		if nr, aerr := s.clientService.AttachByEmail(&s.inboundService, email, []int(product.InboundIds)); aerr != nil {
			logger.Warningf("renew: sync inbounds for %s to product %d failed: %v", email, product.Id, aerr)
		} else if nr {
			s.xrayService.SetToNeedRestart()
		}
	}
	// Renewals are real purchases too — reward the referring reseller.
	s.payReferralCommission(buyer, order)
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

// SubscriptionDetails is the connection info the Store's post-purchase success
// modal needs: the subscription URL and the per-inbound config links for the
// provisioned config. Assembled best-effort — if link generation fails, Partial
// is set and the (already-completed) purchase is unaffected; the client can
// retry from the modal.
type SubscriptionDetails struct {
	Email   string   `json:"email"`
	SubId   string   `json:"subId"`
	SubUrl  string   `json:"subUrl"`
	Links   []string `json:"links"`
	Partial bool     `json:"partial"`
}

// SubscriptionDetails builds the connection info for a provisioned config by its
// email. `host` is the request host (so the sub URL is correct behind any
// proxy). An empty email returns an empty, non-partial result. Shared by the
// Store success modal (right after purchase) and the Services "connection
// details" action (anytime retrieval) so both render identical information.
func (s *OrderService) SubscriptionDetails(host string, email string) SubscriptionDetails {
	d := SubscriptionDetails{}
	if email == "" {
		return d
	}
	d.Email = email

	if links, err := s.inboundService.GetAllClientLinks(host, email); err != nil {
		d.Partial = true
		logger.Warningf("subscription details: links for %s failed: %v", email, err)
	} else {
		d.Links = links
	}

	if rec, err := s.clientService.GetRecordByEmail(nil, email); err == nil {
		d.SubId = rec.SubID
		if rec.SubID != "" {
			d.SubUrl = s.subURIBase(host) + rec.SubID
		}
	} else {
		d.Partial = true
		logger.Warningf("subscription details: record for %s failed: %v", email, err)
	}
	return d
}

// subURIBase returns the resolved subscription URL base (ending in the sub path).
// Mirrors the resolution in SettingService.GetDefaultSettings: a configured
// subURI is used verbatim; otherwise it is derived from the request host + path.
func (s *OrderService) subURIBase(host string) string {
	if base, _ := s.settingService.GetSubURI(); base != "" {
		return base
	}
	base := s.settingService.BuildSubURIBase(host)
	subPath, _ := s.settingService.GetSubPath()
	if subPath == "" {
		subPath = "/sub/"
	}
	if !strings.HasPrefix(subPath, "/") {
		subPath = "/" + subPath
	}
	if !strings.HasSuffix(subPath, "/") {
		subPath += "/"
	}
	return base + subPath
}

func (s *OrderService) refund(userId int, amount int64, product *model.Product) {
	if amount <= 0 {
		return
	}
	if _, err := s.walletService.CreditWithMeta(userId, amount,
		fmt.Sprintf("refund (order failed): %s (#%d)", product.Name, product.Id),
		TxMeta{Source: model.TxSourceRefund, RefId: fmt.Sprintf("%d", product.Id)}); err != nil {
		logger.Errorf("order: refund of %d to user %d failed (manual reconciliation needed): %v", amount, userId, err)
	}
}

// provision creates a buyer-owned Xray client on the product's inbound(s), sized
// by the product's traffic limit and duration. The single config is attached to
// every inbound the product targets. Returns the client's email.
func (s *OrderService) provision(buyer *model.User, product *model.Product, orderId int, name string) (string, error) {
	var expiry int64
	if product.DurationDays > 0 {
		expiry = time.Now().AddDate(0, 0, product.DurationDays).UnixMilli()
	}
	// The config name is the client "email" (as on the Clients page). Use the
	// buyer-chosen name when given; otherwise auto-generate a unique one.
	email := sanitizeClientName(name)
	if email == "" {
		email = buildClientEmail(buyer.Username, orderId)
	}
	// Generate the per-client secrets up front, exactly like the Clients page
	// does (random uuid / subId / password / auth). ClientService.Create also
	// fills protocol defaults, but pre-seeding here guarantees a purchased config
	// always gets fresh random credentials regardless of the inbound's protocol.
	payload := &ClientCreatePayload{
		Client: model.Client{
			Email:      email,
			TotalGB:    product.TrafficLimit,
			ExpiryTime: expiry,
			Enable:     true,
			ID:         uuid.NewString(),  // vmess / vless
			SubID:      randSecret()[:16], // subscription id
			Password:   randSecret(),      // trojan / shadowsocks
			Auth:       randSecret(),      // hysteria
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

// SyncProductInbounds re-aligns every config already provisioned from a product
// to the product's updated inbound set: each client created by a past purchase
// of this product is attached to the newly-added inbounds and detached from the
// removed ones — the same per-client inbound management the Clients page offers.
// Best-effort per client (one failure is logged and skipped, not fatal).
// SyncProductInbounds re-syncs every already-sold config to a product's inbound
// change. It now delegates to the centralized SyncService (diff-based attach/
// detach with retry + audit + node convergence). Kept for back-compat callers;
// the product controller calls SyncService directly so it can record the actor.
func (s *OrderService) SyncProductInbounds(productId int, added, removed []int) (bool, error) {
	report, err := (&SyncService{}).ReconcileProductClients("system", productId, added, removed)
	return report.NeedRestart, err
}

// randSecret returns a random hex token (a UUID with dashes stripped) used to
// seed per-client secrets (subId / trojan & shadowsocks password / hysteria
// auth) on a provisioned config.
func randSecret() string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")
}

// sanitizeClientName maps characters not allowed in a client email/config name
// (slashes, spaces, control chars) to '-', trimming surrounding whitespace.
func sanitizeClientName(name string) string {
	return strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ' ' || r < 0x20 || r == 0x7f {
			return '-'
		}
		return r
	}, strings.TrimSpace(name))
}

// buildClientEmail derives a unique, valid client email from the buyer's
// username and the order id. Usernames are already restricted to [A-Za-z0-9_]
// but we defensively replace any forbidden character, and append a short random
// token so retries never collide.
func buildClientEmail(username string, orderId int) string {
	u := sanitizeClientName(username)
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
