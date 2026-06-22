package service

import (
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"

	"gorm.io/gorm"
)

// Manager-editable tenant setting keys. This is a deliberate SUBSET of the
// global settings surface: branding, registration and subscription defaults.
// Infrastructure keys (web port, base path, TLS, LDAP, xray, session) stay in
// the global `settings` table and are admin-only — a manager can never reach
// them. Payment-gateway keys are managed separately under tenant.payments.
const (
	tsBrandTitle         = "brandTitle"
	tsBrandLogo          = "brandLogo"
	tsBrandFavicon       = "brandFavicon"
	tsTheme              = "theme"
	tsRegistrationEnable = "registrationEnable"
	tsSubTitle           = "subTitle"

	// Payment gateways (manager-editable under tenant.payments). A tenant's
	// payments go to ITS OWN merchant; there is deliberately no fallback to the
	// global/admin merchant — an unconfigured tenant gateway is simply disabled.
	tsZarinpalEnable   = "zarinpalEnable"
	tsZarinpalMerchant = "zarinpalMerchantId"
	tsZarinpalSandbox  = "zarinpalSandbox"
	tsZarinpalCurrency = "zarinpalCurrency"
	tsPlisioEnable     = "plisioEnable"
	tsPlisioSecretKey  = "plisioSecretKey"

	// Per-workspace pricing (manager-editable under tenant.settings): the credits a
	// non-admin in this workspace is charged to create / reset a client. Unset keys
	// fall back to the global per-role rate, so a fresh workspace inherits sensible
	// values until the manager sets its own (a manager prices their own moderators).
	tsClientCost            = "clientCost"
	tsClientCostPerGB       = "clientCostPerGB"
	tsResetTrafficCost      = "resetTrafficCost"
	tsResetTrafficCostPerGB = "resetTrafficCostPerGB"
)

// TenantSettingService reads/writes per-tenant configuration in the
// tenant_settings key/value table. Reads fall back to the global default when a
// tenant hasn't overridden a key, so a fresh workspace inherits sensible values.
// It is stateless.
type TenantSettingService struct {
	settingService SettingService
}

// TenantSettingsView is the manager-facing settings payload (the editable subset).
// Slug is the workspace URL id (/panel/manager/<slug>) — stored on the Tenant
// row, not tenant_settings — which the manager may rename here.
type TenantSettingsView struct {
	Slug               string `json:"slug"`
	BrandTitle         string `json:"brandTitle"`
	BrandLogo          string `json:"brandLogo"`
	BrandFavicon       string `json:"brandFavicon"`
	Theme              string `json:"theme"`
	RegistrationEnable bool   `json:"registrationEnable"`
	SubTitle           string `json:"subTitle"`
}

// raw loads a tenant's stored key/value overrides into a map.
func (s *TenantSettingService) raw(tenantID int) (map[string]string, error) {
	var rows []model.TenantSetting
	if err := database.GetDB().Where("tenant_id = ?", tenantID).Find(&rows).Error; err != nil {
		return nil, err
	}
	m := make(map[string]string, len(rows))
	for _, r := range rows {
		m[r.Key] = r.Value
	}
	return m, nil
}

func mapOr(m map[string]string, key, fallback string) string {
	if v, ok := m[key]; ok && strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

func mapBool(m map[string]string, key string, fallback bool) bool {
	if v, ok := m[key]; ok && v != "" {
		return v == "true" || v == "1"
	}
	return fallback
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// mapIntOr returns the parsed int for a PRESENT key (even "0", so a manager can
// deliberately set a cost to zero), falling back to `fallback` when the key is
// absent or unparseable.
func mapIntOr(m map[string]string, key string, fallback int) int {
	if v, ok := m[key]; ok {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return fallback
}

// Get assembles a tenant's effective settings (overrides layered over global
// defaults). The global tenant (admin, id 0) has no per-tenant overrides; the
// view simply reflects the global values.
func (s *TenantSettingService) Get(tenantID int) (*TenantSettingsView, error) {
	m, err := s.raw(tenantID)
	if err != nil {
		return nil, err
	}
	globalTitle, _ := s.settingService.GetPanelTitle()
	globalReg, _ := s.settingService.GetRegistrationEnable()
	slug := ""
	if tenantID != model.GlobalTenantId {
		var t model.Tenant
		if err := database.GetDB().Select("slug").Where("id = ?", tenantID).First(&t).Error; err == nil {
			slug = t.Slug
		}
	}
	return &TenantSettingsView{
		Slug:               slug,
		BrandTitle:         mapOr(m, tsBrandTitle, globalTitle),
		BrandLogo:          m[tsBrandLogo],
		BrandFavicon:       m[tsBrandFavicon],
		Theme:              mapOr(m, tsTheme, "system"),
		RegistrationEnable: mapBool(m, tsRegistrationEnable, globalReg),
		SubTitle:           m[tsSubTitle],
	}, nil
}

// Update upserts the manager-editable keys for a tenant in one transaction. When
// a (changed, non-empty) slug is supplied for a real tenant it is validated,
// checked for uniqueness and written to the Tenant row — letting a manager rename
// their own workspace URL (/panel/manager/<slug>).
func (s *TenantSettingService) Update(tenantID int, v TenantSettingsView) error {
	if tenantID != model.GlobalTenantId {
		slug := strings.ToLower(strings.TrimSpace(v.Slug))
		if slug != "" {
			var t model.Tenant
			if err := database.GetDB().Select("slug").Where("id = ?", tenantID).First(&t).Error; err == nil && slug != t.Slug {
				if !model.ValidateSlug(slug) {
					return ErrSlugInvalid
				}
				var count int64
				if err := database.GetDB().Model(model.Tenant{}).Where("slug = ? AND id <> ?", slug, tenantID).Count(&count).Error; err != nil {
					return err
				}
				if count > 0 {
					return ErrSlugTaken
				}
				if err := database.GetDB().Model(model.Tenant{}).Where("id = ?", tenantID).Update("slug", slug).Error; err != nil {
					return err
				}
			}
		}
	}
	theme := strings.TrimSpace(v.Theme)
	if theme == "" {
		theme = "system"
	}
	kv := map[string]string{
		tsBrandTitle:         strings.TrimSpace(v.BrandTitle),
		tsBrandLogo:          strings.TrimSpace(v.BrandLogo),
		tsBrandFavicon:       strings.TrimSpace(v.BrandFavicon),
		tsTheme:              theme,
		tsRegistrationEnable: boolStr(v.RegistrationEnable),
		tsSubTitle:           strings.TrimSpace(v.SubTitle),
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for key, val := range kv {
			if err := s.upsert(tx, tenantID, key, val); err != nil {
				return err
			}
		}
		return nil
	})
}

// TenantPaymentSettingsView is the manager-editable gateway config (gated by
// tenant.payments). The Plisio secret is write-only-ish: it is returned so the
// manager can see/replace it, but lives only in the tenant's own settings.
type TenantPaymentSettingsView struct {
	ZarinpalEnable     bool   `json:"zarinpalEnable"`
	ZarinpalMerchantId string `json:"zarinpalMerchantId"`
	ZarinpalSandbox    bool   `json:"zarinpalSandbox"`
	ZarinpalCurrency   string `json:"zarinpalCurrency"`
	PlisioEnable       bool   `json:"plisioEnable"`
	PlisioSecretKey    string `json:"plisioSecretKey"`
}

// GetPayment returns a tenant's stored gateway config (no global fallback —
// a workspace configures its own gateways).
func (s *TenantSettingService) GetPayment(tenantID int) (*TenantPaymentSettingsView, error) {
	m, err := s.raw(tenantID)
	if err != nil {
		return nil, err
	}
	return &TenantPaymentSettingsView{
		ZarinpalEnable:     m[tsZarinpalEnable] == "true",
		ZarinpalMerchantId: m[tsZarinpalMerchant],
		ZarinpalSandbox:    m[tsZarinpalSandbox] == "true",
		ZarinpalCurrency:   mapOr(m, tsZarinpalCurrency, "IRT"),
		PlisioEnable:       m[tsPlisioEnable] == "true",
		PlisioSecretKey:    m[tsPlisioSecretKey],
	}, nil
}

// UpdatePayment upserts a tenant's gateway config.
func (s *TenantSettingService) UpdatePayment(tenantID int, v TenantPaymentSettingsView) error {
	currency := strings.TrimSpace(v.ZarinpalCurrency)
	if currency == "" {
		currency = "IRT"
	}
	kv := map[string]string{
		tsZarinpalEnable:   boolStr(v.ZarinpalEnable),
		tsZarinpalMerchant: strings.TrimSpace(v.ZarinpalMerchantId),
		tsZarinpalSandbox:  boolStr(v.ZarinpalSandbox),
		tsZarinpalCurrency: currency,
		tsPlisioEnable:     boolStr(v.PlisioEnable),
		tsPlisioSecretKey:  strings.TrimSpace(v.PlisioSecretKey),
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for key, val := range kv {
			if err := s.upsert(tx, tenantID, key, val); err != nil {
				return err
			}
		}
		return nil
	})
}

// TenantPricingView is the manager-editable per-workspace pricing: the credits a
// non-admin in this workspace pays to create or reset a client. These override the
// global per-role rates for the workspace, so a manager prices their own moderators.
type TenantPricingView struct {
	ClientCost            int `json:"clientCost"`
	ClientCostPerGB       int `json:"clientCostPerGB"`
	ResetTrafficCost      int `json:"resetTrafficCost"`
	ResetTrafficCostPerGB int `json:"resetTrafficCostPerGB"`
}

// GetPricing returns a workspace's effective pricing — its own overrides where set,
// otherwise the global per-role defaults (shown as the starting point so a fresh
// workspace reflects current rates rather than zero).
func (s *TenantSettingService) GetPricing(tenantID int) (*TenantPricingView, error) {
	cBase, cPerGB := s.EffectiveClientCost(tenantID, model.RoleModerator)
	rBase, rPerGB := s.EffectiveResetCost(tenantID, model.RoleModerator)
	return &TenantPricingView{
		ClientCost:            cBase,
		ClientCostPerGB:       cPerGB,
		ResetTrafficCost:      rBase,
		ResetTrafficCostPerGB: rPerGB,
	}, nil
}

// UpdatePricing upserts a workspace's pricing. The global tenant (admin) is a
// no-op here — its pricing lives in the global settings (admin-only).
func (s *TenantSettingService) UpdatePricing(tenantID int, v TenantPricingView) error {
	if tenantID == model.GlobalTenantId {
		return nil
	}
	clamp := func(n int) string {
		if n < 0 {
			n = 0
		}
		return strconv.Itoa(n)
	}
	kv := map[string]string{
		tsClientCost:            clamp(v.ClientCost),
		tsClientCostPerGB:       clamp(v.ClientCostPerGB),
		tsResetTrafficCost:      clamp(v.ResetTrafficCost),
		tsResetTrafficCostPerGB: clamp(v.ResetTrafficCostPerGB),
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for key, val := range kv {
			if err := s.upsert(tx, tenantID, key, val); err != nil {
				return err
			}
		}
		return nil
	})
}

// EffectiveClientCost returns the (base, perGB) credits charged to a non-admin in
// tenantID for CREATING a client: the workspace's own pricing where set, else the
// global per-role rate. The global tenant (0) always uses the global rate.
func (s *TenantSettingService) EffectiveClientCost(tenantID int, role string) (base, perGB int) {
	base, _ = s.settingService.GetClientCostForRole(role)
	perGB, _ = s.settingService.GetClientCostPerGBForRole(role)
	if tenantID == model.GlobalTenantId {
		return base, perGB
	}
	m, err := s.raw(tenantID)
	if err != nil {
		return base, perGB
	}
	return mapIntOr(m, tsClientCost, base), mapIntOr(m, tsClientCostPerGB, perGB)
}

// EffectiveResetCost is EffectiveClientCost's counterpart for RESETTING a client's
// traffic quota.
func (s *TenantSettingService) EffectiveResetCost(tenantID int, role string) (base, perGB int) {
	base, _ = s.settingService.GetResetTrafficCostForRole(role)
	perGB, _ = s.settingService.GetResetTrafficCostPerGBForRole(role)
	if tenantID == model.GlobalTenantId {
		return base, perGB
	}
	m, err := s.raw(tenantID)
	if err != nil {
		return base, perGB
	}
	return mapIntOr(m, tsResetTrafficCost, base), mapIntOr(m, tsResetTrafficCostPerGB, perGB)
}

// ZarinpalConfig resolves the effective ZarinPal config for a tenant. The global
// tenant (0) uses the global settings (unchanged behavior). A Manager workspace
// uses ITS OWN merchant only — enabled solely when the tenant explicitly turned
// it on AND set a merchant id; there is no fallback to the admin's merchant, so a
// misconfiguration disables the gateway rather than misrouting a payment.
func (s *TenantSettingService) ZarinpalConfig(tenantID int) ZarinpalConfig {
	if tenantID == model.GlobalTenantId {
		en, _ := s.settingService.GetZarinpalEnable()
		merchant, _ := s.settingService.GetZarinpalMerchantId()
		sandbox, _ := s.settingService.GetZarinpalSandbox()
		currency, _ := s.settingService.GetZarinpalCurrency()
		return ZarinpalConfig{Enabled: en, Merchant: merchant, Sandbox: sandbox, Currency: currency}
	}
	m, err := s.raw(tenantID)
	if err != nil {
		return ZarinpalConfig{}
	}
	merchant := strings.TrimSpace(m[tsZarinpalMerchant])
	return ZarinpalConfig{
		Enabled:  m[tsZarinpalEnable] == "true" && merchant != "",
		Merchant: merchant,
		Sandbox:  m[tsZarinpalSandbox] == "true",
		Currency: mapOr(m, tsZarinpalCurrency, "IRT"),
	}
}

// PlisioConfig resolves the effective Plisio config for a tenant, with the same
// own-merchant-only rule as ZarinpalConfig.
func (s *TenantSettingService) PlisioConfig(tenantID int) PlisioConfig {
	if tenantID == model.GlobalTenantId {
		en, _ := s.settingService.GetPlisioEnable()
		secret, _ := s.settingService.GetPlisioSecretKey()
		return PlisioConfig{Enabled: en, Secret: secret}
	}
	m, err := s.raw(tenantID)
	if err != nil {
		return PlisioConfig{}
	}
	secret := strings.TrimSpace(m[tsPlisioSecretKey])
	return PlisioConfig{
		Enabled: m[tsPlisioEnable] == "true" && secret != "",
		Secret:  secret,
	}
}

// upsert writes one (tenant_id, key) value, inserting when absent — DB-agnostic
// (update-then-insert) so it works on both SQLite and Postgres without relying
// on dialect-specific ON CONFLICT.
func (s *TenantSettingService) upsert(tx *gorm.DB, tenantID int, key, value string) error {
	res := tx.Model(&model.TenantSetting{}).
		Where("tenant_id = ? AND key = ?", tenantID, key).
		Update("value", value)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return tx.Create(&model.TenantSetting{TenantId: tenantID, Key: key, Value: value}).Error
	}
	return nil
}
