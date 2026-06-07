package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/logger"
	"github.com/mhsanaei/3x-ui/v3/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/web/service"
	"github.com/mhsanaei/3x-ui/v3/web/session"

	"github.com/gin-gonic/gin"
)

// ProductController exposes the product catalog. Browsing requires product.view
// (every role); mutating requires product.manage (admin + moderator). All
// gating is enforced here on the backend regardless of what the SPA shows.
type ProductController struct {
	BaseController
	productService service.ProductService
	orderService   service.OrderService
}

// intsNotIn returns the elements of a that are not present in b.
func intsNotIn(a, b []int) []int {
	set := make(map[int]bool, len(b))
	for _, x := range b {
		set[x] = true
	}
	var out []int
	for _, x := range a {
		if !set[x] {
			out = append(out, x)
		}
	}
	return out
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
	manage.POST("/:id", a.update)
	manage.POST("/:id/del", a.delete)
	manage.POST("/:id/status", a.setStatus)
}

// list returns the catalog. Catalog managers (admin/moderator) get every
// product; buyers (reseller/member) get only active products — the store view.
func (a *ProductController) list(c *gin.Context) {
	user := session.GetLoginUser(c)
	activeOnly := user == nil || !user.Can(model.PermProductManage)
	products, err := a.productService.List(activeOnly)
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
	p, err := a.productService.Get(id)
	if err != nil {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
		return
	}
	// Buyers may only fetch active products by id; managers may fetch any.
	if user := session.GetLoginUser(c); (user == nil || !user.Can(model.PermProductManage)) && p.Status != model.ProductActive {
		pureJsonMsg(c, http.StatusForbidden, false, I18nWeb(c, "fail"))
		return
	}
	jsonObj(c, p, nil)
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
	p, err := a.productService.Create(in, createdBy)
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
	if old, oerr := a.productService.Get(id); oerr == nil {
		oldInbounds = []int(old.InboundIds)
	}
	p, err := a.productService.Update(id, in)
	if err != nil {
		if errors.Is(err, service.ErrProductNotFound) || errors.Is(err, service.ErrInvalidProduct) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "somethingWentWrong"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	// Propagate the inbound change to configs already sold from this product:
	// attach newly-added inbounds, detach removed ones (best-effort).
	newInbounds := []int(p.InboundIds)
	added := intsNotIn(newInbounds, oldInbounds)
	removed := intsNotIn(oldInbounds, newInbounds)
	if len(added) > 0 || len(removed) > 0 {
		if _, serr := a.orderService.SyncProductInbounds(id, added, removed); serr != nil {
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
	if err := a.productService.Delete(id); err != nil {
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
	if err := a.productService.SetStatus(id, form.Active); err != nil {
		if errors.Is(err, service.ErrProductNotFound) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "fail"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}
