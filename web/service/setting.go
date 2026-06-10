package service

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/database"
	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/logger"
	"github.com/mhsanaei/3x-ui/v3/util/common"
	"github.com/mhsanaei/3x-ui/v3/util/netproxy"
	"github.com/mhsanaei/3x-ui/v3/util/random"
	"github.com/mhsanaei/3x-ui/v3/util/reflect_util"
	"github.com/mhsanaei/3x-ui/v3/web/entity"
	"github.com/mhsanaei/3x-ui/v3/xray"
)

//go:embed config.json
var xrayTemplateConfig string

var defaultValueMap = map[string]string{
	"panelGuid":                     uuid.NewString(),
	"xrayTemplateConfig":            xrayTemplateConfig,
	"webListen":                     "",
	"webDomain":                     "",
	"webPort":                       "2053",
	"webCertFile":                   "",
	"webKeyFile":                    "",
	"secret":                        random.Seq(32),
	"apiToken":                      "",
	"webBasePath":                   "/",
	"sessionMaxAge":                 "360",
	"trustedProxyCIDRs":             "127.0.0.1/32,::1/128",
	"pageSize":                      "25",
	"expireDiff":                    "0",
	"trafficDiff":                   "0",
	"remarkModel":                   "-ieo",
	"timeLocation":                  "Local",
	"tgBotEnable":                   "false",
	"tgBotToken":                    "",
	"tgBotProxy":                    "",
	"tgBotAPIServer":                "",
	"tgBotChatId":                   "",
	"tgRunTime":                     "@daily",
	"tgBotBackup":                   "false",
	"tgBotLoginNotify":              "true",
	"tgCpu":                         "80",
	"tgLang":                        "en-US",
	"twoFactorEnable":               "false",
	"twoFactorToken":                "",
	"registrationEnable":            "false",
	"clientCostReseller":            "0",
	"clientCostMember":              "0",
	"clientCostPerGBReseller":       "0",
	"clientCostPerGBMember":         "0",
	"resetTrafficCostReseller":      "0",
	"resetTrafficCostMember":        "0",
	"resetTrafficCostPerGBReseller": "0",
	"resetTrafficCostPerGBMember":   "0",
	// Percentage of a referred user's store purchase credited back to the
	// referring reseller's wallet as commission (0 disables payouts).
	"referralCommissionPercent": "15",

	// ZarinPal payment gateway (balance top-up)
	"zarinpalEnable":     "false",
	"zarinpalMerchantId": "",
	"zarinpalSandbox":    "false",
	"zarinpalCurrency":   "IRT",
	// Plisio cryptocurrency payment gateway (balance top-up)
	"plisioEnable":         "false",
	"plisioSecretKey":      "", // Plisio "Secret Key": used for both API calls and webhook HMAC
	"plisioSandbox":        "false",
	"plisioSourceCurrency": "USD", // fiat currency Plisio invoices are priced in
	"cryptoExchangeRate":   "1",   // wallet credits per 1 unit of plisioSourceCurrency (e.g. 60000 Toman per USD)
	// Configurable crypto deposit bonus (applies only to Plisio top-ups)
	"cryptoBonusEnabled":          "true",
	"cryptoBonusPercent":          "15", // bonus % credited on top of a crypto deposit
	"cryptoBonusMinDeposit":       "0",  // minimum deposit (credits) to qualify for the bonus
	"cryptoBonusMax":              "0",  // maximum bonus (credits); 0 = uncapped
	"subEnable":                   "true",
	"subJsonEnable":               "false",
	"subTitle":                    "",
	"subSupportUrl":               "",
	"subProfileUrl":               "",
	"subAnnounce":                 "",
	"subEnableRouting":            "false",
	"subRoutingRules":             "",
	"subListen":                   "",
	"subPort":                     "2096",
	"subPath":                     "/sub/",
	"subDomain":                   "",
	"subCertFile":                 "",
	"subKeyFile":                  "",
	"subUpdates":                  "12",
	"subEncrypt":                  "true",
	"subShowInfo":                 "true",
	"subEmailInRemark":            "true",
	"subURI":                      "",
	"subJsonPath":                 "/json/",
	"subJsonURI":                  "",
	"subClashEnable":              "false",
	"subClashPath":                "/clash/",
	"subClashURI":                 "",
	"subClashEnableRouting":       "false",
	"subClashRules":               "",
	"subJsonMux":                  "",
	"subJsonRules":                "",
	"subJsonFinalMask":            "",
	"subThemeDir":                 "",
	"datepicker":                  "gregorian",
	"warp":                        "",
	"warpUpdateInterval":          "0",
	"nord":                        "",
	"externalTrafficInformEnable": "false",
	"externalTrafficInformURI":    "",
	"restartXrayOnClientDisable":  "true",
	"xrayOutboundTestUrl":         "https://www.google.com/generate_204",
	"panelProxy":                  "",

	// LDAP defaults
	"ldapEnable":            "false",
	"ldapHost":              "",
	"ldapPort":              "389",
	"ldapUseTLS":            "false",
	"ldapBindDN":            "",
	"ldapPassword":          "",
	"ldapBaseDN":            "",
	"ldapUserFilter":        "(objectClass=person)",
	"ldapUserAttr":          "mail",
	"ldapVlessField":        "vless_enabled",
	"ldapSyncCron":          "@every 1m",
	"ldapFlagField":         "",
	"ldapTruthyValues":      "true,1,yes,on",
	"ldapInvertFlag":        "false",
	"ldapInboundTags":       "",
	"ldapAutoCreate":        "false",
	"ldapAutoDelete":        "false",
	"ldapDefaultTotalGB":    "0",
	"ldapDefaultExpiryDays": "0",
	"ldapDefaultLimitIP":    "0",
}

// SettingService provides business logic for application settings management.
// It handles configuration storage, retrieval, and validation for all system settings.
type SettingService struct{}

func (s *SettingService) GetDefaultJSONConfig() (any, error) {
	var jsonData any
	err := json.Unmarshal([]byte(xrayTemplateConfig), &jsonData)
	if err != nil {
		return nil, err
	}
	return jsonData, nil
}

func (s *SettingService) GetAllSetting() (*entity.AllSetting, error) {
	db := database.GetDB()
	settings := make([]*model.Setting, 0)
	err := db.Model(model.Setting{}).Not("key = ?", "xrayTemplateConfig").Find(&settings).Error
	if err != nil {
		return nil, err
	}
	allSetting := &entity.AllSetting{}
	t := reflect.TypeFor[entity.AllSetting]()
	v := reflect.ValueOf(allSetting).Elem()
	fields := reflect_util.GetFields(t)

	setSetting := func(key, value string) (err error) {
		defer func() {
			panicErr := recover()
			if panicErr != nil {
				err = errors.New(fmt.Sprint(panicErr))
			}
		}()

		var found bool
		var field reflect.StructField
		for _, f := range fields {
			if f.Tag.Get("json") == key {
				field = f
				found = true
				break
			}
		}

		if !found {
			// Some settings are automatically generated, no need to return to the front end to modify the user
			return nil
		}

		fieldV := v.FieldByName(field.Name)
		switch t := fieldV.Interface().(type) {
		case int:
			n, err := strconv.ParseInt(effectiveSettingValue(key, value), 10, 64)
			if err != nil {
				return err
			}
			fieldV.SetInt(n)
		case string:
			fieldV.SetString(value)
		case bool:
			fieldV.SetBool(effectiveSettingValue(key, value) == "true")
		default:
			return common.NewErrorf("unknown field %v type %v", key, t)
		}
		return
	}

	keyMap := map[string]bool{}
	for _, setting := range settings {
		err := setSetting(setting.Key, setting.Value)
		if err != nil {
			return nil, err
		}
		keyMap[setting.Key] = true
	}

	for key, value := range defaultValueMap {
		if keyMap[key] {
			continue
		}
		err := setSetting(key, value)
		if err != nil {
			return nil, err
		}
	}

	return allSetting, nil
}

func (s *SettingService) GetAllSettingView() (*entity.AllSettingView, error) {
	allSetting, err := s.GetAllSetting()
	if err != nil {
		return nil, err
	}
	view := &entity.AllSettingView{AllSetting: *allSetting}
	view.HasTgBotToken = secretConfigured(allSetting.TgBotToken)
	view.HasTwoFactorToken = secretConfigured(allSetting.TwoFactorToken)
	view.HasLdapPassword = secretConfigured(allSetting.LdapPassword)
	view.HasWarpSecret = secretConfigured(mustString(s.GetWarp()))
	view.HasNordSecret = secretConfigured(mustString(s.GetNord()))
	view.HasPlisioSecretKey = secretConfigured(allSetting.PlisioSecretKey)
	var apiTokenCount int64
	if err := database.GetDB().Model(model.ApiToken{}).Where("enabled = ?", true).Count(&apiTokenCount).Error; err == nil {
		view.HasApiToken = apiTokenCount > 0
	}
	view.TgBotToken = ""
	view.TwoFactorToken = ""
	view.LdapPassword = ""
	view.PlisioSecretKey = ""
	return view, nil
}

func secretConfigured(value string) bool {
	return strings.TrimSpace(value) != ""
}

func mustString(value string, _ error) string {
	return value
}

func (s *SettingService) ResetSettings() error {
	db := database.GetDB()
	err := db.Where("1 = 1").Delete(model.Setting{}).Error
	if err != nil {
		return err
	}
	return db.Model(model.User{}).
		Where("1 = 1").Error
}

func (s *SettingService) getSetting(key string) (*model.Setting, error) {
	db := database.GetDB()
	setting := &model.Setting{}
	err := db.Model(model.Setting{}).Where("key = ?", key).First(setting).Error
	if err != nil {
		return nil, err
	}
	return setting, nil
}

func (s *SettingService) saveSetting(key string, value string) error {
	setting, err := s.getSetting(key)
	db := database.GetDB()
	if database.IsNotFound(err) {
		return db.Create(&model.Setting{
			Key:   key,
			Value: value,
		}).Error
	} else if err != nil {
		return err
	}
	setting.Key = key
	setting.Value = value
	return db.Save(setting).Error
}

func (s *SettingService) getString(key string) (string, error) {
	setting, err := s.getSetting(key)
	if database.IsNotFound(err) {
		value, ok := defaultValueMap[key]
		if !ok {
			return "", common.NewErrorf("key <%v> not in defaultValueMap", key)
		}
		return value, nil
	} else if err != nil {
		return "", err
	}
	return setting.Value, nil
}

func (s *SettingService) setString(key string, value string) error {
	return s.saveSetting(key, value)
}

func effectiveSettingValue(key, stored string) string {
	if stored == "" {
		if def, ok := defaultValueMap[key]; ok {
			return def
		}
	}
	return stored
}

func (s *SettingService) getBool(key string) (bool, error) {
	str, err := s.getString(key)
	if err != nil {
		return false, err
	}
	return strconv.ParseBool(effectiveSettingValue(key, str))
}

func (s *SettingService) setBool(key string, value bool) error {
	return s.setString(key, strconv.FormatBool(value))
}

func (s *SettingService) getInt(key string) (int, error) {
	str, err := s.getString(key)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(effectiveSettingValue(key, str))
}

func (s *SettingService) setInt(key string, value int) error {
	return s.setString(key, strconv.Itoa(value))
}

func (s *SettingService) GetWarpLastUpdate() (int64, error) {
	val, err := s.getString("warpLastUpdate")
	if err != nil || val == "" {
		return 0, err
	}
	return strconv.ParseInt(val, 10, 64)
}

func (s *SettingService) SetWarpLastUpdate(val int64) error {
	return s.saveSetting("warpLastUpdate", strconv.FormatInt(val, 10))
}

func (s *SettingService) SetWarpUpdateInterval(val int) error {
	return s.setInt("warpUpdateInterval", val)
}

func (s *SettingService) GetXrayConfigTemplate() (string, error) {
	return s.getString("xrayTemplateConfig")
}

func (s *SettingService) GetXrayOutboundTestUrl() (string, error) {
	return s.getString("xrayOutboundTestUrl")
}

func (s *SettingService) SetXrayOutboundTestUrl(url string) error {
	clean, err := SanitizeHTTPURL(url)
	if err != nil {
		return err
	}
	return s.setString("xrayOutboundTestUrl", clean)
}

func (s *SettingService) GetListen() (string, error) {
	return s.getString("webListen")
}

func (s *SettingService) SetListen(ip string) error {
	return s.setString("webListen", ip)
}

func (s *SettingService) GetWebDomain() (string, error) {
	return s.getString("webDomain")
}

func (s *SettingService) GetTgBotToken() (string, error) {
	return s.getString("tgBotToken")
}

func (s *SettingService) SetTgBotToken(token string) error {
	return s.setString("tgBotToken", token)
}

func (s *SettingService) GetTgBotProxy() (string, error) {
	return s.getString("tgBotProxy")
}

func (s *SettingService) SetTgBotProxy(token string) error {
	return s.setString("tgBotProxy", token)
}

func (s *SettingService) GetPanelProxy() (string, error) {
	return s.getString("panelProxy")
}

func (s *SettingService) SetPanelProxy(proxyUrl string) error {
	return s.setString("panelProxy", proxyUrl)
}

// NewProxiedHTTPClient returns an HTTP client that routes the panel's own
// outbound requests through the configured panelProxy setting. An invalid or
// missing proxy falls back to a direct client so existing behavior is preserved.
func (s *SettingService) NewProxiedHTTPClient(timeout time.Duration) *http.Client {
	proxyUrl, err := s.GetPanelProxy()
	if err != nil {
		logger.Warning("Failed to read panel proxy setting:", err)
		proxyUrl = ""
	}
	client, err := netproxy.NewHTTPClient(proxyUrl, timeout)
	if err != nil {
		logger.Warningf("Invalid panel proxy %q, using direct connection: %v", proxyUrl, err)
		return &http.Client{Timeout: timeout}
	}
	return client
}

func (s *SettingService) GetTgBotAPIServer() (string, error) {
	return s.getString("tgBotAPIServer")
}

func (s *SettingService) SetTgBotAPIServer(token string) error {
	return s.setString("tgBotAPIServer", token)
}

func (s *SettingService) GetTgBotChatId() (string, error) {
	return s.getString("tgBotChatId")
}

func (s *SettingService) SetTgBotChatId(chatIds string) error {
	return s.setString("tgBotChatId", chatIds)
}

func (s *SettingService) GetTgbotEnabled() (bool, error) {
	return s.getBool("tgBotEnable")
}

func (s *SettingService) SetTgbotEnabled(value bool) error {
	return s.setBool("tgBotEnable", value)
}

func (s *SettingService) GetTgbotRuntime() (string, error) {
	return s.getString("tgRunTime")
}

func (s *SettingService) SetTgbotRuntime(time string) error {
	return s.setString("tgRunTime", time)
}

func (s *SettingService) GetTgBotBackup() (bool, error) {
	return s.getBool("tgBotBackup")
}

func (s *SettingService) GetTgBotLoginNotify() (bool, error) {
	return s.getBool("tgBotLoginNotify")
}

func (s *SettingService) GetTgCpu() (int, error) {
	return s.getInt("tgCpu")
}

func (s *SettingService) GetTgLang() (string, error) {
	return s.getString("tgLang")
}

func (s *SettingService) GetTwoFactorEnable() (bool, error) {
	return s.getBool("twoFactorEnable")
}

func (s *SettingService) SetTwoFactorEnable(value bool) error {
	return s.setBool("twoFactorEnable", value)
}

func (s *SettingService) GetTwoFactorToken() (string, error) {
	return s.getString("twoFactorToken")
}

// GetRegistrationEnable reports whether public self-registration of new panel
// users is allowed. Defaults to false so an upgraded panel never silently
// exposes open registration; an administrator must opt in.
func (s *SettingService) GetRegistrationEnable() (bool, error) {
	return s.getBool("registrationEnable")
}

func (s *SettingService) SetRegistrationEnable(value bool) error {
	return s.setBool("registrationEnable", value)
}

// roleCostSuffix maps a user's role to the per-role setting-key suffix used by
// the cost getters. Reseller and member are priced independently; any other
// non-admin role (e.g. moderator) falls back to the member rate. Admin is
// handled by the callers, which return 0 (admins are never charged).
func roleCostSuffix(role string) string {
	switch model.NormalizeRole(role) {
	case model.RoleReseller:
		return "Reseller"
	default:
		return "Member"
	}
}

// GetClientCostForRole returns the flat wallet credits charged to a user of the
// given role to create a single client. Admins are always free (0). 0 means no
// flat fee for that role.
func (s *SettingService) GetClientCostForRole(role string) (int, error) {
	if model.NormalizeRole(role) == model.RoleAdmin {
		return 0, nil
	}
	return s.getInt("clientCost" + roleCostSuffix(role))
}

// GetClientCostPerGBForRole returns the credits charged per GB of a client's
// traffic quota on creation, for the given role. Total = base + perGB × quotaGB.
// Admins are always free (0).
func (s *SettingService) GetClientCostPerGBForRole(role string) (int, error) {
	if model.NormalizeRole(role) == model.RoleAdmin {
		return 0, nil
	}
	return s.getInt("clientCostPerGB" + roleCostSuffix(role))
}

// GetResetTrafficCostForRole returns the flat credits charged to a user of the
// given role to reset a client's traffic. Resetting re-grants the quota, so it
// is billed independently of client creation. Admins are always free (0).
func (s *SettingService) GetResetTrafficCostForRole(role string) (int, error) {
	if model.NormalizeRole(role) == model.RoleAdmin {
		return 0, nil
	}
	return s.getInt("resetTrafficCost" + roleCostSuffix(role))
}

// GetReferralCommissionPercent returns the percentage of a referred user's
// store purchase that is credited to the referring reseller's wallet. 0 (or a
// negative configured value, clamped by validation) disables commission payouts.
func (s *SettingService) GetReferralCommissionPercent() (int, error) {
	return s.getInt("referralCommissionPercent")
}

// GetResetTrafficCostPerGBForRole returns the credits charged per GB of the
// client's quota when its traffic is reset, for the given role. Admins free (0).
func (s *SettingService) GetResetTrafficCostPerGBForRole(role string) (int, error) {
	if model.NormalizeRole(role) == model.RoleAdmin {
		return 0, nil
	}
	return s.getInt("resetTrafficCostPerGB" + roleCostSuffix(role))
}

// --- ZarinPal payment gateway ---

func (s *SettingService) GetZarinpalEnable() (bool, error) {
	return s.getBool("zarinpalEnable")
}

func (s *SettingService) SetZarinpalEnable(value bool) error {
	return s.setBool("zarinpalEnable", value)
}

func (s *SettingService) GetZarinpalMerchantId() (string, error) {
	return s.getString("zarinpalMerchantId")
}

func (s *SettingService) SetZarinpalMerchantId(value string) error {
	return s.setString("zarinpalMerchantId", strings.TrimSpace(value))
}

func (s *SettingService) GetZarinpalSandbox() (bool, error) {
	return s.getBool("zarinpalSandbox")
}

func (s *SettingService) SetZarinpalSandbox(value bool) error {
	return s.setBool("zarinpalSandbox", value)
}

// GetZarinpalCurrency returns the currency ZarinPal amounts are sent in
// ("IRR" or "IRT"). Defaults to IRT (Toman).
func (s *SettingService) GetZarinpalCurrency() (string, error) {
	cur, err := s.getString("zarinpalCurrency")
	if err != nil {
		return "IRT", err
	}
	if cur != "IRR" && cur != "IRT" {
		return "IRT", nil
	}
	return cur, nil
}

// --- Plisio cryptocurrency payment gateway ---

func (s *SettingService) GetPlisioEnable() (bool, error) {
	return s.getBool("plisioEnable")
}

func (s *SettingService) SetPlisioEnable(value bool) error {
	return s.setBool("plisioEnable", value)
}

// GetPlisioSecretKey returns the Plisio "Secret Key". Plisio uses one secret
// for both authenticating API requests (api_key) and signing callbacks
// (verify_hash), so the same value backs the API client and webhook verifier.
func (s *SettingService) GetPlisioSecretKey() (string, error) {
	return s.getString("plisioSecretKey")
}

func (s *SettingService) SetPlisioSecretKey(value string) error {
	return s.setString("plisioSecretKey", strings.TrimSpace(value))
}

func (s *SettingService) GetPlisioSandbox() (bool, error) {
	return s.getBool("plisioSandbox")
}

func (s *SettingService) SetPlisioSandbox(value bool) error {
	return s.setBool("plisioSandbox", value)
}

// GetPlisioSourceCurrency returns the fiat currency Plisio invoices are priced
// in (one of Plisio's supported fiat currencies). Defaults to USD.
func (s *SettingService) GetPlisioSourceCurrency() (string, error) {
	cur, err := s.getString("plisioSourceCurrency")
	if err != nil || strings.TrimSpace(cur) == "" {
		return "USD", err
	}
	return strings.ToUpper(strings.TrimSpace(cur)), nil
}

func (s *SettingService) SetPlisioSourceCurrency(value string) error {
	return s.setString("plisioSourceCurrency", strings.ToUpper(strings.TrimSpace(value)))
}

// GetCryptoExchangeRate returns how many wallet credits equal 1 unit of the
// Plisio invoice currency (e.g. 60000 when 1 USD = 60000 Toman). The deposit
// amount the user enters is in credits; the Plisio invoice is priced at
// credits/rate of the source currency, and credits are what get added back.
// A rate <= 0 is treated as 1 (1 credit = 1 unit) so a missing config never
// divides by zero.
func (s *SettingService) GetCryptoExchangeRate() (int, error) {
	rate, err := s.getInt("cryptoExchangeRate")
	if err != nil {
		return 1, err
	}
	if rate <= 0 {
		return 1, nil
	}
	return rate, nil
}

func (s *SettingService) SetCryptoExchangeRate(value int) error {
	if value <= 0 {
		value = 1
	}
	return s.setInt("cryptoExchangeRate", value)
}

// --- Crypto deposit bonus (Plisio) ---

func (s *SettingService) GetCryptoBonusEnabled() (bool, error) {
	return s.getBool("cryptoBonusEnabled")
}

func (s *SettingService) SetCryptoBonusEnabled(value bool) error {
	return s.setBool("cryptoBonusEnabled", value)
}

func (s *SettingService) GetCryptoBonusPercent() (int, error) {
	return s.getInt("cryptoBonusPercent")
}

func (s *SettingService) SetCryptoBonusPercent(value int) error {
	return s.setInt("cryptoBonusPercent", value)
}

func (s *SettingService) GetCryptoBonusMinDeposit() (int, error) {
	return s.getInt("cryptoBonusMinDeposit")
}

func (s *SettingService) SetCryptoBonusMinDeposit(value int) error {
	return s.setInt("cryptoBonusMinDeposit", value)
}

func (s *SettingService) GetCryptoBonusMax() (int, error) {
	return s.getInt("cryptoBonusMax")
}

func (s *SettingService) SetCryptoBonusMax(value int) error {
	return s.setInt("cryptoBonusMax", value)
}

func (s *SettingService) SetTwoFactorToken(value string) error {
	return s.setString("twoFactorToken", value)
}

func (s *SettingService) GetPort() (int, error) {
	return s.getInt("webPort")
}

func (s *SettingService) SetPort(port int) error {
	return s.setInt("webPort", port)
}

func (s *SettingService) SetCertFile(webCertFile string) error {
	return s.setString("webCertFile", webCertFile)
}

func (s *SettingService) GetCertFile() (string, error) {
	return s.getString("webCertFile")
}

func (s *SettingService) SetKeyFile(webKeyFile string) error {
	return s.setString("webKeyFile", webKeyFile)
}

func (s *SettingService) GetKeyFile() (string, error) {
	return s.getString("webKeyFile")
}

func (s *SettingService) GetExpireDiff() (int, error) {
	return s.getInt("expireDiff")
}

func (s *SettingService) GetTrafficDiff() (int, error) {
	return s.getInt("trafficDiff")
}

func (s *SettingService) GetSessionMaxAge() (int, error) {
	return s.getInt("sessionMaxAge")
}

func (s *SettingService) GetTrustedProxyCIDRs() (string, error) {
	return s.getString("trustedProxyCIDRs")
}

func (s *SettingService) GetRemarkModel() (string, error) {
	return s.getString("remarkModel")
}

func (s *SettingService) GetSecret() ([]byte, error) {
	secret, err := s.getString("secret")
	if secret == defaultValueMap["secret"] {
		err := s.saveSetting("secret", secret)
		if err != nil {
			logger.Warning("save secret failed:", err)
		}
	}
	return []byte(secret), err
}

// GetPanelGuid returns this panel's stable self-identifier, persisting a
// freshly generated UUID on first read. It is the globally stable node
// identity used to attribute online clients and inbounds to the physical
// node that hosts them across a chain of nodes (#4983), where per-panel
// autoincrement node ids are meaningless one hop away.
func (s *SettingService) GetPanelGuid() (string, error) {
	guid, err := s.getString("panelGuid")
	if err != nil {
		return "", err
	}
	if guid == defaultValueMap["panelGuid"] {
		if saveErr := s.saveSetting("panelGuid", guid); saveErr != nil {
			logger.Warning("save panelGuid failed:", saveErr)
		}
	}
	return guid, nil
}

func (s *SettingService) SetBasePath(basePath string) error {
	if !strings.HasPrefix(basePath, "/") {
		basePath = "/" + basePath
	}
	if !strings.HasSuffix(basePath, "/") {
		basePath += "/"
	}
	return s.setString("webBasePath", basePath)
}

func (s *SettingService) GetBasePath() (string, error) {
	basePath, err := s.getString("webBasePath")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(basePath, "/") {
		basePath = "/" + basePath
	}
	if !strings.HasSuffix(basePath, "/") {
		basePath += "/"
	}
	return basePath, nil
}

func (s *SettingService) GetTimeLocation() (*time.Location, error) {
	l, err := s.getString("timeLocation")
	if err != nil {
		return nil, err
	}
	location, err := time.LoadLocation(l)
	if err != nil {
		defaultLocation := defaultValueMap["timeLocation"]
		logger.Errorf("location <%v> not exist, using default location: %v", l, defaultLocation)
		location, err = time.LoadLocation(defaultLocation)
		if err != nil {
			logger.Errorf("failed to load default location, using UTC: %v", err)
			return time.UTC, nil
		}
		return location, nil
	}
	return location, nil
}

func (s *SettingService) GetSubEnable() (bool, error) {
	return s.getBool("subEnable")
}

func (s *SettingService) GetSubJsonEnable() (bool, error) {
	return s.getBool("subJsonEnable")
}

func (s *SettingService) GetSubTitle() (string, error) {
	return s.getString("subTitle")
}

func (s *SettingService) GetSubSupportUrl() (string, error) {
	return s.getString("subSupportUrl")
}

func (s *SettingService) GetSubProfileUrl() (string, error) {
	return s.getString("subProfileUrl")
}

func (s *SettingService) GetSubAnnounce() (string, error) {
	return s.getString("subAnnounce")
}

func (s *SettingService) GetSubEnableRouting() (bool, error) {
	return s.getBool("subEnableRouting")
}

func (s *SettingService) GetSubRoutingRules() (string, error) {
	return s.getString("subRoutingRules")
}

func (s *SettingService) GetSubListen() (string, error) {
	return s.getString("subListen")
}

func (s *SettingService) GetSubPort() (int, error) {
	return s.getInt("subPort")
}

func (s *SettingService) GetSubPath() (string, error) {
	return s.getString("subPath")
}

func (s *SettingService) GetSubJsonPath() (string, error) {
	return s.getString("subJsonPath")
}

func (s *SettingService) GetSubDomain() (string, error) {
	return s.getString("subDomain")
}

func (s *SettingService) SetSubCertFile(subCertFile string) error {
	return s.setString("subCertFile", subCertFile)
}

func (s *SettingService) GetSubCertFile() (string, error) {
	return s.getString("subCertFile")
}

func (s *SettingService) SetSubKeyFile(subKeyFile string) error {
	return s.setString("subKeyFile", subKeyFile)
}

func (s *SettingService) GetSubKeyFile() (string, error) {
	return s.getString("subKeyFile")
}

func (s *SettingService) GetSubUpdates() (string, error) {
	return s.getString("subUpdates")
}

func (s *SettingService) GetSubEncrypt() (bool, error) {
	return s.getBool("subEncrypt")
}

func (s *SettingService) GetSubShowInfo() (bool, error) {
	return s.getBool("subShowInfo")
}

func (s *SettingService) GetSubEmailInRemark() (bool, error) {
	return s.getBool("subEmailInRemark")
}

func (s *SettingService) GetPageSize() (int, error) {
	return s.getInt("pageSize")
}

func (s *SettingService) GetSubURI() (string, error) {
	return s.getString("subURI")
}

func (s *SettingService) GetSubJsonURI() (string, error) {
	return s.getString("subJsonURI")
}

func (s *SettingService) GetSubClashEnable() (bool, error) {
	return s.getBool("subClashEnable")
}

func (s *SettingService) GetSubClashPath() (string, error) {
	return s.getString("subClashPath")
}

func (s *SettingService) GetSubClashURI() (string, error) {
	return s.getString("subClashURI")
}

func (s *SettingService) GetSubClashEnableRouting() (bool, error) {
	return s.getBool("subClashEnableRouting")
}

func (s *SettingService) GetSubClashRules() (string, error) {
	return s.getString("subClashRules")
}

func (s *SettingService) GetSubJsonMux() (string, error) {
	return s.getString("subJsonMux")
}

func (s *SettingService) GetSubJsonRules() (string, error) {
	return s.getString("subJsonRules")
}

func (s *SettingService) GetSubJsonFinalMask() (string, error) {
	return s.getString("subJsonFinalMask")
}

func (s *SettingService) GetSubThemeDir() (string, error) {
	return s.getString("subThemeDir")
}

func (s *SettingService) GetDatepicker() (string, error) {
	return s.getString("datepicker")
}

func (s *SettingService) GetWarp() (string, error) {
	return s.getString("warp")
}

func (s *SettingService) SetWarp(data string) error {
	return s.setString("warp", data)
}

func (s *SettingService) GetNord() (string, error) {
	return s.getString("nord")
}

func (s *SettingService) SetNord(data string) error {
	return s.setString("nord", data)
}

func (s *SettingService) GetExternalTrafficInformEnable() (bool, error) {
	return s.getBool("externalTrafficInformEnable")
}

func (s *SettingService) SetExternalTrafficInformEnable(value bool) error {
	return s.setBool("externalTrafficInformEnable", value)
}

func (s *SettingService) GetExternalTrafficInformURI() (string, error) {
	return s.getString("externalTrafficInformURI")
}

func (s *SettingService) SetExternalTrafficInformURI(InformURI string) error {
	return s.setString("externalTrafficInformURI", InformURI)
}

func (s *SettingService) GetRestartXrayOnClientDisable() (bool, error) {
	return s.getBool("restartXrayOnClientDisable")
}

func (s *SettingService) SetRestartXrayOnClientDisable(value bool) error {
	return s.setBool("restartXrayOnClientDisable", value)
}

func (s *SettingService) GetIpLimitEnable() (bool, error) {
	accessLogPath, err := xray.GetAccessLogPath()
	if err != nil {
		return false, err
	}
	return (accessLogPath != "none" && accessLogPath != ""), nil
}

// GetLdapEnable returns whether LDAP is enabled.
func (s *SettingService) GetLdapEnable() (bool, error) {
	return s.getBool("ldapEnable")
}

func (s *SettingService) GetLdapHost() (string, error) {
	return s.getString("ldapHost")
}

func (s *SettingService) GetLdapPort() (int, error) {
	return s.getInt("ldapPort")
}

func (s *SettingService) GetLdapUseTLS() (bool, error) {
	return s.getBool("ldapUseTLS")
}

func (s *SettingService) GetLdapBindDN() (string, error) {
	return s.getString("ldapBindDN")
}

func (s *SettingService) GetLdapPassword() (string, error) {
	return s.getString("ldapPassword")
}

func (s *SettingService) GetLdapBaseDN() (string, error) {
	return s.getString("ldapBaseDN")
}

func (s *SettingService) GetLdapUserFilter() (string, error) {
	return s.getString("ldapUserFilter")
}

func (s *SettingService) GetLdapUserAttr() (string, error) {
	return s.getString("ldapUserAttr")
}

func (s *SettingService) GetLdapVlessField() (string, error) {
	return s.getString("ldapVlessField")
}

func (s *SettingService) GetLdapSyncCron() (string, error) {
	return s.getString("ldapSyncCron")
}

func (s *SettingService) GetLdapFlagField() (string, error) {
	return s.getString("ldapFlagField")
}

func (s *SettingService) GetLdapTruthyValues() (string, error) {
	return s.getString("ldapTruthyValues")
}

func (s *SettingService) GetLdapInvertFlag() (bool, error) {
	return s.getBool("ldapInvertFlag")
}

func (s *SettingService) GetLdapInboundTags() (string, error) {
	return s.getString("ldapInboundTags")
}

func (s *SettingService) GetLdapAutoCreate() (bool, error) {
	return s.getBool("ldapAutoCreate")
}

func (s *SettingService) GetLdapAutoDelete() (bool, error) {
	return s.getBool("ldapAutoDelete")
}

func (s *SettingService) GetLdapDefaultTotalGB() (int, error) {
	return s.getInt("ldapDefaultTotalGB")
}

func (s *SettingService) GetLdapDefaultExpiryDays() (int, error) {
	return s.getInt("ldapDefaultExpiryDays")
}

func (s *SettingService) GetLdapDefaultLimitIP() (int, error) {
	return s.getInt("ldapDefaultLimitIP")
}

func (s *SettingService) UpdateAllSetting(allSetting *entity.AllSetting) error {
	if err := s.preserveRedactedSecrets(allSetting); err != nil {
		return err
	}
	if err := validateSettingsURLs(allSetting); err != nil {
		return err
	}
	if err := allSetting.CheckValid(); err != nil {
		return err
	}

	v := reflect.ValueOf(allSetting).Elem()
	t := reflect.TypeFor[entity.AllSetting]()
	fields := reflect_util.GetFields(t)
	errs := make([]error, 0)
	for _, field := range fields {
		key := field.Tag.Get("json")
		fieldV := v.FieldByName(field.Name)
		value := fmt.Sprint(fieldV.Interface())
		err := s.saveSetting(key, value)
		if err != nil {
			errs = append(errs, err)
		}
	}
	return common.Combine(errs...)
}

func (s *SettingService) preserveRedactedSecrets(allSetting *entity.AllSetting) error {
	if strings.TrimSpace(allSetting.TgBotToken) == "" {
		value, err := s.GetTgBotToken()
		if err != nil {
			return err
		}
		allSetting.TgBotToken = value
	}
	if strings.TrimSpace(allSetting.LdapPassword) == "" {
		value, err := s.GetLdapPassword()
		if err != nil {
			return err
		}
		allSetting.LdapPassword = value
	}
	if allSetting.TwoFactorEnable && strings.TrimSpace(allSetting.TwoFactorToken) == "" {
		value, err := s.GetTwoFactorToken()
		if err != nil {
			return err
		}
		allSetting.TwoFactorToken = value
	}
	// Plisio secret key is write-once-style: a blank submission keeps the stored
	// value (the UI sends it blank when already configured).
	if strings.TrimSpace(allSetting.PlisioSecretKey) == "" {
		value, err := s.GetPlisioSecretKey()
		if err != nil {
			return err
		}
		allSetting.PlisioSecretKey = value
	}
	return nil
}

func validateSettingsURLs(allSetting *entity.AllSetting) error {
	if allSetting.ExternalTrafficInformURI != "" {
		u, err := SanitizeHTTPURL(allSetting.ExternalTrafficInformURI)
		if err != nil {
			return common.NewError("external traffic inform URI is invalid:", err)
		}
		allSetting.ExternalTrafficInformURI = u
	}
	if allSetting.TgBotAPIServer != "" {
		u, err := SanitizeHTTPURL(allSetting.TgBotAPIServer)
		if err != nil {
			return common.NewError("telegram API server URL is invalid:", err)
		}
		allSetting.TgBotAPIServer = u
	}
	return nil
}

func (s *SettingService) UpdateSecret(key string, value string) error {
	switch key {
	case "tgBotToken", "ldapPassword", "twoFactorToken":
		return s.saveSetting(key, strings.TrimSpace(value))
	default:
		return common.NewError("secret key is not replaceable:", key)
	}
}

func (s *SettingService) GetDefaultXrayConfig() (any, error) {
	var jsonData any
	err := json.Unmarshal([]byte(xrayTemplateConfig), &jsonData)
	if err != nil {
		return nil, err
	}
	return jsonData, nil
}

func extractHostname(host string) string {
	h, _, err := net.SplitHostPort(host)
	// Err is not nil means host does not contain port
	if err != nil {
		h = host
	}

	ip := net.ParseIP(h)
	// If it's not an IP, return as is
	if ip == nil {
		return h
	}

	// If it's an IPv4, return as is
	if ip.To4() != nil {
		return h
	}

	// IPv6 needs bracketing
	return "[" + h + "]"
}

// BuildSubURIBase is shared by GetDefaultSettings (the panel's Client
// Information page) and the subscription page so both render subscription
// URLs identically.
func (s *SettingService) BuildSubURIBase(host string) string {
	subPort, _ := s.GetSubPort()
	subDomain, _ := s.GetSubDomain()
	subKeyFile, _ := s.GetSubKeyFile()
	subCertFile, _ := s.GetSubCertFile()
	subTLS := subKeyFile != "" && subCertFile != ""
	if subDomain == "" {
		subDomain = extractHostname(host)
	}
	scheme := "http"
	if subTLS {
		scheme = "https"
	}
	if (subPort == 443 && subTLS) || (subPort == 80 && !subTLS) {
		return scheme + "://" + subDomain
	}
	return fmt.Sprintf("%s://%s:%d", scheme, subDomain, subPort)
}

func (s *SettingService) GetDefaultSettings(host string) (any, error) {
	type settingFunc func() (any, error)
	settings := map[string]settingFunc{
		"expireDiff":     func() (any, error) { return s.GetExpireDiff() },
		"trafficDiff":    func() (any, error) { return s.GetTrafficDiff() },
		"pageSize":       func() (any, error) { return s.GetPageSize() },
		"defaultCert":    func() (any, error) { return s.GetCertFile() },
		"defaultKey":     func() (any, error) { return s.GetKeyFile() },
		"tgBotEnable":    func() (any, error) { return s.GetTgbotEnabled() },
		"subThemeDir":    func() (any, error) { return s.GetSubThemeDir() },
		"subEnable":      func() (any, error) { return s.GetSubEnable() },
		"subJsonEnable":  func() (any, error) { return s.GetSubJsonEnable() },
		"subClashEnable": func() (any, error) { return s.GetSubClashEnable() },
		"subTitle":       func() (any, error) { return s.GetSubTitle() },
		"subURI":         func() (any, error) { return s.GetSubURI() },
		"subJsonURI":     func() (any, error) { return s.GetSubJsonURI() },
		"subClashURI":    func() (any, error) { return s.GetSubClashURI() },
		"remarkModel":    func() (any, error) { return s.GetRemarkModel() },
		"datepicker":     func() (any, error) { return s.GetDatepicker() },
		"ipLimitEnable":  func() (any, error) { return s.GetIpLimitEnable() },
		"webDomain":      func() (any, error) { return s.GetWebDomain() },
		"subDomain":      func() (any, error) { return s.GetSubDomain() },
	}

	result := make(map[string]any)

	for key, fn := range settings {
		value, err := fn()
		if err != nil {
			return "", err
		}
		result[key] = value
	}

	subEnable := result["subEnable"].(bool)
	subJsonEnable := false
	if v, ok := result["subJsonEnable"]; ok {
		if b, ok2 := v.(bool); ok2 {
			subJsonEnable = b
		}
	}
	subClashEnable := false
	if v, ok := result["subClashEnable"]; ok {
		if b, ok2 := v.(bool); ok2 {
			subClashEnable = b
		}
	}
	if (subEnable && result["subURI"].(string) == "") || (subJsonEnable && result["subJsonURI"].(string) == "") || (subClashEnable && result["subClashURI"].(string) == "") {
		subURI := s.BuildSubURIBase(host)
		subTitle, _ := s.GetSubTitle()
		subPath, _ := s.GetSubPath()
		subJsonPath, _ := s.GetSubJsonPath()
		subClashPath, _ := s.GetSubClashPath()
		if subEnable && result["subURI"].(string) == "" {
			result["subURI"] = subURI + subPath
		}
		if result["subTitle"].(string) == "" {
			result["subTitle"] = subTitle
		}
		if subJsonEnable && result["subJsonURI"].(string) == "" {
			result["subJsonURI"] = subURI + subJsonPath
		}
		if subClashEnable && result["subClashURI"].(string) == "" {
			result["subClashURI"] = subURI + subClashPath
		}
	}

	return result, nil
}
