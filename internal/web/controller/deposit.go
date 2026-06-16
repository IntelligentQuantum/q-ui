package controller

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// DepositController exposes the manual card-to-card deposit system:
//
//   - Buyers (admin/reseller/member — anyone with product.purchase) see the
//     active payment cards, submit a deposit request with an optional receipt,
//     and view their own request history.
//   - Admins (deposit.manage) manage the payment cards and review the request
//     queue, approving (credits the wallet) or rejecting (with a reason) each.
//
// Every route is gated server-side; the SPA gating is cosmetic only.
type DepositController struct {
	depositService service.DepositService
}

// NewDepositController registers the deposit routes on the given API group.
func NewDepositController(g *gin.RouterGroup) *DepositController {
	a := &DepositController{}
	a.initRouter(g)
	return a
}

func (a *DepositController) initRouter(g *gin.RouterGroup) {
	billing := g.Group("/billing")

	// Buyer-facing routes: any logged-in user who may top up their own balance.
	buyer := billing.Group("")
	buyer.Use(middleware.RequirePermission(model.PermProductPurchase))
	buyer.GET("/payment-cards", a.listActiveCards)
	buyer.GET("/deposits", a.listMine)
	buyer.POST("/deposits", a.submit)
	// Receipt download — owner or admin only (enforced in the handler).
	buyer.GET("/deposits/:id/receipt", a.receipt)

	// Admin-facing routes: review queue + card management.
	admin := billing.Group("/admin")
	admin.Use(middleware.RequirePermission(model.PermDepositManage))
	admin.GET("/payment-cards", a.listAllCards)
	admin.POST("/payment-cards", a.createCard)
	admin.POST("/payment-cards/:id", a.updateCard)
	admin.POST("/payment-cards/:id/del", a.deleteCard)
	admin.POST("/payment-cards/:id/status", a.setCardStatus)
	admin.GET("/deposits", a.listAll)
	admin.POST("/deposits/:id/approve", a.approve)
	admin.POST("/deposits/:id/reject", a.reject)
}

// ---------------------------------------------------------------------------
// Buyer endpoints
// ---------------------------------------------------------------------------

// listActiveCards returns the active payment cards a buyer can transfer to.
func (a *DepositController) listActiveCards(c *gin.Context) {
	cards, err := a.depositService.ListCards(true)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, cards, nil)
}

// listMine returns the current user's own deposit requests.
func (a *DepositController) listMine(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	rows, err := a.depositService.ListForUser(user.Id, limit, offset)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

// submit records a new pending deposit request. The body is a multipart form so
// an optional receipt image can be attached; everything else is plain fields.
func (a *DepositController) submit(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	// Cap the whole request body to the receipt limit plus a small headroom for
	// the other form fields, so a hostile upload can't exhaust memory.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxReceiptSize+(1<<20))

	amount, _ := strconv.ParseInt(c.PostForm("amount"), 10, 64)
	if amount <= 0 {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.manualDeposit.toasts.invalidAmount"))
		return
	}

	// Optional receipt image: validate by byte signature, then persist.
	var receiptName string
	if file, _, err := c.Request.FormFile("receipt"); err == nil {
		defer file.Close()
		data, rerr := io.ReadAll(io.LimitReader(file, service.MaxReceiptSize+1))
		if rerr != nil {
			jsonMsg(c, I18nWeb(c, "somethingWentWrong"), rerr)
			return
		}
		ext, verr := service.ValidateReceipt(data)
		if verr != nil {
			pureJsonMsg(c, http.StatusOK, false, depositErrorMessage(c, verr))
			return
		}
		name, serr := a.depositService.SaveReceipt(data, ext)
		if serr != nil {
			jsonMsg(c, I18nWeb(c, "somethingWentWrong"), serr)
			return
		}
		receiptName = name
	} else if !errors.Is(err, http.ErrMissingFile) {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}

	req, err := a.depositService.CreateRequest(user.Id, service.DepositInput{
		Amount:         amount,
		TrackingNumber: c.PostForm("trackingNumber"),
		Description:    c.PostForm("description"),
		ReceiptImage:   receiptName,
	})
	if err != nil {
		if msg := depositErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, req, nil)
}

// receipt streams a stored receipt image. Only the request owner or an admin may
// fetch it — receipts are private financial documents and are never served from
// the public static mount.
func (a *DepositController) receipt(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	req, err := a.depositService.Get(id)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if !user.IsAdmin() && user.Id != req.UserId {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if req.ReceiptImage == "" {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	path, err := a.depositService.ReceiptFilePath(req.ReceiptImage)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.File(path)
}

// ---------------------------------------------------------------------------
// Admin endpoints — payment cards
// ---------------------------------------------------------------------------

func (a *DepositController) listAllCards(c *gin.Context) {
	cards, err := a.depositService.ListCards(false)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, cards, nil)
}

func (a *DepositController) createCard(c *gin.Context) {
	var in service.CardInput
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	card, err := a.depositService.CreateCard(in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCard) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.adminDeposits.toasts.invalidCard"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, card, nil)
}

func (a *DepositController) updateCard(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var in service.CardInput
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	card, err := a.depositService.UpdateCard(id, in)
	if err != nil {
		if msg := depositErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, card, nil)
}

func (a *DepositController) deleteCard(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.depositService.DeleteCard(id); err != nil {
		if msg := depositErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

type cardStatusForm struct {
	Active bool `json:"active"`
}

func (a *DepositController) setCardStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form cardStatusForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.depositService.SetCardStatus(id, form.Active); err != nil {
		if msg := depositErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

// ---------------------------------------------------------------------------
// Admin endpoints — review queue
// ---------------------------------------------------------------------------

func (a *DepositController) listAll(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	rows, err := a.depositService.ListAll(c.Query("status"), c.Query("search"), limit, offset)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *DepositController) approve(c *gin.Context) {
	admin := session.GetLoginUser(c)
	if admin == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	req, err := a.depositService.Approve(admin.Id, id)
	if err != nil {
		if msg := depositErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		// A verified deposit that fails to credit is a money-impacting anomaly.
		logger.Errorf("manual-deposit approve failed for id %d: %v", id, err)
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, req, nil)
}

type depositRejectForm struct {
	Reason string `json:"reason"`
}

func (a *DepositController) reject(c *gin.Context) {
	admin := session.GetLoginUser(c)
	if admin == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	var form depositRejectForm
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	req, err := a.depositService.Reject(admin.Id, id, form.Reason)
	if err != nil {
		if msg := depositErrorMessage(c, err); msg != "" {
			pureJsonMsg(c, http.StatusOK, false, msg)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, req, nil)
}

// depositErrorMessage maps known deposit-service sentinels to localized
// messages. Returns "" for unknown errors so the caller falls back to generic.
func depositErrorMessage(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrDuplicateDeposit):
		return I18nWeb(c, "pages.manualDeposit.toasts.duplicate")
	case errors.Is(err, service.ErrInvalidDeposit):
		return I18nWeb(c, "pages.manualDeposit.toasts.invalidAmount")
	case errors.Is(err, service.ErrReceiptTooLarge):
		return I18nWeb(c, "pages.manualDeposit.toasts.receiptTooLarge")
	case errors.Is(err, service.ErrInvalidReceiptType):
		return I18nWeb(c, "pages.manualDeposit.toasts.receiptType")
	case errors.Is(err, service.ErrInvalidReceipt):
		return I18nWeb(c, "pages.manualDeposit.toasts.receiptInvalid")
	case errors.Is(err, service.ErrDepositNotFound):
		return I18nWeb(c, "pages.adminDeposits.toasts.notFound")
	case errors.Is(err, service.ErrDepositNotPending):
		return I18nWeb(c, "pages.adminDeposits.toasts.notPending")
	case errors.Is(err, service.ErrCardNotFound):
		return I18nWeb(c, "pages.adminDeposits.toasts.cardNotFound")
	case errors.Is(err, service.ErrInvalidCard):
		return I18nWeb(c, "pages.adminDeposits.toasts.invalidCard")
	default:
		return ""
	}
}
