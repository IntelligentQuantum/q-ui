package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/logger"
	"github.com/mhsanaei/3x-ui/v3/web/service"

	"github.com/gin-gonic/gin"
)

// PlisioWebhookController handles Plisio's server-to-server payment callbacks.
// It is PUBLIC (no session, no CSRF) because Plisio's servers call it directly;
// authenticity is established by verifying the HMAC-SHA1 verify_hash against the
// configured Plisio secret key instead. It is the only place a crypto deposit is
// credited, and it is idempotent so replays/duplicates never double-credit.
type PlisioWebhookController struct {
	plisioService  service.PlisioService
	paymentService service.PaymentService
	walletService  service.WalletService
	settingService service.SettingService
	userService    service.UserService
}

// NewPlisioWebhookController registers the public callback route on the base
// group (sibling to /login), so no auth/CSRF middleware is applied.
func NewPlisioWebhookController(g *gin.RouterGroup) *PlisioWebhookController {
	a := &PlisioWebhookController{}
	g.POST("/plisio/callback", a.callback)
	return a
}

func (a *PlisioWebhookController) callback(c *gin.Context) {
	// Plisio's default callback is application/x-www-form-urlencoded.
	if err := c.Request.ParseForm(); err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	form := c.Request.PostForm

	enabled, _ := a.settingService.GetPlisioEnable()
	secret, _ := a.settingService.GetPlisioSecretKey()
	if !enabled || strings.TrimSpace(secret) == "" {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	// 1. Authenticity: reject forged/replayed callbacks with a bad signature.
	if !a.plisioService.VerifyCallback(form, secret) {
		logger.Warning("plisio webhook: signature verification failed")
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	orderNumber := form.Get("order_number")
	txnID := form.Get("txn_id")
	status := form.Get("status")

	payment, err := a.paymentService.GetByAuthority(orderNumber)
	if err != nil || payment.Gateway != "plisio" {
		// Unknown order — acknowledge so Plisio stops retrying; nothing to do.
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	// Only a fully-paid invoice credits the wallet. For any non-terminal or
	// failure status we acknowledge and leave the payment pending: Plisio reuses
	// the same order_number when a buyer switches cryptocurrency mid-payment, so
	// marking it failed here could strand a deposit that later completes.
	if status != "completed" {
		logger.Debugf("plisio webhook: order %s status=%s (ignored)", orderNumber, status)
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	// 2. Validate currency and amount against what we requested (defense in depth;
	//    "completed" already implies paid-in-full per Plisio).
	cfgCurrency, _ := a.settingService.GetPlisioSourceCurrency()
	if sc := form.Get("source_currency"); sc != "" && !strings.EqualFold(sc, cfgCurrency) {
		logger.Warningf("plisio webhook: order %s currency mismatch (got %s, want %s)", orderNumber, sc, cfgCurrency)
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}
	// source_amount is the fiat amount; payment.Amount is in wallet credits. Convert
	// the paid fiat back to credits at the configured rate and require it to cover the
	// deposit (1% tolerance absorbs the invoice's 2-decimal fiat rounding).
	rate, _ := a.settingService.GetCryptoExchangeRate()
	if sa := form.Get("source_amount"); sa != "" {
		if paid, perr := strconv.ParseFloat(sa, 64); perr == nil && paid*float64(rate) < float64(payment.Amount)*0.99 {
			logger.Warningf("plisio webhook: order %s underpaid (got %s %s, want %d credits @ %d)",
				orderNumber, sa, cfgCurrency, payment.Amount, rate)
			c.JSON(http.StatusOK, gin.H{"success": true})
			return
		}
	}

	// 3. Compute the configurable deposit bonus (eligibility checked against the
	//    buyer's role) using current settings, so changes apply immediately.
	bonus, pct := a.computeBonus(payment.UserId, payment.Amount)

	// 4. Idempotent transition: only the first caller credits the wallet. Record
	//    the cryptocurrency actually paid (e.g. BTC) for the admin report.
	coin := form.Get("currency")
	transitioned, p, err := a.paymentService.MarkPaidWithBonus(orderNumber, txnID, coin, bonus)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if transitioned {
		// Deposit and bonus are recorded as two distinct ledger rows for a clear
		// auditable history (each call is atomic with its balance update).
		if _, cErr := a.walletService.CreditWithMeta(p.UserId, p.Amount,
			fmt.Sprintf("Plisio crypto deposit (%s) ref:%s", p.Currency, txnID),
			service.TxMeta{Source: model.TxSourceCrypto, RefId: txnID}); cErr != nil {
			logger.Errorf("plisio: order %s confirmed but crediting user %d deposit %d failed: %v",
				orderNumber, p.UserId, p.Amount, cErr)
		}
		if bonus > 0 {
			if _, cErr := a.walletService.CreditWithMeta(p.UserId, bonus,
				fmt.Sprintf("Plisio crypto deposit bonus %d%% ref:%s", pct, txnID),
				service.TxMeta{Source: model.TxSourceBonus, RefId: txnID}); cErr != nil {
				logger.Errorf("plisio: order %s bonus credit of %d to user %d failed: %v",
					orderNumber, bonus, p.UserId, cErr)
			}
		}
		logger.Infof("plisio: credited user %d with %d (+%d bonus) for order %s", p.UserId, p.Amount, bonus, orderNumber)
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// computeBonus returns the bonus credits to grant for a deposit and the percent
// applied. It is zero unless the bonus is enabled, the buyer is a member or
// reseller, the percent is positive, and the deposit clears the configured
// minimum; the result is capped at the configured maximum when set.
func (a *PlisioWebhookController) computeBonus(userId int, deposit int64) (int64, int) {
	enabled, _ := a.settingService.GetCryptoBonusEnabled()
	if !enabled {
		return 0, 0
	}
	user, err := a.userService.GetUserByID(userId)
	if err != nil || !bonusEligibleRole(user.CanonicalRole()) {
		return 0, 0
	}
	pct, _ := a.settingService.GetCryptoBonusPercent()
	if pct <= 0 {
		return 0, 0
	}
	if minDep, _ := a.settingService.GetCryptoBonusMinDeposit(); minDep > 0 && deposit < int64(minDep) {
		return 0, 0
	}
	bonus := deposit * int64(pct) / 100
	if maxBonus, _ := a.settingService.GetCryptoBonusMax(); maxBonus > 0 && bonus > int64(maxBonus) {
		bonus = int64(maxBonus)
	}
	return bonus, pct
}

// bonusEligibleRole reports whether a role earns the crypto deposit bonus.
// Only members and resellers qualify; admin manual changes and internal
// transfers never receive a bonus.
func bonusEligibleRole(role string) bool {
	switch model.NormalizeRole(role) {
	case model.RoleMember, model.RoleReseller:
		return true
	default:
		return false
	}
}
