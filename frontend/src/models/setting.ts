import { ObjectUtil } from '@/utils';

export class AllSetting
{
    public webListen = '';
    public webDomain = '';
    public webPort = 2053;
    public webCertFile = '';
    public webKeyFile = '';
    public webBasePath = '/';
    public panelTitle = 'Q-UI';
    public sessionMaxAge = 360;
    public trustedProxyCIDRs = '127.0.0.1/32,::1/128';
    public panelProxy = '';
    public pageSize = 10;
    public expireDiff = 0;
    public trafficDiff = 0;
    public remarkModel = '-io';
    public datepicker: 'gregorian' | 'jalalian' = 'gregorian';
    public tgBotEnable = false;
    public tgBotToken = '';
    public tgBotProxy = '';
    public tgBotAPIServer = '';
    public tgBotChatId = '';
    public tgRunTime = '@daily';
    public tgBotBackup = false;
    public tgBotLoginNotify = true;
    public tgCpu = 80;
    public tgLang = 'en-US';
    public tgEnabledEvents = '';
    public smtpEnable = false;
    public smtpHost = '';
    public smtpPort = 587;
    public smtpUsername = '';
    public smtpPassword = '';
    public smtpTo = '';
    public smtpEncryptionType = 'starttls';
    public smtpEnabledEvents = '';
    public smtpCpu = 80;
    public twoFactorEnable = false;
    public twoFactorToken = '';
    public registrationEnable = false;
    public clientCostReseller = 0;
    public clientCostMember = 0;
    public clientCostPerGBReseller = 0;
    public clientCostPerGBMember = 0;
    public resetTrafficCostReseller = 0;
    public resetTrafficCostMember = 0;
    public resetTrafficCostPerGBReseller = 0;
    public resetTrafficCostPerGBMember = 0;
    public referralCommissionPercent = 15;
    public zarinpalEnable = false;
    public zarinpalMerchantId = '';
    public zarinpalSandbox = false;
    public zarinpalCurrency = 'IRT';
    public plisioEnable = false;
    public plisioSecretKey = '';
    public plisioSandbox = false;
    public plisioSourceCurrency = 'USD';
    public cryptoExchangeRate = 1;
    public cryptoBonusEnabled = true;
    public cryptoBonusPercent = 15;
    public cryptoBonusMinDeposit = 0;
    public cryptoBonusMax = 0;
    public xrayTemplateConfig = '';
    public subEnable = true;
    public subJsonEnable = false;
    public subTitle = '';
    public subSupportUrl = '';
    public subProfileUrl = '';
    public subAnnounce = '';
    public subEnableRouting = false;
    public subRoutingRules = '';
    public subListen = '';
    public subPort = 2096;
    public subPath = '/sub/';
    public subJsonPath = '/json/';
    public subClashEnable = false;
    public subClashPath = '/clash/';
    public subDomain = '';
    public externalTrafficInformEnable = false;
    public externalTrafficInformURI = '';
    public restartXrayOnClientDisable = true;
    public subCertFile = '';
    public subKeyFile = '';
    public subUpdates = 12;
    public subEncrypt = true;
    public subShowInfo = true;
    public subEmailInRemark = true;
    public subURI = '';
    public subJsonURI = '';
    public subClashURI = '';
    public subClashEnableRouting = false;
    public subClashRules = '';
    public subJsonMux = '';
    public subJsonRules = '';
    public subJsonFinalMask = '';
    public subThemeDir = ''; // upstream: custom subscription page template path

    public timeLocation = 'Local';

    public ldapEnable = false;
    public ldapHost = '';
    public ldapPort = 389;
    public ldapUseTLS = false;
    public ldapBindDN = '';
    public ldapPassword = '';
    public ldapBaseDN = '';
    public ldapUserFilter = '(objectClass=person)';
    public ldapUserAttr = 'mail';
    public ldapVlessField = 'vless_enabled';
    public ldapSyncCron = '@every 1m';
    public ldapFlagField = '';
    public ldapTruthyValues = 'true,1,yes,on';
    public ldapInvertFlag = false;
    public ldapInboundTags = '';
    public ldapAutoCreate = false;
    public ldapAutoDelete = false;
    public ldapDefaultTotalGB = 0;
    public ldapDefaultExpiryDays = 0;
    public ldapDefaultLimitIP = 0;
    public hasTgBotToken = false;
    public hasTwoFactorToken = false;
    public hasLdapPassword = false;
    public hasApiToken = false;
    public hasWarpSecret = false;
    public hasNordSecret = false;
    public hasPlisioSecretKey = false;
    public hasSmtpPassword = false;

    constructor(data?: unknown)
    {
        if (data != null)
        {
            ObjectUtil.cloneProps(this, data);
        }
    }

    public equals(other: AllSetting): boolean
    {
        return ObjectUtil.equals(this, other);
    }
}
