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

	"github.com/gin-gonic/gin"
)

// AdminController exposes the admin-only RBAC + wallet management API under
// /panel/api/admin. Every route is gated by middleware.RequireAdmin, so a
// non-admin session (or none) can never reach user management, balance
// adjustments or the global transaction log.
type AdminController struct {
	userService    service.UserService
	walletService  service.WalletService
	reportService  service.ReportService
	managerService service.ManagerService
}

// syncManagerWorkspace keeps a user's workspace in step with their role when
// edited from the Users page: promoting to manager provisions a workspace (so a
// manager is never left without one); any other role suspends a workspace they
// previously owned (so a demoted manager's panel isn't left running). Best-effort
// — a failure is logged and the user op still succeeds.
func (a *AdminController) syncManagerWorkspace(user *model.User) {
	if user == nil {
		return
	}
	if user.CanonicalRole() == model.RoleManager {
		if t, err := a.managerService.EnsureWorkspaceForUser(user.Id); err != nil {
			logger.Warning("ensure manager workspace failed:", err)
		} else {
			user.TenantId = t.Id
		}
		return
	}
	if err := a.managerService.SuspendWorkspaceForUser(user.Id); err != nil {
		logger.Warning("suspend demoted manager workspace failed:", err)
	}
}

func NewAdminController(g *gin.RouterGroup) *AdminController {
	a := &AdminController{}
	a.initRouter(g)
	return a
}

func (a *AdminController) initRouter(g *gin.RouterGroup) {
	admin := g.Group("/admin")
	admin.Use(middleware.RequireAdmin())

	admin.GET("/users", a.listUsers)
	admin.POST("/users", a.createUser)
	admin.POST("/users/:id", a.updateUser)
	admin.POST("/users/:id/del", a.deleteUser)
	admin.POST("/users/:id/balance", a.adjustBalance)
	admin.GET("/transactions", a.listTransactions)
	admin.GET("/reports/income", a.incomeReport)
}

type adminUserForm struct {
	Username          string `json:"username"`
	Password          string `json:"password"`
	FullName          string `json:"fullName"`
	Phone             string `json:"phone"`
	Email             string `json:"email"`
	Role              string `json:"role"`
	Balance           int64  `json:"balance"`
	CostPerGbOverride int    `json:"costPerGbOverride"`
	AllowedInbounds   []int  `json:"allowedInbounds"`
}

type balanceAdjustForm struct {
	Op          string `json:"op"`     // add | deduct | set
	Amount      int64  `json:"amount"` // for set: target balance; otherwise delta
	Description string `json:"description"`
}

func (a *AdminController) listUsers(c *gin.Context) {
	users, err := a.userService.ListUsers()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, users, nil)
}

func (a *AdminController) createUser(c *gin.Context) {
	var form adminUserForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	user, err := a.userService.AdminCreateUser(service.AdminUserInput{
		Username:          form.Username,
		Password:          form.Password,
		FullName:          form.FullName,
		Phone:             form.Phone,
		Email:             form.Email,
		Role:              form.Role,
		Balance:           form.Balance,
		CostPerGBOverride: form.CostPerGbOverride,
	})
	if err != nil {
		if msg := adminUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	a.syncManagerWorkspace(user)
	jsonObj(c, user, nil)
}

func (a *AdminController) updateUser(c *gin.Context) {
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
	user, err := a.userService.AdminUpdateUser(id, service.AdminUserInput{
		Username:          form.Username,
		Password:          form.Password,
		FullName:          form.FullName,
		Phone:             form.Phone,
		Email:             form.Email,
		Role:              form.Role,
		CostPerGBOverride: form.CostPerGbOverride,
	})
	if err != nil {
		if msg := adminUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	a.syncManagerWorkspace(user)
	jsonObj(c, user, nil)
}

func (a *AdminController) deleteUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if self := session.GetLoginUser(c); self != nil && self.Id == id {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.users.toasts.cannotDeleteSelf"))
		return
	}
	if err := a.userService.DeleteUser(id); err != nil {
		if msg := adminUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.users.toasts.userDeleted"), nil)
}

func (a *AdminController) adjustBalance(c *gin.Context) {
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
	desc := form.Description
	if desc == "" {
		desc = "admin adjustment"
	}
	actor := ""
	if self := session.GetLoginUser(c); self != nil {
		actor = self.Username
	}
	switch form.Op {
	case "add":
		_, err = a.walletService.CreditWithMeta(id, form.Amount, desc, service.TxMeta{Source: model.TxSourceAdminCredit, Actor: actor})
	case "deduct":
		_, err = a.walletService.DebitWithMeta(id, form.Amount, desc, service.TxMeta{Source: model.TxSourceAdminDebit, Actor: actor})
	case "set":
		_, err = a.walletService.SetBalanceWithMeta(id, form.Amount, desc, service.TxMeta{Source: model.TxSourceAdminSet, Actor: actor})
	default:
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.users.toasts.invalidOp"))
		return
	}
	if err != nil {
		if errors.Is(err, service.ErrInsufficientBalance) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.clients.toasts.insufficientBalance"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	balance, err := a.walletService.GetBalance(id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, gin.H{"balance": balance}, nil)
}

func (a *AdminController) listTransactions(c *gin.Context) {
	var userId *int
	if raw := c.Query("userId"); raw != "" {
		if id, err := strconv.Atoi(raw); err == nil {
			userId = &id
		}
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	rows, err := a.walletService.ListTransactions(userId, limit, offset)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *AdminController) incomeReport(c *gin.Context) {
	report, err := a.reportService.IncomeReport()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, report, nil)
}

// adminUserErrorMessage maps known user-service sentinels to localized
// messages. Returns "" for unknown errors so the caller falls back to a
// generic handler.
func adminUserErrorMessage(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrUsernameTaken):
		return I18nWeb(c, "pages.register.toasts.usernameTaken")
	case errors.Is(err, service.ErrEmailTaken):
		return I18nWeb(c, "pages.register.toasts.emailTaken")
	case errors.Is(err, service.ErrInvalidUsername):
		return I18nWeb(c, "pages.register.toasts.invalidUsername")
	case errors.Is(err, service.ErrInvalidEmail):
		return I18nWeb(c, "pages.register.toasts.invalidEmail")
	case errors.Is(err, service.ErrWeakPassword):
		return I18nWeb(c, "pages.register.toasts.weakPassword")
	case errors.Is(err, service.ErrLastAdmin):
		return I18nWeb(c, "pages.users.toasts.lastAdmin")
	default:
		return ""
	}
}
