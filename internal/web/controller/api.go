package controller

import (
	"errors"
	"net/http"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/tgbot"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// APIController handles the main API routes for the 3x-ui panel, including inbounds and server management.
type APIController struct {
	BaseController
	inboundController    *InboundController
	serverController     *ServerController
	nodeController       *NodeController
	adminController      *AdminController
	settingService       service.SettingService
	userService          service.UserService
	walletService        service.WalletService
	treasuryService      service.WorkspaceWalletService
	tenantService        service.TenantService
	tenantSettingService service.TenantSettingService
	apiTokenService      panel.ApiTokenService
	Tgbot                tgbot.Tgbot
}

// NewAPIController creates a new APIController instance and initializes its routes.
func NewAPIController(g *gin.RouterGroup, customGeo *service.CustomGeoService) *APIController {
	a := &APIController{}
	a.initRouter(g, customGeo)
	return a
}

func (a *APIController) checkAPIAuth(c *gin.Context) {
	auth := c.GetHeader("Authorization")
	if after, ok := strings.CutPrefix(auth, "Bearer "); ok {
		tok := after
		if a.apiTokenService.Match(tok) {
			if u, err := a.userService.GetFirstUser(); err == nil {
				session.SetAPIAuthUser(c, u)
			}
			c.Set("api_authed", true)
			c.Next()
			return
		}
		// A Manager's unique API key authenticates as that manager; the tenant
		// middleware then confines the request to their workspace.
		if mgr, err := a.tenantService.ManagerByApiKey(tok); err == nil {
			session.SetAPIAuthUser(c, mgr)
			c.Set("api_authed", true)
			c.Next()
			return
		}
	}
	if !session.IsLogin(c) {
		if c.GetHeader("X-Requested-With") == "XMLHttpRequest" {
			c.AbortWithStatus(http.StatusUnauthorized)
		} else {
			c.AbortWithStatus(http.StatusNotFound)
		}
		return
	}
	c.Next()
}

// initRouter sets up the API routes for inbounds, server, and other endpoints.
func (a *APIController) initRouter(g *gin.RouterGroup, customGeo *service.CustomGeoService) {
	// Main API group
	api := g.Group("/panel/api")
	api.Use(a.checkAPIAuth)
	// Resolve the effective tenant once, right after auth, so every API handler
	// and service downstream can scope by it (tenant.FromContext + TenantScope).
	api.Use(middleware.ResolveTenant(&a.tenantService))
	api.Use(middleware.CSRFMiddleware())

	// Inbounds API
	inbounds := api.Group("/inbounds")
	a.inboundController = NewInboundController(inbounds)

	clients := api.Group("/clients")
	NewClientController(clients)
	// Group (client tag) management is an admin-only feature; gate it so a
	// limited user cannot enumerate or mutate groups across other users.
	groupAdmin := clients.Group("")
	groupAdmin.Use(middleware.RequireAdmin())
	NewGroupController(groupAdmin)

	// Server API (system status/config) — admin only.
	server := api.Group("/server")
	server.Use(middleware.RequireAdmin())
	a.serverController = NewServerController(server)

	// Nodes API — multi-panel management; admin only.
	nodes := api.Group("/nodes")
	nodes.Use(middleware.RequireAdmin())
	a.nodeController = NewNodeController(nodes)

	// Custom geo asset management — admin only.
	customGeoGroup := api.Group("/custom-geo")
	customGeoGroup.Use(middleware.RequireAdmin())
	NewCustomGeoController(customGeoGroup, customGeo)

	// RBAC + wallet administration (admin-only; gated inside the controller).
	a.adminController = NewAdminController(api)

	// Manager workspaces (multi-tenancy) — admin-only control plane: create,
	// suspend, allocate bandwidth, rotate keys, delete. Gated by manager.admin.
	NewManagerController(api)

	// Manager-scoped user management (member/reseller within own tenant only).
	// Gated by tenant.users; cross-tenant/escalation rejected in the service.
	NewTenantUserController(api)

	// Manager-scoped workspace settings (branding/registration/subscription).
	// Gated by tenant.settings; edits only the caller's own tenant.
	NewTenantSettingController(api)

	// Product catalog + orders. Per-route permission gating lives inside these
	// controllers (RequirePermission), so a moderator can manage products and a
	// reseller/member can browse + purchase, while infra stays admin-only.
	NewProductController(api)
	NewOrderController(api)

	// Referral dashboard (reseller views own code/stats) + admin code management.
	NewReferralController(api)

	// Synchronization audit trail (admin-only).
	NewSyncController(api)

	// Identity + wallet snapshot for the current session (any logged-in user).
	api.GET("/me", a.me)
	// Self-service profile editing (any logged-in user; never admin-gated).
	api.POST("/profile", a.updateProfile)
	// Balance top-up via ZarinPal (any logged-in user).
	NewPaymentController(api)
	// Manual card-to-card deposits: buyer submission/history + admin review &
	// payment-card management. Per-route RBAC lives inside the controller.
	NewDepositController(api)
	// Per-user in-app notifications (bell menu) — scoped to the caller.
	NewNotificationController(api)
	// Support ticketing (helpdesk): requester + staff + admin routes. Per-route
	// RBAC + per-request ownership live inside the controller.
	NewTicketController(api)
	// Financial control center (admin + read-only moderator): dashboards,
	// analytics, ledger, cashflow, consistency, exports. Gated by finance.view_all.
	NewFinanceController(api)

	// Extra routes
	api.POST("/backuptotgbot", middleware.RequireAdmin(), a.BackuptoTgbot)
}

// me returns the current user's identity, role, balance and the per-client
// cost so the SPA can gate navigation, show the wallet and preview purchases.
func (a *APIController) me(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	balance, _ := a.walletService.GetBalance(user.Id)
	// Workspace treasury balance — the capital a manager's workspace sells from,
	// distinct from the manager's personal account balance above. Managers only;
	// customers must never see their workspace's treasury.
	workspaceBalance := int64(0)
	if user.IsManager() && user.TenantId != model.GlobalTenantId {
		if bal, err := a.treasuryService.GetTreasuryBalance(user.TenantId); err == nil {
			workspaceBalance = bal
		}
	}
	// Per-role pricing: report the cost for THIS user's role so the SPA's
	// purchase/create preview matches what the backend will actually charge.
	cost, _ := a.settingService.GetClientCostForRole(user.CanonicalRole())
	costPerGB, _ := a.settingService.GetClientCostPerGBForRole(user.CanonicalRole())
	// Per-account per-GB override (when set) so the SPA's cost preview matches
	// what the backend will actually charge this user.
	if user.CostPerGBOverride > 0 {
		costPerGB = user.CostPerGBOverride
	}
	// Gateway availability is per-tenant: a Manager's customers see the Manager's
	// own gateways. ZarinpalConfig/PlisioConfig return the global settings for the
	// tenant-0/admin scope, so admin behavior is unchanged.
	zpCfg := a.tenantSettingService.ZarinpalConfig(user.TenantId)
	plCfg := a.tenantSettingService.PlisioConfig(user.TenantId)
	zarinpalEnable := zpCfg.Enabled
	currency := zpCfg.Currency
	plisioEnable := plCfg.Enabled
	plisioSourceCurrency, _ := a.settingService.GetPlisioSourceCurrency()
	cryptoExchangeRate, _ := a.settingService.GetCryptoExchangeRate()
	cryptoBonusEnabled, _ := a.settingService.GetCryptoBonusEnabled()
	cryptoBonusPercent, _ := a.settingService.GetCryptoBonusPercent()
	cryptoBonusMinDeposit, _ := a.settingService.GetCryptoBonusMinDeposit()
	cryptoBonusMax, _ := a.settingService.GetCryptoBonusMax()
	panelTitle, _ := a.settingService.GetPanelTitle()
	// Tenant identity: the user's HOME workspace (their own), independent of any
	// admin impersonation on this request. tenantId 0 = the global/admin scope
	// (no workspace); managers and their sub-users carry their tenant + slug.
	tenantSlug := ""
	brandLogo, brandFavicon, brandTheme := "", "", ""
	if user.TenantId != model.GlobalTenantId {
		if t, err := a.tenantService.GetByID(user.TenantId); err == nil {
			tenantSlug = t.Slug
		}
		// Workspace branding overrides the global panel title for tenant users, so
		// a Manager (and their customers) see the workspace's own brand.
		if ts, err := a.tenantSettingService.Get(user.TenantId); err == nil {
			if ts.BrandTitle != "" {
				panelTitle = ts.BrandTitle
			}
			brandLogo, brandFavicon, brandTheme = ts.BrandLogo, ts.BrandFavicon, ts.Theme
		}
	}
	jsonObj(c, gin.H{
		"id":       user.Id,
		"username": user.Username,
		"email":    user.Email,
		// Canonical role drives all frontend gating; permissions is the exact
		// capability set the backend will enforce, so the SPA never has to
		// hard-code role->menu logic. isAdmin/isModerator/isReseller/isMember
		// are convenience flags. The backend enforces every one independently.
		"role":             user.CanonicalRole(),
		"permissions":      user.Permissions(),
		"isAdmin":          user.IsAdmin(),
		"isReseller":       user.IsReseller(),
		"isMember":         user.IsMember(),
		"isManager":        user.IsManager(),
		"tenantId":         user.TenantId,
		"tenantSlug":       tenantSlug,
		"brandLogo":        brandLogo,
		"brandFavicon":     brandFavicon,
		"brandTheme":       brandTheme,
		"balance":          balance,
		"workspaceBalance": workspaceBalance,
		"clientCost":       cost,
		"clientCostPerGB":  costPerGB,
		"zarinpalEnable":   zarinpalEnable,
		"currency":         currency,
		// Plisio crypto top-up + configurable deposit bonus, so the SPA can show
		// the crypto option and preview the bonus without extra round-trips.
		"plisioEnable":          plisioEnable,
		"plisioSourceCurrency":  plisioSourceCurrency,
		"cryptoExchangeRate":    cryptoExchangeRate,
		"cryptoBonusEnabled":    cryptoBonusEnabled,
		"cryptoBonusPercent":    cryptoBonusPercent,
		"cryptoBonusMinDeposit": cryptoBonusMinDeposit,
		"cryptoBonusMax":        cryptoBonusMax,
		// Configurable brand/title shown in the sidebar header.
		"panelTitle": panelTitle,
		// Reseller referral identity, so the SPA can render the share link without
		// a second round-trip. Empty for non-resellers / before first generation.
		"referralCode":    user.ReferralCode,
		"referralEnabled": user.ReferralEnabled,
	}, nil)
}

type profileForm struct {
	CurrentPassword string `json:"currentPassword"`
	Username        string `json:"username"`
	Email           string `json:"email"`
	NewPassword     string `json:"newPassword"`
}

// updateProfile lets the current user change their own username, email and
// password after confirming their current password. A password change bumps
// the login epoch (invalidating this session), so the response flags
// passwordChanged and the client redirects to login.
func (a *APIController) updateProfile(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var form profileForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	_, passwordChanged, err := a.userService.UpdateSelfProfile(user.Id, service.SelfProfileInput{
		CurrentPassword: form.CurrentPassword,
		Username:        form.Username,
		Email:           form.Email,
		NewPassword:     form.NewPassword,
	})
	if err != nil {
		if errors.Is(err, service.ErrWrongPassword) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.profile.toasts.wrongPassword"))
			return
		}
		if msg := adminUserErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, gin.H{"passwordChanged": passwordChanged}, nil)
}

// BackuptoTgbot sends a backup of the panel data to Telegram bot admins.
func (a *APIController) BackuptoTgbot(c *gin.Context) {
	a.Tgbot.SendBackupToAdmins()
}
