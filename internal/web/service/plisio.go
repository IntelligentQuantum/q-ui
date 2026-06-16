package service

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Plisio errors surfaced to callers.
var (
	ErrPlisioDisabled = errors.New("plisio crypto gateway is disabled")
)

const (
	plisioHTTPTimeout = 25 * time.Second
	plisioAPIBase     = "https://api.plisio.net/api/v1"
)

// PlisioService talks to the Plisio crypto-payment gateway and verifies its
// callbacks. It reads the secret key from settings on every call so config
// changes take effect without a restart. Plisio uses a single "Secret Key"
// for both API authentication (api_key) and callback signing (verify_hash).
type PlisioService struct {
	settingService SettingService
}

// plisioInvoiceResponse models the invoices/new response (non white-label).
// Error responses reuse the same envelope with name/message/code in data.
type plisioInvoiceResponse struct {
	Status string `json:"status"`
	Data   struct {
		TxnID      string `json:"txn_id"`
		InvoiceURL string `json:"invoice_url"`
		// Error fields:
		Name    string `json:"name"`
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"data"`
}

// CreateInvoice opens a Plisio invoice priced in a fiat currency. orderNumber is
// our own unique merchant reference (the payment authority) which Plisio echoes
// back on every callback — it is stable across the user switching cryptocurrency
// mid-payment, unlike txn_id. Returns the Plisio txn id and the hosted invoice
// URL the browser should be sent to.
func (p *PlisioService) CreateInvoice(orderNumber, orderName, description, callbackURL, successURL, failURL, email, sourceCurrency string, sourceAmount float64) (txnID, invoiceURL string, err error) {
	enabled, _ := p.settingService.GetPlisioEnable()
	if !enabled {
		return "", "", ErrPlisioDisabled
	}
	secret, _ := p.settingService.GetPlisioSecretKey()
	if strings.TrimSpace(secret) == "" {
		return "", "", errors.New("plisio secret key is not configured")
	}

	q := url.Values{}
	q.Set("source_currency", sourceCurrency)
	// Fiat is priced to 2 decimals (standard for the supported fiat currencies).
	q.Set("source_amount", strconv.FormatFloat(sourceAmount, 'f', 2, 64))
	q.Set("order_number", orderNumber)
	q.Set("order_name", orderName)
	if description != "" {
		q.Set("description", description)
	}
	if callbackURL != "" {
		q.Set("callback_url", callbackURL)
	}
	if successURL != "" {
		q.Set("success_invoice_url", successURL)
	}
	if failURL != "" {
		q.Set("fail_invoice_url", failURL)
	}
	if email != "" {
		q.Set("email", email)
	}
	q.Set("api_key", secret)

	reqURL := plisioAPIBase + "/invoices/new?" + q.Encode()
	client := p.settingService.NewProxiedHTTPClient(plisioHTTPTimeout)
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", "", err
	}
	var parsed plisioInvoiceResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", "", fmt.Errorf("plisio: invalid response (%s): %w", resp.Status, err)
	}
	if parsed.Status != "success" || parsed.Data.TxnID == "" || parsed.Data.InvoiceURL == "" {
		msg := parsed.Data.Message
		if msg == "" {
			msg = parsed.Status
		}
		return "", "", fmt.Errorf("plisio invoice failed (code %d): %s", parsed.Data.Code, msg)
	}
	return parsed.Data.TxnID, parsed.Data.InvoiceURL, nil
}

// VerifyCallback validates a Plisio callback's verify_hash against the secret
// key. Plisio (default, form-encoded callback) signs the HMAC-SHA1 of the
// PHP-serialized POST body with verify_hash removed and keys ksort-ed. Because
// every form value arrives as a string, the serialization is fully
// deterministic to reproduce in Go. Constant-time comparison guards the result.
func (p *PlisioService) VerifyCallback(form url.Values, secret string) bool {
	verifyHash := form.Get("verify_hash")
	if verifyHash == "" || strings.TrimSpace(secret) == "" {
		return false
	}

	keys := make([]string, 0, len(form))
	for k := range form {
		if k == "verify_hash" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys) // PHP ksort over string keys == byte-order sort for ASCII keys

	var b strings.Builder
	b.WriteString("a:")
	b.WriteString(strconv.Itoa(len(keys)))
	b.WriteString(":{")
	for _, k := range keys {
		phpSerializeString(&b, k)
		phpSerializeString(&b, form.Get(k))
	}
	b.WriteString("}")

	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(b.String()))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(verifyHash))
}

// phpSerializeString appends a PHP serialize() string token: s:<bytelen>:"<v>";
func phpSerializeString(b *strings.Builder, s string) {
	b.WriteString("s:")
	b.WriteString(strconv.Itoa(len(s)))
	b.WriteString(`:"`)
	b.WriteString(s)
	b.WriteString(`";`)
}
