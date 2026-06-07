package controller

import (
	"net/http"

	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/web/service"
	"github.com/mhsanaei/3x-ui/v3/web/session"

	"github.com/gin-gonic/gin"
)

// CustomerController exposes the role-scoped customer roster — the clients
// (VPN configs) that represent end customers. Gated by customer.view: admins
// and moderators see every customer; a reseller sees only the clients they own.
// Read-only — client management (create/edit/delete) lives on the Clients page
// under client.manage. Scope is enforced here, server-side, never on the client.
type CustomerController struct {
	BaseController
	clientService  service.ClientService
	inboundService service.InboundService
	settingService service.SettingService
}

// NewCustomerController registers the customer routes on the given group.
func NewCustomerController(g *gin.RouterGroup) *CustomerController {
	a := &CustomerController{}
	a.initRouter(g)
	return a
}

func (a *CustomerController) initRouter(g *gin.RouterGroup) {
	customers := g.Group("/customers")
	customers.Use(middleware.RequirePermission(model.PermCustomerView))
	customers.GET("/list/paged", a.listPaged)
}

// listPaged returns the customer roster, reusing the client paging engine.
// Visibility: admins and moderators (broad, all-customer roles) see every
// customer; everyone else (reseller) is scoped to the clients they own.
func (a *CustomerController) listPaged(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var params service.ClientPageParams
	if err := c.ShouldBindQuery(&params); err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	var ownerFilter *int
	if !user.IsAdmin() && !user.IsModerator() {
		id := user.Id
		ownerFilter = &id
	}
	resp, err := a.clientService.ListPaged(&a.inboundService, &a.settingService, params, ownerFilter)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	jsonObj(c, resp, nil)
}
