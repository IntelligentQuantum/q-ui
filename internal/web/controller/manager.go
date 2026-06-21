package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// ManagerController is the admin-only control plane for Manager workspaces
// (tenants). Every route is gated by the manager.admin permission, which only
// the admin role holds, so a manager can never reach these endpoints.
type ManagerController struct {
	BaseController
	managerService  service.ManagerService
	walletService   service.WalletService
	treasuryService service.WorkspaceWalletService
}

// NewManagerController registers the /admin/managers routes on the API group.
func NewManagerController(g *gin.RouterGroup) *ManagerController {
	a := &ManagerController{}
	grp := g.Group("/admin/managers")
	grp.Use(middleware.RequirePermission(model.PermManagerAdmin))
	grp.GET("", a.list)
	grp.POST("", a.create)
	grp.GET("/:id", a.get)
	grp.GET("/:id/overview", a.overview)
	grp.POST("/:id/balance", a.adjustBalance)
	grp.POST("/:id/status", a.setStatus)
	grp.POST("/:id/bandwidth", a.allocateBandwidth)
	grp.POST("/:id/domain", a.setDomain)
	grp.POST("/:id/rotate-key", a.rotateKey)
	grp.POST("/:id/del", a.del)
	return a
}

type createManagerForm struct {
	Username string `json:"username"`
	Password string `json:"password"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Slug     string `json:"slug"`
	Name     string `json:"name"`
}

type managerStatusForm struct {
	Status string `json:"status"`
}

type managerBandwidthForm struct {
	QuotaBytes int64 `json:"quotaBytes"`
}

type managerDomainForm struct {
	Domain string `json:"domain"`
}

func (a *ManagerController) list(c *gin.Context) {
	views, err := a.managerService.List()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, views, nil)
}

func (a *ManagerController) create(c *gin.Context) {
	var form createManagerForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	view, err := a.managerService.Create(service.CreateManagerInput{
		Username: form.Username,
		Password: form.Password,
		FullName: form.FullName,
		Email:    form.Email,
		Phone:    form.Phone,
		Slug:     form.Slug,
		Name:     form.Name,
	})
	if err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	// view.ApiKey carries the plaintext key — shown exactly once, here.
	jsonObj(c, view, nil)
}

func (a *ManagerController) get(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	view, err := a.managerService.Get(id)
	if err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, view, nil)
}

// overview returns at-a-glance stats for one workspace so the admin can inspect
// it without impersonating.
func (a *ManagerController) overview(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	view, err := a.managerService.Overview(id)
	if err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, view, nil)
}

// adjustBalance tops up / adjusts a workspace's TREASURY balance — the workspace's
// prepaid capital that its sales accrue into and draw down, kept physically
// separate from the manager's personal account balance. Admin-only, from the
// original panel's Managers page, so a workspace can be funded to sell. Mirrors
// the Users page balance operations.
func (a *ManagerController) adjustBalance(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	view, err := a.managerService.Get(id)
	if err != nil || view.Manager == nil {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.managers.toasts.notFound"))
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
	desc := form.Description
	if desc == "" {
		desc = "workspace balance adjustment"
	}
	actor := ""
	if self := session.GetLoginUser(c); self != nil {
		actor = self.Username
	}
	// The route :id is the tenant id; fund the workspace TREASURY (not the
	// manager's personal account balance), which is what the workspace sells from.
	tenantID := id
	switch form.Op {
	case "add":
		err = a.treasuryService.CreditTreasury(tenantID, form.Amount, desc, service.TxMeta{Source: model.WsSourceTopup, Actor: actor})
	case "deduct":
		err = a.treasuryService.DebitTreasury(tenantID, form.Amount, desc, service.TxMeta{Source: model.WsSourceTopup, Actor: actor})
	case "set":
		err = a.treasuryService.SetTreasury(tenantID, form.Amount, desc, service.TxMeta{Source: model.WsSourceAdjust, Actor: actor})
	default:
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.users.toasts.invalidOp"))
		return
	}
	if err != nil {
		if errors.Is(err, service.ErrInsufficientBalance) || errors.Is(err, service.ErrInsufficientTreasury) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	bal, _ := a.treasuryService.GetTreasuryBalance(tenantID)
	jsonObj(c, gin.H{"balance": bal}, nil)
}

func (a *ManagerController) setStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form managerStatusForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.managerService.SetStatus(id, form.Status); err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *ManagerController) allocateBandwidth(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form managerBandwidthForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.managerService.AllocateBandwidth(id, form.QuotaBytes); err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *ManagerController) setDomain(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form managerDomainForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.managerService.SetDomain(id, form.Domain); err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *ManagerController) rotateKey(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	key, err := a.managerService.RotateApiKey(id)
	if err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, gin.H{"apiKey": key}, nil)
}

func (a *ManagerController) del(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.managerService.Delete(id); err != nil {
		if msg := managerErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

// managerErrorMessage maps known manager/user-service sentinels to localized
// messages; returns "" for unknown errors (caller falls back to a generic one).
func managerErrorMessage(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrSlugInvalid):
		return I18nWeb(c, "pages.managers.toasts.slugInvalid")
	case errors.Is(err, service.ErrSlugTaken):
		return I18nWeb(c, "pages.managers.toasts.slugTaken")
	case errors.Is(err, service.ErrDomainInvalid):
		return I18nWeb(c, "pages.managers.toasts.domainInvalid")
	case errors.Is(err, service.ErrDomainTaken):
		return I18nWeb(c, "pages.managers.toasts.domainTaken")
	case errors.Is(err, service.ErrTenantNotFound):
		return I18nWeb(c, "pages.managers.toasts.notFound")
	default:
		// Reuse the user-service error mapping for username/email/password issues
		// surfaced during manager creation.
		return adminUserErrorMessage(c, err)
	}
}
