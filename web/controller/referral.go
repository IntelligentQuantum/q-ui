package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/web/service"
	"github.com/mhsanaei/3x-ui/v3/web/session"

	"github.com/gin-gonic/gin"
)

// ReferralController exposes the referral dashboard and admin code management.
//
//   - GET  /panel/api/referral/me       reseller views own code/link/stats
//     (gated by customer.view, which resellers/moderators/admins hold)
//   - POST /panel/api/referral/code     admin sets/edits a reseller's code
//   - POST /panel/api/referral/enabled  admin enables/disables a code
//   - GET  /panel/api/referral/stats    admin views any reseller's stats
//
// Resellers can only read their OWN code/stats; only admins can mutate codes.
// Attribution itself is immutable and happens at registration, never here.
type ReferralController struct {
	BaseController
	referralService service.ReferralService
	settingService  service.SettingService
}

// NewReferralController registers the referral routes on the given group.
func NewReferralController(g *gin.RouterGroup) *ReferralController {
	a := &ReferralController{}
	a.initRouter(g)
	return a
}

func (a *ReferralController) initRouter(g *gin.RouterGroup) {
	ref := g.Group("/referral")
	ref.Use(middleware.RequirePermission(model.PermCustomerView))
	ref.GET("/me", a.me)

	admin := ref.Group("")
	admin.Use(middleware.RequireAdmin())
	admin.POST("/code", a.setCode)
	admin.POST("/enabled", a.setEnabled)
	admin.GET("/stats", a.statsFor)
}

// referralRegisterPath builds the relative registration path for a code. The
// frontend prefixes the origin + base path to form the absolute share link, so
// the backend never has to know the public hostname.
func referralRegisterPath(code string) string {
	if code == "" {
		return ""
	}
	return "register?ref=" + code
}

// me returns the current user's referral code (auto-generated for resellers on
// first view), its enabled flag, the share path, and their referral stats.
func (a *ReferralController) me(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	code := a.referralService.NormalizeCode(user.ReferralCode)
	isReseller := user.CanonicalRole() == model.RoleReseller
	if isReseller {
		if generated, err := a.referralService.EnsureCode(user); err == nil {
			code = generated
		}
	}
	stats, err := a.referralService.Stats(user.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.inbounds.toasts.obtain"), err)
		return
	}
	// Commission the reseller earns: the configured % of revenue from referred
	// users' paid orders. This mirrors what payReferralCommission actually credits.
	percent, _ := a.settingService.GetReferralCommissionPercent()
	commissionEarned := stats.Revenue * int64(percent) / 100
	jsonObj(c, gin.H{
		"code":              code,
		"enabled":           user.ReferralEnabled,
		"isReseller":        isReseller,
		"registerPath":      referralRegisterPath(code),
		"stats":             stats,
		"commissionPercent": percent,
		"commissionEarned":  commissionEarned,
	}, nil)
}

type referralCodeForm struct {
	UserId int    `json:"userId"`
	Code   string `json:"code"`
}

// setCode lets an admin assign/edit/clear a reseller's referral code.
func (a *ReferralController) setCode(c *gin.Context) {
	var form referralCodeForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "pages.register.toasts.invalidFormData"), err)
		return
	}
	if err := a.referralService.SetCode(form.UserId, form.Code); err != nil {
		switch {
		case errors.Is(err, service.ErrReferralCodeTaken):
			pureJsonMsg(c, http.StatusOK, false, "Referral code already in use")
		case errors.Is(err, service.ErrReferralCodeFormat):
			pureJsonMsg(c, http.StatusOK, false, "Invalid referral code (4-32 chars: letters, digits, _ or -)")
		case errors.Is(err, service.ErrReferralNotReseller):
			pureJsonMsg(c, http.StatusOK, false, "Referral codes can only be assigned to resellers")
		default:
			jsonMsg(c, "", err)
		}
		return
	}
	jsonMsg(c, "", nil)
}

type referralEnabledForm struct {
	UserId  int  `json:"userId"`
	Enabled bool `json:"enabled"`
}

// setEnabled lets an admin enable/disable a reseller's code (without deleting).
func (a *ReferralController) setEnabled(c *gin.Context) {
	var form referralEnabledForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "pages.register.toasts.invalidFormData"), err)
		return
	}
	if err := a.referralService.SetEnabled(form.UserId, form.Enabled); err != nil {
		jsonMsg(c, "", err)
		return
	}
	jsonMsg(c, "", nil)
}

// statsFor lets an admin read any reseller's referral stats by id.
func (a *ReferralController) statsFor(c *gin.Context) {
	id, err := strconv.Atoi(c.Query("resellerId"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.register.toasts.invalidFormData"), err)
		return
	}
	stats, err := a.referralService.Stats(id)
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	jsonObj(c, stats, nil)
}
