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

// FinanceController is the financial control center. The admin sees the WHOLE
// panel — finance aggregated across every workspace (global scope) — while a
// manager sees only their own workspace; an admin can additionally provide
// `?tenantId=N` on any read endpoint to drill into a single workspace's
// finance without leaving the admin panel. This is driven by resolveScope
// (admin → global by default, admin + tenantId → confined to that tenant,
// manager → always their own tenant, ignoring any supplied tenantId). Unlike
// the per-workspace-isolated resources (bank cards, ticket categories) that
// use HomeScopeStrict, finance intentionally has a "platform-wide + drill
// down" shape: an admin wants to both see the whole panel AND investigate one
// workspace. Everything here is READ-ONLY reporting — money only moves
// through the ledger-backed WalletService elsewhere. The whole group
// requires finance.view_all (admin + manager). Members/resellers use their
// own scoped endpoints (own transactions/orders).
type FinanceController struct {
	financeService service.FinanceService
}

// NewFinanceController registers the finance routes on the API group.
func NewFinanceController(g *gin.RouterGroup) *FinanceController {
	a := &FinanceController{}
	a.initRouter(g)
	return a
}

func (a *FinanceController) initRouter(g *gin.RouterGroup) {
	fin := g.Group("/finance")
	fin.Use(middleware.RequirePermission(model.PermFinanceView))

	fin.GET("/dashboard", a.dashboard)
	fin.GET("/timeseries", a.timeSeries)
	fin.GET("/payment-breakdown", a.paymentBreakdown)
	fin.GET("/segments", a.segments)
	fin.GET("/top/products", a.topProducts)
	fin.GET("/top/customers", a.topCustomers)
	fin.GET("/top/resellers", a.topResellers)
	fin.GET("/top/depositors", a.topDepositors)
	fin.GET("/cashflow", a.cashflow)
	fin.GET("/consistency", a.consistency)
	fin.GET("/deposits", a.deposits)

	// Admin-only: per-tenant rollup so the admin can see finance side-by-side
	// for every workspace in one call. A manager requested this endpoint gets
	// 403 — their own per-tenant data is already on the dashboard above.
	fin.GET("/tenants", middleware.RequirePermission(model.PermManagerAdmin), a.listTenants)

	fin.GET("/users/:id", a.userProfile)

	// CSV exports.
	fin.GET("/export/transactions", a.exportTransactions)
	fin.GET("/export/orders", a.exportOrders)
	fin.GET("/export/deposits", a.exportDeposits)
	fin.GET("/export/users", a.exportUsers)
}

// resolveScope returns the model.Scope a finance request should run under.
// Rules:
//   - Admin, no ?tenantId  → GlobalScope (whole platform, current behaviour).
//   - Admin + ?tenantId=N  → TenantOnly(N): drilled into that workspace only.
//     Validated against the tenants table so an arbitrary id can't be smuggled
//     in to read rows from a non-tenant-scoped table that wraps a tenant-less
//     workspace's data.
//   - Anyone else         → tenant.ScopeFrom(c) regardless of ?tenantId, so a
//     manager can never widen, narrow, or hop to a foreign workspace via the
//     query string (the param is silently ignored).
//
// The numeric parse failure (bad id) is treated as "no override" rather than a
// hard error: an admin refreshing with a stale link shouldn't get shown an
// error page, just fall back to the platform-wide view.
func (a *FinanceController) resolveScope(c *gin.Context) (model.Scope, int, bool) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		return tenant.ScopeFrom(c), 0, false
	}
	raw := c.Query("tenantId")
	if raw == "" {
		return model.GlobalScope, 0, false
	}
	id, err := strconv.Atoi(raw)
	if err != nil || id <= model.GlobalTenantId {
		return model.GlobalScope, 0, false
	}
	// Validate the tenant exists so an invalid id falls back to global instead
	// of returning an empty (silent) result for the admin. Not-found is a
	// benign "unknown id" → silently fall back to global; any other error (DB
	// outage, schema mismatch) is a real failure and is logged so we don't
	// silently widen an admin's scope to global during a transient outage.
	if _, err := (&service.TenantService{}).GetByID(id); err != nil {
		if !errors.Is(err, service.ErrTenantNotFound) {
			logger.Warningf("finance: resolveScope tenant lookup for id=%d failed; falling back to global: %v", id, err)
		}
		return model.GlobalScope, 0, false
	}
	return model.TenantOnly(id), id, true
}

func (a *FinanceController) dashboard(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	d, err := a.financeService.Dashboard(scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, d, nil)
}

func (a *FinanceController) timeSeries(c *gin.Context) {
	days, _ := strconv.Atoi(c.Query("days"))
	scope, _, _ := a.resolveScope(c)
	rows, err := a.financeService.TimeSeries(days, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) paymentBreakdown(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	rows, err := a.financeService.PaymentBreakdown(scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) segments(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	seg, err := a.financeService.Segments(scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, seg, nil)
}

func (a *FinanceController) topProducts(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	scope, _, _ := a.resolveScope(c)
	rows, err := a.financeService.TopProducts(limit, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) topCustomers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	scope, _, _ := a.resolveScope(c)
	rows, err := a.financeService.TopCustomers(limit, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) topResellers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	scope, _, _ := a.resolveScope(c)
	rows, err := a.financeService.TopResellers(limit, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) topDepositors(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	scope, _, _ := a.resolveScope(c)
	rows, err := a.financeService.TopDepositors(limit, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) cashflow(c *gin.Context) {
	from, _ := strconv.ParseInt(c.Query("from"), 10, 64)
	to, _ := strconv.ParseInt(c.Query("to"), 10, 64)
	scope, _, _ := a.resolveScope(c)
	cf, err := a.financeService.Cashflow(from, to, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, cf, nil)
}

func (a *FinanceController) consistency(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	chk, err := a.financeService.ConsistencyCheck(scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, chk, nil)
}

// listTenants is the admin-side per-tenant finance rollup so one page can show
// every workspace's headline numbers side-by-side. A manager requesting this
// endpoint hits the RequirePermission middleware above and never reaches here;
// their own per-tenant view lives on /finance/dashboard.
func (a *FinanceController) listTenants(c *gin.Context) {
	rows, err := a.financeService.TenantRollup()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) deposits(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	userId, _ := strconv.Atoi(c.Query("userId"))
	from, _ := strconv.ParseInt(c.Query("from"), 10, 64)
	to, _ := strconv.ParseInt(c.Query("to"), 10, 64)
	scope, _, _ := a.resolveScope(c)
	items, total, err := a.financeService.DepositsFeed(service.FinanceDepositFilter{
		Method: c.Query("method"),
		Status: c.Query("status"),
		Role:   c.Query("role"),
		UserId: userId,
		Search: c.Query("search"),
		From:   from,
		To:     to,
		Limit:  limit,
		Offset: offset,
	}, scope)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, gin.H{"items": items, "total": total}, nil)
}

func (a *FinanceController) userProfile(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	p, err := a.financeService.UserProfile(id, tenant.ScopeFrom(c))
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	jsonObj(c, p, nil)
}

// ---- CSV exports ----------------------------------------------------------

func sendCSV(c *gin.Context, filename string, data []byte) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Cache-Control", "no-store")
	c.Writer.Write(data)
}

func (a *FinanceController) exportTransactions(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	sendCSV(c, "transactions.csv", a.financeService.ExportTransactionsCSV(scope))
}

func (a *FinanceController) exportOrders(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	sendCSV(c, "orders.csv", a.financeService.ExportOrdersCSV(scope))
}

func (a *FinanceController) exportDeposits(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Query("userId"))
	from, _ := strconv.ParseInt(c.Query("from"), 10, 64)
	to, _ := strconv.ParseInt(c.Query("to"), 10, 64)
	f := service.FinanceDepositFilter{
		Method: c.Query("method"),
		Status: c.Query("status"),
		Role:   c.Query("role"),
		UserId: userId,
		Search: c.Query("search"),
		From:   from,
		To:     to,
	}
	scope, _, _ := a.resolveScope(c)
	sendCSV(c, "deposits.csv", a.financeService.ExportDepositsCSV(f, scope))
}

func (a *FinanceController) exportUsers(c *gin.Context) {
	scope, _, _ := a.resolveScope(c)
	sendCSV(c, "users.csv", a.financeService.ExportUsersCSV(scope))
}
