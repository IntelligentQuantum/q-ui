package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
)

// Errors returned by OrderService.
var (
	ErrOrderNotFound        = errors.New("order not found")
	ErrProductUnavailable   = errors.New("product is not available for purchase")
	ErrProductMisconfigured = errors.New("product references an inbound that no longer exists")
	ErrBuyerRequired        = errors.New("buyer is required")
	ErrServiceNotFound      = errors.New("service not found")
	ErrServiceForbidden     = errors.New("you do not own this service")
	ErrForeignWorkspace     = errors.New("you can only buy on your own workspace")
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

// workspaceCanBuy enforces per-workspace wallets: a customer (member/reseller)
// may only buy on THEIR OWN workspace's storefront, because their balance is
// separate per workspace and is not usable on another workspace's store. Admin is
// exempt. A manager may buy on their OWN workspace or the global/admin store (to
// resell), but NOT on another manager's storefront — otherwise a manager could
// pollute an unrelated workspace's orders/treasury by spoofing the X-Workspace
// header. Returns ErrForeignWorkspace when the target store is not allowed.
func workspaceCanBuy(buyer *model.User, view model.Scope) error {
	if buyer.IsAdmin() {
		return nil
	}
	if buyer.IsManager() {
		if view.TenantID == buyer.TenantId || view.TenantID == model.GlobalTenantId {
			return nil
		}
		return ErrForeignWorkspace
	}
	if view.TenantID != buyer.TenantId {
		return ErrForeignWorkspace
	}
	return nil
}

// Purchase buys a product for the given buyer (taken from the session, never
// from request input, so a caller cannot purchase as someone else). name is the
// buyer-chosen config name (the client "email"); blank falls back to an
// auto-generated name.
func (s *OrderService) Purchase(buyer *model.User, productId int, name string, view model.Scope) (*model.Order, error) {
	if buyer == nil {
		return nil, ErrBuyerRequired
	}
	if err := workspaceCanBuy(buyer, view); err != nil {
		return nil, err
	}
	// The product is bought from the STOREFRONT being browsed (view scope), so a
	// customer on /panel/manager/<slug> buys that manager's product; the sale is
	// attributed to that workspace and draws its pool.
	product, err := s.productService.Get(productId, view)
	if err != nil || product.Status != model.ProductActive {
		return nil, ErrProductUnavailable
	}
	// Audience gate: a buyer may only purchase products targeted at their role
	// ("all" or their own). admin/moderator manage the catalog and may buy any.
	if !buyer.Can(model.PermProductManage) && !ProductAudienceAllows(product.Audience, buyer.CanonicalRole()) {
		return nil, ErrProductUnavailable
	}
	// A product can only be delivered if every inbound it targets still exists.
	// An inbound deleted (or whose id changed across a panel update / db restore)
	// after the product was created would otherwise blow up mid-purchase inside
	// provisioning with a raw gorm "record not found". Detect it up front so the
	// buyer gets a clear message and is NEVER charged for a config we can't create.
	if miss, merr := missingInbounds([]int(product.InboundIds)); merr != nil {
		return nil, merr
	} else if len(miss) > 0 {
		logger.Warningf("purchase: product %d (%q) targets missing inbound(s) %v — purchase blocked", product.Id, product.Name, miss)
		return nil, ErrProductMisconfigured
	}

	// A manager buying from their OWN store provisions from the workspace pool —
	// the cost-of-goods debit below depletes the treasury — so they are NOT charged
	// the product price personally. A customer/reseller pays the price from their
	// own balance, and that revenue accrues to the manager's PERSONAL wallet.
	ownerManager := buyer.IsManager() && buyer.TenantId == view.TenantID
	var charged int64
	var chargedTenant int
	if product.Price > 0 && !ownerManager {
		mid, derr := s.walletService.DebitWorkspacePurchase(buyer, view.TenantID, product.Price,
			fmt.Sprintf("purchase: %s (#%d)", product.Name, product.Id),
			TxMeta{Source: model.TxSourcePurchase, RefId: fmt.Sprintf("%d", product.Id), Actor: buyer.Username})
		if derr != nil {
			return nil, derr // ErrInsufficientBalance bubbles up to the controller
		}
		charged = product.Price
		chargedTenant = mid
	}

	order := &model.Order{
		UserId:      buyer.Id,
		TenantId:    view.TenantID, // the storefront the sale belongs to
		ProductId:   product.Id,
		ProductName: product.Name,
		Amount:      product.Price,
		Status:      model.OrderPending,
	}
	if err := database.GetDB().Create(order).Error; err != nil {
		s.refund(buyer.Id, chargedTenant, charged, product)
		return nil, err
	}

	// Provision a real Xray config when the product targets one or more inbounds.
	if len(product.InboundIds) > 0 {
		email, provErr := s.provision(buyer, product, order.Id, name, view.TenantID)
		if provErr != nil {
			s.refund(buyer.Id, chargedTenant, charged, product)
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
	// Charge the workspace manager the bandwidth cost-of-goods (per-GB × product GB).
	s.chargeManagerCostOfGoods(view.TenantID, product.TrafficLimit, product.Name, product.Id)
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
func (s *OrderService) Renew(buyer *model.User, productId int, email string, view model.Scope) (*model.Order, error) {
	if buyer == nil {
		return nil, ErrBuyerRequired
	}
	if err := workspaceCanBuy(buyer, view); err != nil {
		return nil, err
	}
	product, err := s.productService.Get(productId, view)
	if err != nil || product.Status != model.ProductActive {
		return nil, ErrProductUnavailable
	}
	// Audience gate: a buyer may only purchase products targeted at their role
	// ("all" or their own). admin/moderator manage the catalog and may buy any.
	if !buyer.Can(model.PermProductManage) && !ProductAudienceAllows(product.Audience, buyer.CanonicalRole()) {
		return nil, ErrProductUnavailable
	}
	// Same guard as Purchase: a plan-switch onto a product whose inbound no longer
	// exists must fail clearly before charging, not leave the config half-migrated.
	if miss, merr := missingInbounds([]int(product.InboundIds)); merr != nil {
		return nil, merr
	} else if len(miss) > 0 {
		logger.Warningf("renew: product %d (%q) targets missing inbound(s) %v — renew blocked", product.Id, product.Name, miss)
		return nil, ErrProductMisconfigured
	}
	owner, ownerTenant, err := s.clientService.GetClientScopeByEmail(email)
	if err != nil {
		return nil, ErrServiceNotFound
	}
	// Authorize the renew/change-plan: admin (any config), the owner themselves, or
	// a manager acting within their OWN workspace (client.manage is tenant-scoped,
	// so a manager can renew their customers' configs but never another tenant's).
	switch {
	case buyer.IsAdmin():
	case buyer.IsManager() && ownerTenant == buyer.TenantId:
	case owner == buyer.Id:
	default:
		return nil, ErrServiceForbidden
	}

	// Same rule as Purchase: a manager renewing in their OWN store draws only the
	// cost-of-goods from the treasury (below), not the price from their wallet.
	ownerManager := buyer.IsManager() && buyer.TenantId == view.TenantID
	var charged int64
	var chargedTenant int
	if product.Price > 0 && !ownerManager {
		mid, derr := s.walletService.DebitWorkspacePurchase(buyer, view.TenantID, product.Price,
			fmt.Sprintf("renew: %s (#%d)", product.Name, product.Id),
			TxMeta{Source: model.TxSourceRenewal, RefId: fmt.Sprintf("%d", product.Id), Actor: buyer.Username})
		if derr != nil {
			return nil, derr
		}
		charged = product.Price
		chargedTenant = mid
	}

	order := &model.Order{
		UserId:      buyer.Id,
		TenantId:    view.TenantID,
		ProductId:   product.Id,
		ProductName: product.Name,
		Amount:      product.Price,
		Status:      model.OrderPending,
		ClientEmail: email,
	}
	if err := database.GetDB().Create(order).Error; err != nil {
		s.refund(buyer.Id, chargedTenant, charged, product)
		return nil, err
	}

	if err := s.applyPlan(email, product); err != nil {
		s.refund(buyer.Id, chargedTenant, charged, product)
		_ = database.GetDB().Model(&model.Order{}).Where("id = ?", order.Id).
			Update("status", model.OrderCancelled).Error
		return nil, err
	}
	order.Status = model.OrderCompleted
	_ = database.GetDB().Model(&model.Order{}).Where("id = ?", order.Id).
		Update("status", model.OrderCompleted).Error
	// Charge the workspace manager the bandwidth cost-of-goods for the renewed quota.
	s.chargeManagerCostOfGoods(view.TenantID, product.TrafficLimit, product.Name, product.Id)
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

func (s *OrderService) refund(userId, sellerTenantID int, amount int64, product *model.Product) {
	if amount <= 0 {
		return
	}
	// Symmetric to DebitWorkspacePurchase: refund the buyer AND debit the
	// workspace treasury (when the sale credited one), so a failed order never
	// leaves the buyer short nor the workspace over-credited.
	if err := s.walletService.RefundWorkspacePurchase(userId, sellerTenantID, amount,
		fmt.Sprintf("refund (order failed): %s (#%d)", product.Name, product.Id),
		TxMeta{Source: model.TxSourceRefund, RefId: fmt.Sprintf("%d", product.Id)}); err != nil {
		logger.Errorf("order: refund of %d to user %d (tenant %d) failed (manual reconciliation needed): %v", amount, userId, sellerTenantID, err)
	}
}

// chargeManagerCostOfGoods debits the workspace MANAGER's treasury for the
// bandwidth cost-of-goods of a sold product: managerPerGB × productGB, using the
// manager's per-user override if set, else the manager-tier per-GB rate. The buyer
// pays the retail Price (credited to the treasury); this debit is what the manager
// owes the admin for the bandwidth, so the manager keeps Price − cost as margin.
// Only for a real workspace (tenant > 0) — the admin's own store has no cost. The
// debit is allowed to go negative so a below-cost price never blocks a sale.
func (s *OrderService) chargeManagerCostOfGoods(sellerTenantID int, trafficLimit int64, productName string, productId int) {
	if sellerTenantID <= model.GlobalTenantId {
		return
	}
	if _, err := (&WorkspaceWalletService{}).DebitProvisionBandwidth(sellerTenantID, trafficLimit,
		fmt.Sprintf("cost of goods: %s (#%d)", productName, productId),
		TxMeta{Source: model.WsSourceQuotaBuy, RefId: fmt.Sprintf("%d", productId), Actor: "system"}); err != nil {
		logger.Errorf("order: cost-of-goods debit for tenant %d (product %d) failed (manual reconciliation): %v", sellerTenantID, productId, err)
	}
}

// missingInbounds returns the subset of inbound ids that do NOT exist in the
// inbounds table. Used to validate a product is deliverable BEFORE charging the
// buyer, so a product pointing at a deleted / renumbered inbound fails clearly
// (ErrProductMisconfigured) instead of mid-provision with a raw "record not found".
func missingInbounds(ids []int) ([]int, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var existing []int
	if err := database.GetDB().Model(&model.Inbound{}).Where("id IN ?", ids).Pluck("id", &existing).Error; err != nil {
		return nil, err
	}
	present := make(map[int]bool, len(existing))
	for _, id := range existing {
		present[id] = true
	}
	var missing []int
	for _, id := range ids {
		if !present[id] {
			missing = append(missing, id)
		}
	}
	return missing, nil
}

// provision creates a buyer-owned Xray client on the product's inbound(s), sized
// by the product's traffic limit and duration. The single config is attached to
// every inbound the product targets. Returns the client's email.
func (s *OrderService) provision(buyer *model.User, product *model.Product, orderId int, name string, tenantID int) (string, error) {
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
			ID:         uuid.NewString(), // vmess / vless
			// Default to XTLS Vision so a VLESS+TCP+(TLS|REALITY) config provisions
			// EXACTLY like a hand-made one on the Clients page (where the operator
			// picks this flow). Without it a store config has no flow and won't
			// connect on a REALITY/Vision inbound. ClientService.Create strips it on
			// any inbound that can't use Vision (non-VLESS, ws/grpc/etc.), so this is
			// safe across every protocol the product targets.
			Flow:     visionFlow,
			SubID:    randSecret()[:16], // subscription id
			Password: randSecret(),      // trojan / shadowsocks
			Auth:     randSecret(),      // hysteria
		},
		InboundIds: []int(product.InboundIds),
		OwnerId:    buyer.Id,
		TenantId:   tenantID, // the storefront the service was sold from
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

// OrderView is an order enriched with the buyer's identity so the orders list can
// show WHO each order belongs to (username/email), not just the config name.
type OrderView struct {
	model.Order
	Username  string `json:"username"`
	UserEmail string `json:"userEmail"`
}

// VisibleOrderUserIds returns the user ids a caller without order.view_all but
// WITH customer.view (a reseller) may see orders for: their own id plus their
// referred customers (referred_by_user_id == caller). So a reseller oversees the
// orders of the customers they brought in, not just their own purchases.
func (s *OrderService) VisibleOrderUserIds(callerId int) []int {
	ids := []int{callerId}
	var referred []int
	database.GetDB().Model(&model.User{}).
		Where("referred_by_user_id = ?", callerId).Pluck("id", &referred)
	return append(ids, referred...)
}

// ListOrders returns orders newest-first. A nil/empty userIds returns every order
// in scope (admin / order.view_all); a non-empty userIds restricts to those buyers
// (a member sees only their own id; a reseller sees own + referred customers).
func (s *OrderService) ListOrders(userIds []int, limit, offset int, scope model.Scope) ([]OrderView, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	// Join users so each row carries the buyer. ApplyCol qualifies tenant_id with
	// the "o" alias (a bare tenant_id would be ambiguous across the join).
	q := scope.ApplyCol(database.GetDB().
		Table("orders AS o").
		Select("o.*, u.username AS username, u.email AS user_email").
		Joins("LEFT JOIN users u ON u.id = o.user_id"), "o.tenant_id").
		Order("o.id DESC").Limit(limit).Offset(offset)
	if len(userIds) > 0 {
		q = q.Where("o.user_id IN ?", userIds)
	}
	var orders []OrderView
	if err := q.Scan(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}

// Get loads a single order by id within the caller's tenant scope.
func (s *OrderService) Get(id int, scope model.Scope) (*model.Order, error) {
	var o model.Order
	if err := scope.Apply(database.GetDB()).Where("id = ?", id).First(&o).Error; err != nil {
		return nil, ErrOrderNotFound
	}
	return &o, nil
}

// GetOrderOwner returns the user_id that owns an order, for ownership checks.
// Scoped so an order in another tenant reads as not-found.
func (s *OrderService) GetOrderOwner(id int, scope model.Scope) (int, error) {
	var o model.Order
	if err := scope.Apply(database.GetDB()).Select("user_id").Where("id = ?", id).First(&o).Error; err != nil {
		return 0, ErrOrderNotFound
	}
	return o.UserId, nil
}
