package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"github.com/mhsanaei/3x-ui/v3/internal/web/tenant"

	"github.com/gin-gonic/gin"
)

// ProductController exposes the product catalog. Browsing requires product.view
// (every role); mutating requires product.manage (admin + manager, on their own
// storefront). All gating is enforced here on the backend regardless of the SPA.
type ProductController struct {
	BaseController
	productService service.ProductService
	orderService   service.OrderService
	syncService    service.SyncService
}

// NewProductController registers the product routes on the given group.
func NewProductController(g *gin.RouterGroup) *ProductController {
	a := &ProductController{}
	a.initRouter(g)
	return a
}

func (a *ProductController) initRouter(g *gin.RouterGroup) {
	products := g.Group("/products")
	products.Use(middleware.RequirePermission(model.PermProductView))
	products.GET("", a.list)
	products.GET("/:id", a.get)

	manage := products.Group("")
	manage.Use(middleware.RequirePermission(model.PermProductManage))
	manage.POST("", a.create)
	// Static "/reorder" coexists with the param "/:id" route below (Gin matches the
	// static segment first — same pattern as orders' /renew vs /:id).
	manage.POST("/reorder", a.reorder)
	manage.POST("/:id", a.update)
	manage.POST("/:id/del", a.delete)
	manage.POST("/:id/status", a.setStatus)
}

// reorder applies a new catalog display order from an ordered list of product ids.
// Scoped to the caller's own storefront so a manager only reorders their own
// catalog; the new order drives both the management list and the buyer store.
func (a *ProductController) reorder(c *gin.Context) {
	var form struct {
		Ids []int `json:"ids"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.productService.ReorderProducts(form.Ids, tenant.ScopeFrom(c)); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

// list returns the catalog. Catalog managers (admin/moderator) get every
// product; buyers (reseller/member) get only active products targeted at their
// role (audience "all" or their own role) — the store view.
func (a *ProductController) list(c *gin.Context) {
	user := session.GetLoginUser(c)
	// The catalog shown is the STOREFRONT being browsed (the /panel/manager/<slug>
	// URL, or the admin store at /panel/). The full management view (incl. inactive
	// products) only applies on the caller's OWN storefront; on someone else's
	// store they're a buyer (active products, audience-filtered).
	manage := user != nil && user.Can(model.PermProductManage) && tenant.IsOwnStorefront(c)
	audience := ""
	if !manage && user != nil {
		audience = user.CanonicalRole() // reseller | member -> only "all" + their role
	}
	products, err := a.productService.List(!manage, audience, tenant.ViewScope(c))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, products, nil)
}

func (a *ProductController) get(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	p, err := a.productService.Get(id, tenant.ViewScope(c))
	if err != nil {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
		return
	}
	// On the caller's own storefront a manager/admin may fetch any product;
	// otherwise (browsing a store) only active products targeted at their role.
	user := session.GetLoginUser(c)
	canManageHere := user != nil && user.Can(model.PermProductManage) && tenant.IsOwnStorefront(c)
	if !canManageHere {
		if p.Status != model.ProductActive || !service.ProductAudienceAllows(p.Audience, roleOf(user)) {
			pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "fail"))
			return
		}
	}
	jsonObj(c, p, nil)
}

// roleOf returns the user's canonical role, or member for a nil user.
func roleOf(user *model.User) string {
	if user == nil {
		return model.RoleMember
	}
	return user.CanonicalRole()
}

func (a *ProductController) create(c *gin.Context) {
	var in service.ProductInput
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	createdBy := 0
	if user := session.GetLoginUser(c); user != nil {
		createdBy = user.Id
	}
	p, err := a.productService.Create(in, createdBy, tenant.ScopeFrom(c))
	if err != nil {
		if errors.Is(err, service.ErrInvalidProduct) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "somethingWentWrong"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, p, nil)
}

func (a *ProductController) update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var in service.ProductInput
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	// Capture the product's previous inbound set so we can re-sync existing
	// purchased configs to any inbounds added/removed by this edit.
	var oldInbounds []int
	if old, oerr := a.productService.Get(id, tenant.ScopeFrom(c)); oerr == nil {
		oldInbounds = []int(old.InboundIds)
	}
	p, err := a.productService.Update(id, in, tenant.ScopeFrom(c))
	if err != nil {
		if errors.Is(err, service.ErrProductNotFound) || errors.Is(err, service.ErrInvalidProduct) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "somethingWentWrong"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	// Propagate the inbound change to configs already sold from this product via
	// the centralized SyncService: diff -> attach added / detach removed on every
	// affected client, with retry, audit, and node convergence. Recording the
	// acting admin/moderator as the audit actor.
	added, removed := service.InboundDiff(oldInbounds, []int(p.InboundIds))
	if len(added) > 0 || len(removed) > 0 {
		actor := ""
		if user := session.GetLoginUser(c); user != nil {
			actor = user.Username
		}
		if _, serr := a.syncService.ReconcileProductClients(actor, id, added, removed); serr != nil {
			logger.Warning("product update: sync existing configs' inbounds failed:", serr)
		}
	}
	jsonObj(c, p, nil)
}

func (a *ProductController) delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.productService.Delete(id, tenant.ScopeFrom(c)); err != nil {
		if errors.Is(err, service.ErrProductNotFound) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

type productStatusForm struct {
	Active bool `json:"active"`
}

func (a *ProductController) setStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form productStatusForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.productService.SetStatus(id, form.Active, tenant.ScopeFrom(c)); err != nil {
		if errors.Is(err, service.ErrProductNotFound) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}
