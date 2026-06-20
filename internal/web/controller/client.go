package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/util/random"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"github.com/mhsanaei/3x-ui/v3/internal/web/tenant"
	"github.com/mhsanaei/3x-ui/v3/internal/web/websocket"

	"github.com/gin-gonic/gin"
)

func notifyClientsChanged() {
	websocket.BroadcastInvalidate(websocket.MessageTypeClients)
}

func parseInboundIdsQuery(raw string) []int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	ids := make([]int, 0, len(parts))
	for _, p := range parts {
		if id, err := strconv.Atoi(strings.TrimSpace(p)); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

type ClientController struct {
	clientService  service.ClientService
	inboundService service.InboundService
	xrayService    service.XrayService
	settingService service.SettingService
	walletService  service.WalletService
	orderService   service.OrderService
	tenantService  service.TenantService
}

func NewClientController(g *gin.RouterGroup) *ClientController {
	a := &ClientController{}
	a.initRouter(g)
	return a
}

func (a *ClientController) initRouter(g *gin.RouterGroup) {
	admin := middleware.RequireAdmin()

	// Routes a non-admin "user" may reach. Each handler additionally enforces
	// per-client ownership so a user can only ever touch their own clients.
	g.GET("/list/paged", a.listPaged)
	g.GET("/get/:email", a.get)
	g.GET("/traffic/:email", a.getTrafficByEmail)
	g.GET("/subLinks/:subId", a.getSubLinks)
	g.GET("/links/:email", a.getClientLinks)
	// Full connection details (sub URL + sub id + config links) for one owned
	// config — powers the "connection details" modal on Store and Services.
	g.GET("/subscription/:email", a.getSubscriptionDetails)
	g.POST("/add", a.create)
	g.POST("/update/:email", a.update)
	g.POST("/del/:email", a.delete)
	g.POST("/ips/:email", a.getIps)
	g.POST("/clearIps/:email", a.clearIps)
	// Owners may re-attach/detach their own clients to/from inbounds (each
	// handler enforces ownership). Attaching doesn't change the client's quota,
	// so there's no cost implication.
	g.POST("/:email/attach", a.attach)
	g.POST("/:email/detach", a.detach)
	// Owner self-service: rename / enable-toggle / regenerate the subscription
	// ID + protocol secrets of their own config (ownership enforced in handler).
	g.POST("/:email/rotate", a.rotate)
	// Owner-accessible traffic reset. Ownership is enforced in the handler and,
	// for non-admins, the configured reset-traffic cost is charged to their
	// wallet (refunded on failure). Admins reset for free. The bulk/all-traffic
	// reset routes below remain admin-only.
	g.POST("/resetTraffic/:email", a.resetTrafficByEmail)

	// Admin-only routes: full client list, bulk operations, traffic
	// administration and online/diagnostic queries.
	g.GET("/list", admin, a.list)
	g.POST("/resetAllTraffics", admin, a.resetAllTraffics)
	g.POST("/delDepleted", admin, a.delDepleted)
	g.POST("/bulkAdjust", admin, a.bulkAdjust)
	g.POST("/bulkDel", admin, a.bulkDelete)
	g.POST("/bulkCreate", admin, a.bulkCreate)
	g.POST("/bulkAttach", admin, a.bulkAttach)
	g.POST("/bulkDetach", admin, a.bulkDetach)
	g.POST("/bulkResetTraffic", admin, a.bulkResetTraffic)
	g.POST("/updateTraffic/:email", admin, a.updateTrafficByEmail)
	g.POST("/onlines", admin, a.onlines)
	g.POST("/onlinesByGuid", admin, a.onlinesByGuid)
	g.POST("/activeInbounds", admin, a.activeInbounds)
	g.POST("/lastOnline", admin, a.lastOnline)
	g.POST("/:email/externalLinks", admin, a.setExternalLinks)
	g.POST("/clientIpsByGuid", admin, a.clientIpsByGuid)
}

// requireOwnership returns true when the caller may act on the client with the
// given email: admins always may; a non-admin only when they own it. On denial
// it writes the response and returns false so the caller can simply return.
func (a *ClientController) requireOwnership(c *gin.Context, email string) bool {
	user := session.GetLoginUser(c)
	if user == nil {
		pureJsonMsg(c, http.StatusUnauthorized, false, I18nWeb(c, "pages.login.loginAgain"))
		return false
	}
	if user.IsAdmin() {
		return true
	}
	owner, tenantId, err := a.clientService.GetClientScopeByEmail(email)
	if err != nil {
		// Don't reveal whether the email exists to a non-owner.
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "pages.clients.toasts.forbidden"))
		return false
	}
	// A manager owns their whole workspace: they may act on any client in their
	// tenant. Everyone else (reseller/member) is restricted to clients they own.
	allowed := owner == user.Id
	if user.IsManager() {
		allowed = tenantId == user.TenantId
	}
	if !allowed {
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "pages.clients.toasts.forbidden"))
		return false
	}
	return true
}

// requireSubOwnership is the subId equivalent of requireOwnership.
func (a *ClientController) requireSubOwnership(c *gin.Context, subID string) bool {
	user := session.GetLoginUser(c)
	if user == nil {
		pureJsonMsg(c, http.StatusUnauthorized, false, I18nWeb(c, "pages.login.loginAgain"))
		return false
	}
	if user.IsAdmin() {
		return true
	}
	owner, err := a.clientService.GetOwnerBySubID(subID)
	if err != nil || owner != user.Id {
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "pages.clients.toasts.forbidden"))
		return false
	}
	return true
}

func (a *ClientController) list(c *gin.Context) {
	rows, err := a.clientService.List()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *ClientController) listPaged(c *gin.Context) {
	var params service.ClientPageParams
	if err := c.ShouldBindQuery(&params); err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	// Non-admins are scoped to clients they own; admins see everything — unless
	// the caller explicitly asks for their own configs via ?owner=self (the
	// "My Services" page), which scopes to the logged-in user for every role so
	// an admin sees their own purchased services rather than the whole panel.
	// A manager sees every client in their workspace (tenant scope handles the
	// confinement, so no owner filter). admin sees everything. reseller/member are
	// confined to clients they own. Any caller may opt into "my services only"
	// via ?owner=self.
	var ownerFilter *int
	if user := session.GetLoginUser(c); user != nil {
		ownsWholeScope := user.IsAdmin() || user.IsManager()
		if !ownsWholeScope || c.Query("owner") == "self" {
			id := user.Id
			ownerFilter = &id
		}
	}
	resp, err := a.clientService.ListPaged(&a.inboundService, &a.settingService, params, ownerFilter, tenant.ScopeFrom(c))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	jsonObj(c, resp, nil)
}

func (a *ClientController) get(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	rec, err := a.clientService.GetRecordByEmail(nil, email)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "get"), err)
		return
	}
	inboundIds, err := a.clientService.GetInboundIdsForRecord(rec.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "get"), err)
		return
	}
	externalLinks, err := a.clientService.GetExternalLinksForRecord(rec.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "get"), err)
		return
	}
	flow, err := a.clientService.EffectiveFlow(nil, rec.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "get"), err)
		return
	}
	rec.Flow = flow
	// Consumed bytes (up+down, including cross-node global overlay) so API
	// consumers can pair usage with the client's totalGB quota (#4973).
	// Best-effort: a traffic lookup failure must not break the client fetch.
	var usedTraffic int64
	if t, tErr := a.inboundService.GetClientTrafficByEmail(email); tErr == nil && t != nil {
		usedTraffic = t.Up + t.Down
	}
	jsonObj(c, gin.H{"client": rec, "inboundIds": inboundIds, "externalLinks": externalLinks, "usedTraffic": usedTraffic}, nil)
}

func (a *ClientController) create(c *gin.Context) {
	var payload service.ClientCreatePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user := session.GetLoginUser(c)
	if user == nil {
		pureJsonMsg(c, http.StatusUnauthorized, false, I18nWeb(c, "pages.login.loginAgain"))
		return
	}
	// Bandwidth business model: a Manager workspace that has consumed its
	// admin-allocated quota cannot provision new services until recharged.
	if user.TenantId != model.GlobalTenantId && a.tenantService.OverBandwidthQuota(user.TenantId) {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.bandwidthExhausted"))
		return
	}
	// Every client gets an owner: the creating user. (json:"-" on OwnerId means
	// a caller cannot spoof this — it is only ever set here, server-side.) The
	// tenant is the creator's workspace (0 = global/admin), confining the client.
	payload.OwnerId = user.Id
	payload.TenantId = user.TenantId

	// Advanced fields (subscription id, protocol secrets, comment, auto-renew
	// period) are admin-only. For everyone else the server owns them: secrets are
	// regenerated (so a crafted payload can never choose/hijack a subId or set a
	// known password/auth), and comment/reset are cleared. This is the
	// authoritative enforcement — the reseller UI also hides these, but the
	// backend never trusts the client.
	if !user.IsAdmin() {
		payload.Client.SubID = random.NumLower(16)
		payload.Client.Password = random.NumLower(16)
		payload.Client.Auth = random.NumLower(16)
		payload.Client.Comment = ""
		payload.Client.Reset = 0
		payload.Client.Group = ""
		// A reseller can't choose the UUID or set a reverse-proxy tag — the UI
		// hides both; regenerate the id server-side and drop any reverse config.
		payload.Client.ID = uuid.NewString()
		payload.Client.Reverse = nil
	}

	// Cost system: non-admins are charged clientCost credits per client. The
	// debit, client creation and (on failure) the refund are sequenced so a
	// failed creation never leaves the user out of pocket and an unpaid client
	// is never created.
	var charged int64
	var chargedManager int
	if !user.IsAdmin() {
		base, _ := a.settingService.GetClientCostForRole(user.CanonicalRole())
		perGB, _ := a.settingService.GetClientCostPerGBForRole(user.CanonicalRole())
		// Per-account override: when set (>0), this user's own per-GB price wins
		// over the role default (e.g. user "test" at 10000/GB instead of 15000).
		if user.CostPerGBOverride > 0 {
			perGB = user.CostPerGBOverride
		}
		cost := service.ComputeClientCost(base, perGB, payload.Client.TotalGB)
		if cost > 0 {
			// Workspace pool: a customer's client costs draw down both the customer
			// and their manager; both must have enough balance.
			mid, derr := a.walletService.DebitWorkspacePurchase(user, user.TenantId, cost, "client create: "+payload.Client.Email,
				service.TxMeta{Source: model.TxSourcePurchase})
			if derr != nil {
				if errors.Is(derr, service.ErrInsufficientBalance) {
					pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
					return
				}
				jsonMsg(c, I18nWeb(c, "somethingWentWrong"), derr)
				return
			}
			charged = cost
			chargedManager = mid
		}
	}

	needRestart, err := a.clientService.Create(&a.inboundService, &payload)
	if err != nil {
		if charged > 0 {
			// Refund the reservation (buyer + manager pool); creation never happened.
			if refundErr := a.walletService.RefundWorkspacePurchase(user.Id, chargedManager, charged, "refund (create failed): "+payload.Client.Email,
				service.TxMeta{Source: model.TxSourceRefund}); refundErr != nil {
				logger.Warning("failed to refund client-create charge:", refundErr)
			}
		}
		if msg := clientErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsgObj(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientAddSuccess"), pendingNodeObj(a.inboundService.AnyNodePending(payload.InboundIds)), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

// clientErrorMessage maps a known client-service collision error to a localized,
// user-facing message, or "" when the error is not one we specially handle (the
// caller then falls back to the generic "something went wrong"). This is what
// turns a raw English "email already in use" into the user's language.
func clientErrorMessage(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrClientEmailInUse):
		return I18nWeb(c, "pages.clients.toasts.emailInUse")
	case errors.Is(err, service.ErrClientSubIdInUse):
		return I18nWeb(c, "pages.clients.toasts.subIdInUse")
	default:
		return ""
	}
}

func (a *ClientController) update(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	var updated model.Client
	if err := c.ShouldBindJSON(&updated); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	// Advanced fields are admin-only (see create). A non-admin can never change
	// the subscription id, protocol secrets, comment or auto-renew period — we
	// restore the stored values, so any supplied values are silently ignored.
	if user := session.GetLoginUser(c); user != nil && !user.IsAdmin() {
		if rec, rerr := a.clientService.GetRecordByEmail(nil, email); rerr == nil {
			updated.SubID = rec.SubID
			updated.Password = rec.Password
			updated.Auth = rec.Auth
			updated.Comment = rec.Comment
			updated.Reset = rec.Reset
			updated.Group = rec.Group
			// Preserve the stored UUID and reverse-proxy config — a reseller can't
			// change either (both hidden in the UI).
			updated.ID = rec.UUID
			updated.Reverse = rec.ToClient().Reverse
		}
	}
	inboundFilter := parseInboundIdsQuery(c.Query("inboundIds"))
	needRestart, err := a.clientService.UpdateByEmail(&a.inboundService, email, updated, inboundFilter...)
	if err != nil {
		if msg := clientErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsgObj(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientUpdateSuccess"), pendingNodeObj(a.clientService.HasPendingNode(&a.inboundService, email)), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type rotateBody struct {
	Email      string `json:"email"`
	Enable     *bool  `json:"enable"`
	Regenerate bool   `json:"regenerate"`
}

// rotate lets a config owner rename it, toggle enable, and/or regenerate its
// subscription ID + protocol secrets. Ownership is enforced; the heavy lifting
// (rebuilding the client and syncing inbounds) is done server-side so the
// client never has to reconstruct the protocol payload.
func (a *ClientController) rotate(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	var body rotateBody
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	needRestart, err := a.clientService.Rotate(&a.inboundService, email, service.RotateOptions{
		NewEmail:   body.Email,
		Enable:     body.Enable,
		Regenerate: body.Regenerate,
	})
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientUpdateSuccess"), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

func (a *ClientController) delete(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	keepTraffic := c.Query("keepTraffic") == "1"
	needRestart, err := a.clientService.DeleteByEmail(&a.inboundService, email, keepTraffic)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientDeleteSuccess"), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type attachDetachBody struct {
	InboundIds []int `json:"inboundIds"`
}

type externalLinksBody struct {
	ExternalLinks []service.ExternalLinkInput `json:"externalLinks"`
}

func (a *ClientController) attach(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	var body attachDetachBody
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	needRestart, err := a.clientService.AttachByEmail(&a.inboundService, email, body.InboundIds)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsgObj(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientAddSuccess"), pendingNodeObj(a.inboundService.AnyNodePending(body.InboundIds)), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

func (a *ClientController) setExternalLinks(c *gin.Context) {
	email := c.Param("email")
	var body externalLinksBody
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.clientService.SetExternalLinksByEmail(email, body.ExternalLinks); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientUpdateSuccess"), nil)
	notifyClientsChanged()
}

func (a *ClientController) resetAllTraffics(c *gin.Context) {
	needRestart, err := a.clientService.ResetAllTraffics()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.resetAllClientTrafficSuccess"), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type bulkAdjustRequest struct {
	Emails   []string `json:"emails"`
	AddDays  int      `json:"addDays"`
	AddBytes int64    `json:"addBytes"`
}

func (a *ClientController) bulkAdjust(c *gin.Context) {
	var req bulkAdjustRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	result, needRestart, err := a.clientService.BulkAdjust(&a.inboundService, req.Emails, req.AddDays, req.AddBytes)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, result, nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type bulkDeleteRequest struct {
	Emails      []string `json:"emails"`
	KeepTraffic bool     `json:"keepTraffic"`
}

type bulkAttachRequest struct {
	Emails     []string `json:"emails"`
	InboundIds []int    `json:"inboundIds"`
}

func (a *ClientController) bulkAttach(c *gin.Context) {
	var req bulkAttachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	result, needRestart, err := a.clientService.BulkAttach(&a.inboundService, req.Emails, req.InboundIds)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, result, nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type bulkDetachRequest struct {
	Emails     []string `json:"emails"`
	InboundIds []int    `json:"inboundIds"`
}

func (a *ClientController) bulkDetach(c *gin.Context) {
	var req bulkDetachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	result, needRestart, err := a.clientService.BulkDetach(&a.inboundService, req.Emails, req.InboundIds)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, result, nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

func (a *ClientController) bulkDelete(c *gin.Context) {
	var req bulkDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	result, needRestart, err := a.clientService.BulkDelete(&a.inboundService, req.Emails, req.KeepTraffic)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, result, nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

func (a *ClientController) bulkCreate(c *gin.Context) {
	var payloads []service.ClientCreatePayload
	if err := c.ShouldBindJSON(&payloads); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	result, needRestart, err := a.clientService.BulkCreate(&a.inboundService, payloads)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, result, nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

func (a *ClientController) delDepleted(c *gin.Context) {
	deleted, needRestart, err := a.clientService.DelDepleted(&a.inboundService)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, gin.H{"deleted": deleted}, nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

func (a *ClientController) resetTrafficByEmail(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	user := session.GetLoginUser(c)

	// Cost system: resetting a client's traffic re-grants its quota, so it is a
	// billable action for non-admins (configured separately from client
	// creation). Sequenced as debit -> reset -> refund-on-failure so a failed
	// reset never leaves the owner out of pocket. Admins reset for free.
	var charged int64
	var chargedManager int
	if user != nil && !user.IsAdmin() {
		base, _ := a.settingService.GetResetTrafficCostForRole(user.CanonicalRole())
		perGB, _ := a.settingService.GetResetTrafficCostPerGBForRole(user.CanonicalRole())
		var quota int64
		if ct, terr := a.inboundService.GetClientTrafficByEmail(email); terr == nil && ct != nil {
			quota = ct.Total
		}
		cost := service.ComputeClientCost(base, perGB, quota)
		if cost > 0 {
			// Workspace pool: a customer's reset also draws their manager's balance.
			mid, derr := a.walletService.DebitWorkspacePurchase(user, user.TenantId, cost, "reset traffic: "+email,
				service.TxMeta{Source: model.TxSourcePurchase})
			if derr != nil {
				if errors.Is(derr, service.ErrInsufficientBalance) {
					pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
					return
				}
				jsonMsg(c, I18nWeb(c, "somethingWentWrong"), derr)
				return
			}
			charged = cost
			chargedManager = mid
		}
	}

	needRestart, err := a.clientService.ResetTrafficByEmail(&a.inboundService, email)
	if err != nil {
		if charged > 0 {
			if refundErr := a.walletService.RefundWorkspacePurchase(user.Id, chargedManager, charged, "refund (reset failed): "+email,
				service.TxMeta{Source: model.TxSourceRefund}); refundErr != nil {
				logger.Warning("failed to refund reset-traffic charge:", refundErr)
			}
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.resetInboundClientTrafficSuccess"), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type trafficUpdateRequest struct {
	Upload   int64 `json:"upload"`
	Download int64 `json:"download"`
}

func (a *ClientController) updateTrafficByEmail(c *gin.Context) {
	email := c.Param("email")
	var req trafficUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.inboundService.UpdateClientTrafficByEmail(email, req.Upload, req.Download); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientUpdateSuccess"), nil)
	notifyClientsChanged()
}

func (a *ClientController) getIps(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	ips, err := a.inboundService.GetInboundClientIps(email)
	if err != nil || ips == "" {
		jsonObj(c, "No IP Record", nil)
		return
	}
	type ipWithTimestamp struct {
		IP        string `json:"ip"`
		Timestamp int64  `json:"timestamp"`
	}
	var ipsWithTime []ipWithTimestamp
	if err := json.Unmarshal([]byte(ips), &ipsWithTime); err == nil && len(ipsWithTime) > 0 {
		formatted := make([]string, 0, len(ipsWithTime))
		for _, item := range ipsWithTime {
			if item.IP == "" {
				continue
			}
			if item.Timestamp > 0 {
				ts := time.Unix(item.Timestamp, 0).Local().Format("2006-01-02 15:04:05")
				formatted = append(formatted, fmt.Sprintf("%s (%s)", item.IP, ts))
				continue
			}
			formatted = append(formatted, item.IP)
		}
		jsonObj(c, formatted, nil)
		return
	}
	var oldIps []string
	if err := json.Unmarshal([]byte(ips), &oldIps); err == nil && len(oldIps) > 0 {
		jsonObj(c, oldIps, nil)
		return
	}
	jsonObj(c, ips, nil)
}

func (a *ClientController) clientIpsByGuid(c *gin.Context) {
	data, err := a.inboundService.GetClientIpsByGuid()
	jsonObj(c, data, err)
}

func (a *ClientController) clearIps(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	if err := a.inboundService.ClearClientIps(email); err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.updateSuccess"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.logCleanSuccess"), nil)
}

func (a *ClientController) onlines(c *gin.Context) {
	jsonObj(c, a.inboundService.GetOnlineClients(), nil)
}

func (a *ClientController) onlinesByGuid(c *gin.Context) {
	jsonObj(c, a.inboundService.GetOnlineClientsByGuid(), nil)
}

func (a *ClientController) activeInbounds(c *gin.Context) {
	jsonObj(c, a.inboundService.GetActiveInboundsByGuid(), nil)
}

func (a *ClientController) lastOnline(c *gin.Context) {
	data, err := a.inboundService.GetClientsLastOnline()
	jsonObj(c, data, err)
}

func (a *ClientController) getTrafficByEmail(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	traffic, err := a.inboundService.GetClientTrafficByEmail(email)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.trafficGetError"), err)
		return
	}
	jsonObj(c, traffic, nil)
}

func (a *ClientController) getSubLinks(c *gin.Context) {
	if !a.requireSubOwnership(c, c.Param("subId")) {
		return
	}
	links, err := a.inboundService.GetSubLinks(resolveHost(c), c.Param("subId"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	jsonObj(c, links, nil)
}

func (a *ClientController) getClientLinks(c *gin.Context) {
	if !a.requireOwnership(c, c.Param("email")) {
		return
	}
	links, err := a.inboundService.GetAllClientLinks(resolveHost(c), c.Param("email"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	jsonObj(c, links, nil)
}

// getSubscriptionDetails returns the subscription URL + sub id + config links
// for one OWNED config (ownership enforced). Best-effort: link-generation
// failure is reported via the `partial` flag, never as an error, so the modal
// can show the subscription and offer a retry.
func (a *ClientController) getSubscriptionDetails(c *gin.Context) {
	if !a.requireOwnership(c, c.Param("email")) {
		return
	}
	details := a.orderService.SubscriptionDetails(resolveHost(c), c.Param("email"))
	jsonObj(c, details, nil)
}

func (a *ClientController) detach(c *gin.Context) {
	email := c.Param("email")
	if !a.requireOwnership(c, email) {
		return
	}
	var body attachDetachBody
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	needRestart, err := a.clientService.DetachByEmailMany(&a.inboundService, email, body.InboundIds)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsgObj(c, I18nWeb(c, "pages.inbounds.toasts.inboundClientDeleteSuccess"), pendingNodeObj(a.inboundService.AnyNodePending(body.InboundIds)), nil)
	if needRestart {
		a.xrayService.SetToNeedRestart()
	}
	notifyClientsChanged()
}

type bulkResetRequest struct {
	Emails []string `json:"emails"`
}

func (a *ClientController) bulkResetTraffic(c *gin.Context) {
	var req bulkResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	affected, err := a.clientService.BulkResetTraffic(&a.inboundService, req.Emails)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, gin.H{"affected": affected}, nil)
	a.xrayService.SetToNeedRestart()
	notifyClientsChanged()
}
