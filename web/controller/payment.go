package controller

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/logger"
	"github.com/mhsanaei/3x-ui/v3/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/web/service"
	"github.com/mhsanaei/3x-ui/v3/web/session"

	"github.com/gin-gonic/gin"
)

// PaymentController exposes balance top-up via the ZarinPal gateway. Both
// routes are available to any logged-in user (a reseller tops up their own
// wallet). The request endpoint is an XHR; the callback is the browser return
// target ZarinPal redirects to, so it verifies, credits and 302s back to the
// SPA billing page.
type PaymentController struct {
	zarinpalService service.ZarinpalService
	plisioService   service.PlisioService
	paymentService  service.PaymentService
	walletService   service.WalletService
	settingService  service.SettingService
}

func NewPaymentController(g *gin.RouterGroup) *PaymentController {
	a := &PaymentController{}
	a.initRouter(g)
	return a
}

func (a *PaymentController) initRouter(g *gin.RouterGroup) {
	billing := g.Group("/billing")
	billing.POST("/zarinpal/request", a.zarinpalRequest)
	billing.GET("/zarinpal/callback", a.zarinpalCallback)
	billing.POST("/plisio/request", a.plisioRequest)
	billing.GET("/payments", a.listPayments)
	// Admin reporting over confirmed crypto deposits.
	billing.GET("/crypto/report", middleware.RequireAdmin(), a.cryptoReport)
}

type zarinpalRequestForm struct {
	Amount int64 `json:"amount"`
}

func absoluteURL(c *gin.Context, path string) string {
	scheme := "http"
	if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host + path
}

func (a *PaymentController) zarinpalRequest(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var form zarinpalRequestForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if form.Amount <= 0 {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.billing.toasts.invalidAmount"))
		return
	}

	basePath := c.GetString("base_path")
	if basePath == "" {
		basePath = "/"
	}
	callbackURL := absoluteURL(c, basePath+"panel/api/billing/zarinpal/callback")
	desc := "Panel balance top-up for " + user.Username

	authority, startPay, err := a.zarinpalService.RequestPayment(form.Amount, desc, callbackURL, user.Email, user.Phone)
	if err != nil {
		logger.Warning("zarinpal request failed:", err)
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.billing.toasts.requestFailed"))
		return
	}
	if _, err := a.paymentService.CreatePending(user.Id, "zarinpal", authority, form.Amount); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, gin.H{"url": startPay, "authority": authority}, nil)
}

type plisioRequestForm struct {
	Amount int64 `json:"amount"`
}

// plisioRequest opens a Plisio crypto invoice for the logged-in user and returns
// the hosted invoice URL the browser is redirected to. The balance is credited
// asynchronously by the Plisio webhook once the payment confirms — never here.
func (a *PaymentController) plisioRequest(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var form plisioRequestForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if form.Amount <= 0 {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.billing.toasts.invalidAmount"))
		return
	}

	sourceCurrency, _ := a.settingService.GetPlisioSourceCurrency()
	rate, _ := a.settingService.GetCryptoExchangeRate()
	// The user deposits in wallet credits; Plisio prices the invoice in the
	// source (fiat) currency at credits/rate. Credits are what we credit back.
	fiatAmount := float64(form.Amount) / float64(rate)
	basePath := c.GetString("base_path")
	if basePath == "" {
		basePath = "/"
	}
	callbackURL := absoluteURL(c, basePath+"plisio/callback")
	billingPage := absoluteURL(c, basePath+"panel/billing")
	// order_number is our own unique reference; Plisio echoes it on every
	// callback and it survives the buyer switching cryptocurrency mid-payment.
	authority := uuid.NewString()
	orderName := "wallet-topup-" + user.Username
	desc := "Panel balance top-up for " + user.Username

	if _, err := a.paymentService.CreateCryptoPending(user.Id, "plisio", authority, sourceCurrency, form.Amount); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	_, invoiceURL, err := a.plisioService.CreateInvoice(authority, orderName, desc, callbackURL,
		billingPage+"?status=crypto_pending", billingPage+"?status=crypto_failed", user.Email, sourceCurrency, fiatAmount)
	if err != nil {
		_ = a.paymentService.MarkFailed(authority)
		logger.Warning("plisio invoice request failed:", err)
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.billing.toasts.requestFailed"))
		return
	}
	jsonObj(c, gin.H{"url": invoiceURL}, nil)
}

// cryptoReport returns aggregate statistics over confirmed crypto deposits
// (admin only — gated at the route).
func (a *PaymentController) cryptoReport(c *gin.Context) {
	rep, err := a.paymentService.CryptoReport("plisio", 20)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rep, nil)
}

func (a *PaymentController) zarinpalCallback(c *gin.Context) {
	basePath := c.GetString("base_path")
	if basePath == "" {
		basePath = "/"
	}
	billingPage := basePath + "panel/billing"
	redirect := func(query string) {
		c.Header("Cache-Control", "no-store")
		c.Redirect(http.StatusFound, billingPage+query)
	}

	authority := c.Query("Authority")
	status := c.Query("Status")
	if authority == "" {
		redirect("?status=failed")
		return
	}
	payment, err := a.paymentService.GetByAuthority(authority)
	if err != nil {
		redirect("?status=failed")
		return
	}
	// The buyer returns in their own browser session — only the owner of the
	// payment may complete it.
	if user := session.GetLoginUser(c); user == nil || user.Id != payment.UserId {
		redirect("?status=failed")
		return
	}
	if status != "OK" {
		_ = a.paymentService.MarkFailed(authority)
		redirect("?status=cancelled")
		return
	}
	if payment.Status == model.PaymentPaid {
		redirect("?status=ok&refId=" + payment.RefId)
		return
	}

	refID, _, err := a.zarinpalService.VerifyPayment(payment.Amount, authority)
	if err != nil {
		logger.Warning("zarinpal verify failed:", err)
		_ = a.paymentService.MarkFailed(authority)
		redirect("?status=failed")
		return
	}
	transitioned, p, err := a.paymentService.MarkPaid(authority, refID)
	if err != nil {
		redirect("?status=failed")
		return
	}
	if transitioned {
		if _, cErr := a.walletService.Credit(p.UserId, p.Amount, "ZarinPal top-up ref:"+refID); cErr != nil {
			// Money was captured but crediting failed — log loudly for manual reconciliation.
			logger.Errorf("zarinpal: payment %s verified (ref %s) but crediting user %d with %d failed: %v",
				authority, refID, p.UserId, p.Amount, cErr)
		}
	}
	redirect("?status=ok&refId=" + refID)
}

func (a *PaymentController) listPayments(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	rows, err := a.paymentService.ListForUser(user.Id, 50, 0)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}
