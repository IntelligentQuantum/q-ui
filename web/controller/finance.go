package controller

import (
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/web/service"

	"github.com/gin-gonic/gin"
)

// FinanceController is the admin/moderator financial control center. Everything
// here is READ-ONLY reporting — money only moves through the ledger-backed
// WalletService elsewhere. The whole group requires finance.view_all (admin +
// moderator). Members/resellers use their own scoped endpoints (own
// transactions/orders) which live in other controllers.
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
	fin.GET("/users/:id", a.userProfile)

	// CSV exports.
	fin.GET("/export/transactions", a.exportTransactions)
	fin.GET("/export/orders", a.exportOrders)
	fin.GET("/export/deposits", a.exportDeposits)
	fin.GET("/export/users", a.exportUsers)
}

func (a *FinanceController) dashboard(c *gin.Context) {
	d, err := a.financeService.Dashboard()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, d, nil)
}

func (a *FinanceController) timeSeries(c *gin.Context) {
	days, _ := strconv.Atoi(c.Query("days"))
	rows, err := a.financeService.TimeSeries(days)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) paymentBreakdown(c *gin.Context) {
	rows, err := a.financeService.PaymentBreakdown()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) segments(c *gin.Context) {
	seg, err := a.financeService.Segments()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, seg, nil)
}

func (a *FinanceController) topProducts(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := a.financeService.TopProducts(limit)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) topCustomers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := a.financeService.TopCustomers(limit)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) topResellers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := a.financeService.TopResellers(limit)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) topDepositors(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := a.financeService.TopDepositors(limit)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *FinanceController) cashflow(c *gin.Context) {
	from, _ := strconv.ParseInt(c.Query("from"), 10, 64)
	to, _ := strconv.ParseInt(c.Query("to"), 10, 64)
	cf, err := a.financeService.Cashflow(from, to)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, cf, nil)
}

func (a *FinanceController) consistency(c *gin.Context) {
	chk, err := a.financeService.ConsistencyCheck()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, chk, nil)
}

func (a *FinanceController) deposits(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	userId, _ := strconv.Atoi(c.Query("userId"))
	from, _ := strconv.ParseInt(c.Query("from"), 10, 64)
	to, _ := strconv.ParseInt(c.Query("to"), 10, 64)
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
	})
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, gin.H{"items": items, "total": total}, nil)
}

func (a *FinanceController) userProfile(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	p, err := a.financeService.UserProfile(id)
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
	sendCSV(c, "transactions.csv", a.financeService.ExportTransactionsCSV())
}

func (a *FinanceController) exportOrders(c *gin.Context) {
	sendCSV(c, "orders.csv", a.financeService.ExportOrdersCSV())
}

func (a *FinanceController) exportDeposits(c *gin.Context) {
	sendCSV(c, "deposits.csv", a.financeService.ExportDepositsCSV())
}

func (a *FinanceController) exportUsers(c *gin.Context) {
	sendCSV(c, "users.csv", a.financeService.ExportUsersCSV())
}
