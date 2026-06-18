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

// TenantUserController is the manager-scoped user-management API
// (/panel/api/tenant/users), gated by tenant.users. A manager manages only the
// member/reseller accounts inside their own workspace; every cross-tenant or
// privilege-escalating action is rejected server-side by TenantUserService.
type TenantUserController struct {
	BaseController
	tenantUserService service.TenantUserService
}

// NewTenantUserController registers the manager user routes on the API group.
func NewTenantUserController(g *gin.RouterGroup) *TenantUserController {
	a := &TenantUserController{}
	grp := g.Group("/tenant/users")
	grp.Use(middleware.RequirePermission(model.PermTenantUsers))
	grp.GET("", a.list)
	grp.POST("", a.create)
	grp.POST("/:id", a.update)
	grp.POST("/:id/del", a.del)
	grp.POST("/:id/balance", a.adjustBalance)
	return a
}

func (a *TenantUserController) list(c *gin.Context) {
	users, err := a.tenantUserService.List(tenant.ScopeFrom(c))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, users, nil)
}

func (a *TenantUserController) create(c *gin.Context) {
	var form adminUserForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user, err := a.tenantUserService.Create(service.AdminUserInput{
		Username:          form.Username,
		Password:          form.Password,
		FullName:          form.FullName,
		Phone:             form.Phone,
		Email:             form.Email,
		Role:              form.Role,
		Balance:           form.Balance,
		CostPerGBOverride: form.CostPerGbOverride,
	}, tenant.ScopeFrom(c))
	if err != nil {
		if msg := tenantUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, user, nil)
}

func (a *TenantUserController) update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form adminUserForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user, err := a.tenantUserService.Update(id, service.AdminUserInput{
		Username:          form.Username,
		Password:          form.Password,
		FullName:          form.FullName,
		Phone:             form.Phone,
		Email:             form.Email,
		Role:              form.Role,
		CostPerGBOverride: form.CostPerGbOverride,
	}, tenant.ScopeFrom(c))
	if err != nil {
		if msg := tenantUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, user, nil)
}

func (a *TenantUserController) del(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if self := session.GetLoginUser(c); self != nil && self.Id == id {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.users.toasts.cannotDeleteSelf"))
		return
	}
	if err := a.tenantUserService.Delete(id, tenant.ScopeFrom(c)); err != nil {
		if msg := tenantUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.users.toasts.userDeleted"), nil)
}

func (a *TenantUserController) adjustBalance(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form balanceAdjustForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if form.Amount < 0 {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.users.toasts.invalidAmount"))
		return
	}
	actor := ""
	if self := session.GetLoginUser(c); self != nil {
		actor = self.Username
	}
	balance, err := a.tenantUserService.AdjustBalance(id, form.Op, form.Amount, form.Description, actor, tenant.ScopeFrom(c))
	if err != nil {
		if errors.Is(err, service.ErrInsufficientBalance) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
			return
		}
		if errors.Is(err, service.ErrInvalidBalanceOp) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.users.toasts.invalidOp"))
			return
		}
		if msg := tenantUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, gin.H{"balance": balance}, nil)
}

// tenantUserErrorMessage maps tenant-user + reused user-service sentinels to
// localized messages.
func tenantUserErrorMessage(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrTenantUserForbidden):
		return I18nWeb(c, "pages.tenantUsers.toasts.forbidden")
	case errors.Is(err, service.ErrTenantRoleForbidden):
		return I18nWeb(c, "pages.tenantUsers.toasts.roleForbidden")
	default:
		return adminUserErrorMessage(c, err)
	}
}
