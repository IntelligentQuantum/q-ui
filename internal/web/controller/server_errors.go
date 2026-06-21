package controller

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// serverErrorKeys maps a known server error message (the exact text produced by
// errors.New / common.NewError, minus trailing whitespace) to its i18n key under
// "serverErrors". Dynamic messages (keys ending in ":") are matched by prefix and
// their trailing detail is preserved. Keep in sync with the "serverErrors" block
// in en-US.json / fa-IR.json — every key here must exist in both locales.
var serverErrorKeys = map[string]string{
	"client email is required":                               "serverErrors.clientEmailRequired",
	"empty client email":                                     "serverErrors.emptyClientEmail",
	"empty client ID":                                        "serverErrors.emptyClientId",
	"client not found":                                       "serverErrors.clientNotFound",
	"client not found in inbound":                            "serverErrors.clientNotFoundInInbound",
	"email already in use":                                   "serverErrors.emailInUse",
	"subId already in use":                                   "serverErrors.subIdInUse",
	"Duplicate email:":                                       "serverErrors.duplicateEmail",
	"Duplicate subId:":                                       "serverErrors.duplicateSubId",
	"client email contains an invalid character:":            "serverErrors.clientEmailInvalidChar",
	"client subId contains an invalid character:":            "serverErrors.clientSubIdInvalidChar",
	"empty payload":                                          "serverErrors.emptyPayload",
	"at least one inbound is required":                       "serverErrors.atLeastOneInbound",
	"invalid clients format in inbound settings":             "serverErrors.invalidClientsFormat",
	"Inbound Not Found For Email:":                           "serverErrors.inboundNotFoundForEmail",
	"Client Not Found For Email:":                            "serverErrors.clientNotFoundForEmail",
	"Client Not Found In Inbound For Email:":                 "serverErrors.clientNotFoundInInboundForEmail",
	"Inbound Not Found For Traffic ID:":                      "serverErrors.inboundNotFoundForTrafficId",
	"totalGB must be >= 0":                                   "serverErrors.totalGbNonNegative",
	"source and target inbounds must be different":           "serverErrors.sourceTargetSameInbound",
	"could not pick a unique inbound tag for port:":          "serverErrors.noUniqueInboundTag",
	"group name is required":                                 "serverErrors.groupNameRequired",
	"old group name is required":                             "serverErrors.oldGroupNameRequired",
	"new group name is required":                             "serverErrors.newGroupNameRequired",
	"group already exists":                                   "serverErrors.groupExists",
	"xray is not running":                                    "serverErrors.xrayNotRunning",
	"sub link provider not registered":                       "serverErrors.subProviderNotRegistered",
	"subscription URL is required":                           "serverErrors.subUrlRequired",
	"invalid subscription URL:":                              "serverErrors.invalidSubUrl",
	"subscription has no valid URL":                          "serverErrors.subNoValidUrl",
	"subscription not found":                                 "serverErrors.subNotFound",
	"external subscription must be an http(s) URL:":          "serverErrors.externalSubMustBeHttp",
	"unsupported or invalid share link:":                     "serverErrors.unsupportedShareLink",
	"unknown external link kind:":                            "serverErrors.unknownExternalLinkKind",
	"invalid warp update interval":                           "serverErrors.invalidWarpInterval",
	"outbound parameter is required":                         "serverErrors.outboundRequired",
	"outbounds parameter is required":                        "serverErrors.outboundsRequired",
	"tag is required":                                        "serverErrors.tagRequired",
	"invalid port":                                           "serverErrors.invalidPort",
	"domain or ip is required":                               "serverErrors.domainOrIpRequired",
	"missing url":                                            "serverErrors.missingUrl",
	"shareAddr must be a host or IP without scheme or port":  "serverErrors.shareAddrHostOnly",
	"xray template config invalid:":                          "serverErrors.xrayTemplateInvalid",
	"invalid credentials":                                    "serverErrors.invalidCredentials",
	"invalid 2fa code":                                       "serverErrors.invalid2fa",
	"username can not be empty":                              "serverErrors.usernameEmpty",
	"password can not be empty":                              "serverErrors.passwordEmpty",
	"user not found":                                         "serverErrors.userNotFound",
	"username already taken":                                 "serverErrors.usernameTaken",
	"email already registered":                               "serverErrors.emailRegistered",
	"invalid username":                                       "serverErrors.invalidUsername",
	"invalid email":                                          "serverErrors.invalidEmail",
	"invalid phone number":                                   "serverErrors.invalidPhone",
	"invalid full name":                                      "serverErrors.invalidFullName",
	"password does not meet the strength requirements":       "serverErrors.weakPassword",
	"cannot remove the last administrator":                   "serverErrors.cannotRemoveLastAdmin",
	"current password is incorrect":                          "serverErrors.currentPasswordIncorrect",
	"insufficient balance":                                   "serverErrors.insufficientBalance",
	"amount must be positive":                                "serverErrors.amountPositive",
	"balance changed concurrently, retry":                    "serverErrors.balanceConflict",
	"invalid balance operation":                              "serverErrors.invalidBalanceOp",
	"no adjustment specified":                                "serverErrors.noAdjustment",
	"deposit request not found":                              "serverErrors.depositNotFound",
	"deposit request is not pending":                         "serverErrors.depositNotPending",
	"a deposit with this tracking number already exists":     "serverErrors.depositTrackingExists",
	"invalid deposit request":                                "serverErrors.invalidDeposit",
	"payment card not found":                                 "serverErrors.paymentCardNotFound",
	"invalid payment card":                                   "serverErrors.invalidPaymentCard",
	"invalid receipt file":                                   "serverErrors.invalidReceipt",
	"receipt file too large":                                 "serverErrors.receiptTooLarge",
	"unsupported receipt file type":                          "serverErrors.unsupportedReceiptType",
	"order not found":                                        "serverErrors.orderNotFound",
	"product is not available for purchase":                  "serverErrors.productUnavailable",
	"product references an inbound that no longer exists":    "serverErrors.productMisconfigured",
	"buyer is required":                                      "serverErrors.buyerRequired",
	"service not found":                                      "serverErrors.serviceNotFound",
	"you do not own this service":                            "serverErrors.notServiceOwner",
	"you can only buy on your own workspace":                 "serverErrors.foreignWorkspaceBuy",
	"product not found":                                      "serverErrors.productNotFound",
	"invalid product":                                        "serverErrors.invalidProduct",
	"invalid referral code format":                           "serverErrors.invalidReferralFormat",
	"referral code already in use":                           "serverErrors.referralInUse",
	"referral codes can only be assigned to resellers":       "serverErrors.referralResellerOnly",
	"could not generate a unique referral code":              "serverErrors.noUniqueReferral",
	"invalid workspace slug":                                 "serverErrors.invalidSlug",
	"workspace slug already in use":                          "serverErrors.slugInUse",
	"invalid domain":                                         "serverErrors.invalidDomain",
	"domain already in use":                                  "serverErrors.domainInUse",
	"could not derive a unique workspace slug":               "serverErrors.noUniqueSlug",
	"invalid status":                                         "serverErrors.invalidStatus",
	"tenant not found":                                       "serverErrors.tenantNotFound",
	"user is outside your workspace":                         "serverErrors.userOutsideWorkspace",
	"managers may only manage member and reseller accounts":  "serverErrors.managerScope",
	"node port must be 1-65535":                              "serverErrors.nodePortRange",
	"certificate pinning is only available for https nodes":  "serverErrors.certPinHttpsOnly",
	"node did not present a TLS certificate":                 "serverErrors.nodeNoTlsCert",
	"node name is required":                                  "serverErrors.nodeNameRequired",
	"invalid node id":                                        "serverErrors.invalidNodeId",
	"invalid ech cert":                                       "serverErrors.invalidEchCert",
	"ticket not found":                                       "serverErrors.ticketNotFound",
	"invalid ticket data":                                    "serverErrors.invalidTicketData",
	"invalid or inactive category":                           "serverErrors.invalidCategory",
	"not allowed":                                            "serverErrors.notAllowed",
	"ticket is closed":                                       "serverErrors.ticketClosed",
	"reopen window has passed":                               "serverErrors.reopenWindowPassed",
	"unsupported attachment type":                            "serverErrors.unsupportedAttachment",
	"attachment too large":                                   "serverErrors.attachmentTooLarge",
	"empty attachment":                                       "serverErrors.emptyAttachment",
	"category has tickets":                                   "serverErrors.categoryHasTickets",
	"invalid token id":                                       "serverErrors.invalidTokenId",
	"token name is required":                                 "serverErrors.tokenNameRequired",
	"token name must be 64 characters or fewer":              "serverErrors.tokenNameTooLong",
	"a token with that name already exists":                  "serverErrors.tokenNameExists",
	"token not found":                                        "serverErrors.tokenNotFound",
	"plisio crypto gateway is disabled":                      "serverErrors.plisioDisabled",
	"plisio secret key is not configured":                    "serverErrors.plisioNoSecret",
	"zarinpal payment gateway is disabled":                   "serverErrors.zarinpalDisabled",
	"zarinpal payment was not verified":                      "serverErrors.zarinpalNotVerified",
	"zarinpal merchant id is not configured":                 "serverErrors.zarinpalNoMerchant",
	"external traffic inform URI is invalid:":                "serverErrors.trafficInformUriInvalid",
	"telegram API server URL is invalid:":                    "serverErrors.telegramApiUrlInvalid",
	"secret key is not replaceable:":                         "serverErrors.secretNotReplaceable",
	"email service not available":                            "serverErrors.emailServiceUnavailable",
	"telegram bot disabled":                                  "serverErrors.telegramBotDisabled",
	"bot not started":                                        "serverErrors.botNotStarted",
	"invalid country ID":                                     "serverErrors.invalidCountryId",
	"private key cannot be empty":                            "serverErrors.privateKeyEmpty",
	"failed to retrieve NordLynx private key":                "serverErrors.nordlynxKeyFailed",
	"warp not registered: missing access_token or device_id": "serverErrors.warpNotRegistered",
	"Invalid db file format":                                 "serverErrors.invalidDbFile",
	"PostgreSQL DSN is missing a database name":              "serverErrors.pgDsnNoDb",
	"pg_dump not found on the server; install the postgresql-client package to back up a PostgreSQL database":    "serverErrors.pgDumpMissing",
	"Invalid file: expected a PostgreSQL custom-format dump (.dump) created by this panel's Back Up":             "serverErrors.invalidPgDump",
	"pg_restore not found on the server; install the postgresql-client package to restore a PostgreSQL database": "serverErrors.pgRestoreMissing",
}

// localizeServerError translates a server error's text into the request locale
// when it is a known message, preserving any dynamic ":" suffix. Unknown errors
// fall back to their (trimmed) English text. This is the single place that
// localizes the raw error appended by jsonMsgObj, so every controller benefits
// without changing its call sites.
func localizeServerError(c *gin.Context, err error) string {
	if err == nil {
		return ""
	}
	raw := strings.TrimRight(err.Error(), " \t\r\n")
	if raw == "" {
		return ""
	}
	if key, ok := serverErrorKeys[raw]; ok {
		if t := I18nWeb(c, key); t != "" && t != key {
			return t
		}
		return raw
	}
	// Dynamic "message: detail" — translate the message, keep the detail.
	for lit, key := range serverErrorKeys {
		if strings.HasSuffix(lit, ":") && strings.HasPrefix(raw, lit) {
			if t := I18nWeb(c, key); t != "" && t != key {
				return t + raw[len(lit):]
			}
			return raw
		}
	}
	return raw
}
