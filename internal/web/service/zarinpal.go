package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Zarinpal errors surfaced to callers.
var (
	ErrZarinpalDisabled    = errors.New("zarinpal payment gateway is disabled")
	ErrZarinpalNotVerified = errors.New("zarinpal payment was not verified")
)

const zarinpalHTTPTimeout = 20 * time.Second

// ZarinpalConfig is the per-call gateway configuration. It is built from either
// the global settings (admin/tenant-0) or a Manager workspace's own settings, so
// each tenant's payments go to THAT tenant's merchant — never a shared one. A
// tenant with no merchant configured is simply not Enabled (fail-safe: a missing
// config disables the gateway, it never falls back to another merchant).
type ZarinpalConfig struct {
	Enabled  bool
	Merchant string
	Sandbox  bool
	Currency string
}

// ZarinpalService talks to the ZarinPal REST gateway (v4). Gateway credentials
// are passed in per call via ZarinpalConfig (resolved per tenant by the caller);
// only the proxy HTTP client is read from global settings.
type ZarinpalService struct {
	settingService SettingService
}

// zpBaseURL returns the API host for the configured environment.
func zpBaseURL(sandbox bool) string {
	if sandbox {
		return "https://sandbox.zarinpal.com"
	}
	return "https://payment.zarinpal.com"
}

// StartPayURL is the page the buyer's browser is redirected to after a
// successful request.
func (z *ZarinpalService) StartPayURL(cfg ZarinpalConfig, authority string) string {
	return zpBaseURL(cfg.Sandbox) + "/pg/StartPay/" + authority
}

type zpRequestBody struct {
	MerchantId  string            `json:"merchant_id"`
	Amount      int64             `json:"amount"`
	Currency    string            `json:"currency,omitempty"`
	Description string            `json:"description"`
	CallbackURL string            `json:"callback_url"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

type zpVerifyBody struct {
	MerchantId string `json:"merchant_id"`
	Amount     int64  `json:"amount"`
	Authority  string `json:"authority"`
}

// zpResponse models both request and verify responses. `errors` is an array on
// success and an object on failure, so it is captured as RawMessage and only
// inspected when the data code is unsuccessful.
type zpResponse struct {
	Data struct {
		Code      int    `json:"code"`
		Message   string `json:"message"`
		Authority string `json:"authority"`
		RefID     int64  `json:"ref_id"`
	} `json:"data"`
	Errors json.RawMessage `json:"errors"`
}

func (z *ZarinpalService) postJSON(url string, body any) (*zpResponse, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	client := z.settingService.NewProxiedHTTPClient(zarinpalHTTPTimeout)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var parsed zpResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("zarinpal: invalid response (%s): %w", resp.Status, err)
	}
	return &parsed, nil
}

// RequestPayment opens a payment for `amount` credits and returns the gateway
// authority plus the StartPay URL the browser should be redirected to.
func (z *ZarinpalService) RequestPayment(cfg ZarinpalConfig, amount int64, description, callbackURL, email, mobile string) (authority string, startPay string, err error) {
	if !cfg.Enabled {
		return "", "", ErrZarinpalDisabled
	}
	if cfg.Merchant == "" {
		return "", "", errors.New("zarinpal merchant id is not configured")
	}

	metadata := map[string]string{}
	if email != "" {
		metadata["email"] = email
	}
	if mobile != "" {
		metadata["mobile"] = mobile
	}

	resp, err := z.postJSON(zpBaseURL(cfg.Sandbox)+"/pg/v4/payment/request.json", zpRequestBody{
		MerchantId:  cfg.Merchant,
		Amount:      amount,
		Currency:    cfg.Currency,
		Description: description,
		CallbackURL: callbackURL,
		Metadata:    metadata,
	})
	if err != nil {
		return "", "", err
	}
	if resp.Data.Code != 100 || resp.Data.Authority == "" {
		return "", "", fmt.Errorf("zarinpal request failed (code %d): %s", resp.Data.Code, string(resp.Errors))
	}
	return resp.Data.Authority, z.StartPayURL(cfg, resp.Data.Authority), nil
}

// VerifyPayment confirms a returned authority for the given amount. A ref id is
// returned on success. Codes 100 (first verify) and 101 (already verified) both
// mean the money was captured.
func (z *ZarinpalService) VerifyPayment(cfg ZarinpalConfig, amount int64, authority string) (refID string, alreadyVerified bool, err error) {
	resp, err := z.postJSON(zpBaseURL(cfg.Sandbox)+"/pg/v4/payment/verify.json", zpVerifyBody{
		MerchantId: cfg.Merchant,
		Amount:     amount,
		Authority:  authority,
	})
	if err != nil {
		return "", false, err
	}
	switch resp.Data.Code {
	case 100:
		return strconv.FormatInt(resp.Data.RefID, 10), false, nil
	case 101:
		return strconv.FormatInt(resp.Data.RefID, 10), true, nil
	default:
		return "", false, fmt.Errorf("%w (code %d): %s", ErrZarinpalNotVerified, resp.Data.Code, string(resp.Errors))
	}
}
