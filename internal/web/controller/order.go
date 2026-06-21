package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"github.com/mhsanaei/3x-ui/v3/internal/web/tenant"

	"github.com/gin-gonic/gin"
)

// OrderController exposes order history and the product purchase endpoint.
// Listing requires order.view_own; callers with order.view_all (admin,
// moderator) see every order, everyone else is scoped to their own. Purchasing
// requires product.purchase (reseller, member; admin too).
type OrderController struct {
	BaseController
	orderService service.OrderService
}

// NewOrderController registers the order routes on the given group.
func NewOrderController(g *gin.RouterGroup) *OrderController {
	a := &OrderController{}
	a.initRouter(g)
	return a
}

func (a *OrderController) initRouter(g *gin.RouterGroup) {
	orders := g.Group("/orders")
	orders.Use(middleware.RequirePermission(model.PermOrderViewOwn))
	orders.GET("", a.list)
	orders.GET("/:id", a.get)
	orders.POST("", middleware.RequirePermission(model.PermProductPurchase), a.purchase)
	// Renew / change the plan of an existing owned service.
	orders.POST("/renew", middleware.RequirePermission(model.PermProductPurchase), a.renew)
}

// list returns orders. order.view_all (admin/manager) sees every order in scope;
// a reseller (customer.view) sees their own AND their referred customers' orders;
// everyone else is scoped to their own orders only.
func (a *OrderController) list(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var userFilter []int
	switch {
	case user.Can(model.PermOrderViewAll):
		userFilter = nil // every order in tenant scope
	case user.Can(model.PermCustomerView):
		userFilter = a.orderService.VisibleOrderUserIds(user.Id) // own + referred customers
	default:
		userFilter = []int{user.Id} // own only
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	orders, err := a.orderService.ListOrders(userFilter, limit, offset, tenant.HomeScopeStrict(c))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, orders, nil)
}

func (a *OrderController) get(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	owner, err := a.orderService.GetOrderOwner(id, tenant.HomeScopeStrict(c))
	if err != nil {
		// Don't reveal existence to non-owners.
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "fail"))
		return
	}
	if !user.Can(model.PermOrderViewAll) && owner != user.Id {
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "fail"))
		return
	}
	order, err := a.orderService.Get(id, tenant.HomeScopeStrict(c))
	if err != nil {
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "fail"))
		return
	}
	jsonObj(c, order, nil)
}

type purchaseForm struct {
	ProductId int    `json:"productId"`
	Name      string `json:"name"` // buyer-chosen config name (client email); optional
}

// purchase buys a product for the CURRENT user. The buyer id is taken from the
// session (never from the request body), so a caller can never purchase as
// someone else. The wallet debit + order creation are sequenced atomically by
// the service (refund-on-failure), and the debit writes a Transaction record.
func (a *OrderController) purchase(c *gin.Context) {
	var form purchaseForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	order, err := a.orderService.Purchase(user, form.ProductId, form.Name, tenant.ViewScope(c))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInsufficientBalance):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
		case errors.Is(err, service.ErrForeignWorkspace):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.store.toasts.foreignWorkspace"))
		case errors.Is(err, service.ErrProductMisconfigured):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.store.toasts.productUnavailable"))
		case errors.Is(err, service.ErrClientEmailInUse):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.store.toasts.configNameInUse"))
		case errors.Is(err, service.ErrProductUnavailable):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
		default:
			jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		}
		return
	}
	// Return the order PLUS the connection details (subscription URL + config
	// links), so the Store can show everything in a success modal with no
	// second request and no navigation to the Clients page.
	subscription := a.orderService.SubscriptionDetails(resolveHost(c), order.ClientEmail)
	jsonObj(c, gin.H{"order": order, "subscription": subscription}, nil)
}

type renewForm struct {
	ProductId int    `json:"productId"`
	Email     string `json:"email"`
}

// renew applies a product to one of the CURRENT user's existing services —
// either the same product (renew) or a different one (change plan). The buyer
// is the session user and ownership of the target service is enforced in the
// service layer.
func (a *OrderController) renew(c *gin.Context) {
	var form renewForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	order, err := a.orderService.Renew(user, form.ProductId, form.Email, tenant.ViewScope(c))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInsufficientBalance):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
		case errors.Is(err, service.ErrForeignWorkspace):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.store.toasts.foreignWorkspace"))
		case errors.Is(err, service.ErrProductMisconfigured):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.store.toasts.productUnavailable"))
		case errors.Is(err, service.ErrServiceForbidden), errors.Is(err, service.ErrServiceNotFound):
			pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "fail"))
		case errors.Is(err, service.ErrProductUnavailable):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
		default:
			jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		}
		return
	}
	jsonObj(c, order, nil)
}
