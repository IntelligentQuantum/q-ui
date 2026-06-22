package controller

import (
	"errors"
	"net/http"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/tenant"

	"github.com/gin-gonic/gin"
)

// TenantSettingController is the manager-scoped workspace-settings API
// (/panel/api/tenant/settings), gated by tenant.settings. It edits only the
// per-tenant subset (branding, registration, subscription defaults) for the
// caller's own workspace — never the global/admin settings. When an admin
// impersonates a tenant (?tenant=N) it targets that workspace, which is how an
// admin edits a manager's branding.
type TenantSettingController struct {
	BaseController
	tenantSettingService service.TenantSettingService
}

// NewTenantSettingController registers the workspace-settings routes.
func NewTenantSettingController(g *gin.RouterGroup) *TenantSettingController {
	a := &TenantSettingController{}
	grp := g.Group("/tenant/settings")
	grp.Use(middleware.RequirePermission(model.PermTenantSettings))
	grp.GET("", a.get)
	grp.POST("", a.update)
	// Per-workspace client pricing — what this workspace charges its OWN users
	// (e.g. moderators) to create/reset a client. Same tenant.settings capability.
	grp.GET("/pricing", a.getPricing)
	grp.POST("/pricing", a.updatePricing)

	// Gateway config is a distinct capability (tenant.payments): a Manager
	// configures their OWN ZarinPal/Plisio credentials; payments route to them.
	pay := g.Group("/tenant/payments")
	pay.Use(middleware.RequirePermission(model.PermTenantPayments))
	pay.GET("", a.getPayment)
	pay.POST("", a.updatePayment)
	return a
}

func (a *TenantSettingController) getPayment(c *gin.Context) {
	tid, _ := tenant.FromContext(c)
	view, err := a.tenantSettingService.GetPayment(tid)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, view, nil)
}

func (a *TenantSettingController) updatePayment(c *gin.Context) {
	tid, _ := tenant.FromContext(c)
	var in service.TenantPaymentSettingsView
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.tenantSettingService.UpdatePayment(tid, in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TenantSettingController) getPricing(c *gin.Context) {
	tid, _ := tenant.FromContext(c)
	view, err := a.tenantSettingService.GetPricing(tid)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, view, nil)
}

func (a *TenantSettingController) updatePricing(c *gin.Context) {
	tid, _ := tenant.FromContext(c)
	var in service.TenantPricingView
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.tenantSettingService.UpdatePricing(tid, in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TenantSettingController) get(c *gin.Context) {
	tid, _ := tenant.FromContext(c)
	view, err := a.tenantSettingService.Get(tid)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, view, nil)
}

func (a *TenantSettingController) update(c *gin.Context) {
	tid, _ := tenant.FromContext(c)
	var in service.TenantSettingsView
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.tenantSettingService.Update(tid, in); err != nil {
		switch {
		case errors.Is(err, service.ErrSlugInvalid):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.managers.toasts.slugInvalid"))
		case errors.Is(err, service.ErrSlugTaken):
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.managers.toasts.slugTaken"))
		default:
			jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		}
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}
