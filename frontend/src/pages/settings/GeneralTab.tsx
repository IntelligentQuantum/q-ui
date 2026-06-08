import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingRow } from '@/components/ui';
import { MultiSelect } from '@/components/ui';
import { Bell, Clock, Globe, Hash, Network, Route, Settings, ShieldCheck } from 'lucide-react';

import type { AllSetting } from '@/models/setting';
import { HttpUtil, LanguageManager } from '@/utils';
import {
    Input,
    PasswordInput,
    Select,
    Switch,
    Tabs
} from '@/components/ui';
import { sanitizePath } from './uriPath';

interface ApiMsg<T = unknown> {
  success?: boolean;
  obj?: T;
}

interface GeneralTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

const DATEPICKER_LIST: { name: string; value: 'gregorian' | 'jalalian' }[] = [
    { name: 'Gregorian (Standard)', value: 'gregorian' },
    { name: 'Jalalian (شمسی)', value: 'jalalian' }
];

// One labelled settings row: title + optional description on the start, control on the end.
export default function GeneralTab({ allSetting, updateSetting }: GeneralTabProps)
{
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState('1');
    const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage());
    const [inboundOptions, setInboundOptions] = useState<{ label: string; value: string }[]>([]);

    useEffect(() =>
    {
        let cancelled = false;
        (async () =>
        {
            // /options is the slim picker-shaped endpoint — it skips the heavy
            // per-client settings and clientStats payloads that /list ships.
            const msg = await HttpUtil.get('/panel/api/inbounds/options') as ApiMsg<{
        tag: string; protocol: string; port: number;
      }[]>;
            if (cancelled)
            {
                return;
            }
            if (msg?.success && Array.isArray(msg.obj))
            {
                setInboundOptions(msg.obj.map((ib) => ({
                    label: `${ ib.tag } (${ ib.protocol }@${ ib.port })`,
                    value: ib.tag
                })));
            }
            else
            {
                setInboundOptions([]);
            }
        })();
        return () =>
        {
            cancelled = true;
        };
    }, []);

    const ldapInboundTagList = useMemo(() =>
    {
        const csv = allSetting.ldapInboundTags || '';
        return csv.length ? csv.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }, [allSetting.ldapInboundTags]);

    function setLdapInboundTagList(list: string[])
    {
        updateSetting({ ldapInboundTags: Array.isArray(list) ? list.join(',') : '' });
    }

    function onLangChange(value: string)
    {
        setLang(value);
        LanguageManager.setLanguage(value);
    }

    const langOptions = useMemo(
        () => LanguageManager.supportedLanguages.map((l: { value: string; name: string; icon: string }) => ({
            value: l.value,
            label: (
        <span className="inline-flex items-center gap-1.5">
          <span role="img" aria-label={l.name}>{l.icon}</span>
          <span>{l.name}</span>
        </span>
            )
        })),
        []
    );

    return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
            { key: '1', label: t('pages.settings.panelSettings'), icon: <Settings className="h-4 w-4" /> },
            { key: '2', label: t('pages.settings.notifications'), icon: <Bell className="h-4 w-4" /> },
            { key: '3', label: t('pages.settings.certs'), icon: <ShieldCheck className="h-4 w-4" /> },
            { key: '4', label: t('pages.settings.externalTraffic'), icon: <Globe className="h-4 w-4" /> },
            { key: '5', label: t('pages.settings.dateAndTime'), icon: <Clock className="h-4 w-4" /> },
            { key: '6', label: 'LDAP', icon: <Network className="h-4 w-4" /> }
        ]}
      />

      {activeTab === '1' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.panelListeningIP')} description={t('pages.settings.panelListeningIPDesc')}>
            <Input startIcon={<Network aria-hidden />} value={allSetting.webListen} onChange={(e) => updateSetting({ webListen: e.target.value })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.panelListeningDomain')} description={t('pages.settings.panelListeningDomainDesc')}>
            <Input startIcon={<Globe aria-hidden />} value={allSetting.webDomain} onChange={(e) => updateSetting({ webDomain: e.target.value })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.panelPort')} description={t('pages.settings.panelPortDesc')}>
            <Input type="number" min={1} max={65535} startIcon={<Hash aria-hidden />} value={allSetting.webPort}
              onChange={(e) => updateSetting({ webPort: Number(e.target.value) || 0 })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.panelUrlPath')} description={t('pages.settings.panelUrlPathDesc')}>
            <Input startIcon={<Route aria-hidden />} value={allSetting.webBasePath} onChange={(e) => updateSetting({ webBasePath: sanitizePath(e.target.value) })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.sessionMaxAge')} description={t('pages.settings.sessionMaxAgeDesc')}>
            <Input type="number" min={60} max={525600} startIcon={<Clock aria-hidden />} value={allSetting.sessionMaxAge}
              onChange={(e) => updateSetting({ sessionMaxAge: Number(e.target.value) || 0 })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.trustedProxyCidrs')} description={t('pages.settings.trustedProxyCidrsDesc')}>
            <Input
              value={allSetting.trustedProxyCIDRs}
              placeholder="127.0.0.1/32,::1/128"
              onChange={(e) => updateSetting({ trustedProxyCIDRs: e.target.value })}
            />
          </SettingRow>

          <SettingRow title={t('pages.settings.panelProxy')} description={t('pages.settings.panelProxyDesc')}>
            <Input
              value={allSetting.panelProxy}
              placeholder="socks5:// or http://user:pass@host:port"
              onChange={(e) => updateSetting({ panelProxy: e.target.value })}
            />
          </SettingRow>

          <SettingRow title={t('pages.settings.pageSize')} description={t('pages.settings.pageSizeDesc')}>
            <Input type="number" min={0} max={1000} step={5} value={allSetting.pageSize}
              onChange={(e) => updateSetting({ pageSize: Number(e.target.value) || 0 })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.language')}>
            <Select value={lang} onChange={onLangChange} options={langOptions} />
          </SettingRow>
        </div>
      )}

      {activeTab === '2' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.expireTimeDiff')} description={t('pages.settings.expireTimeDiffDesc')}>
            <Input type="number" min={0} value={allSetting.expireDiff}
              onChange={(e) => updateSetting({ expireDiff: Number(e.target.value) || 0 })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.trafficDiff')} description={t('pages.settings.trafficDiffDesc')}>
            <Input type="number" min={0} max={100} value={allSetting.trafficDiff}
              onChange={(e) => updateSetting({ trafficDiff: Number(e.target.value) || 0 })} />
          </SettingRow>
        </div>
      )}

      {activeTab === '3' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.publicKeyPath')} description={t('pages.settings.publicKeyPathDesc')}>
            <Input value={allSetting.webCertFile} onChange={(e) => updateSetting({ webCertFile: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.privateKeyPath')} description={t('pages.settings.privateKeyPathDesc')}>
            <Input value={allSetting.webKeyFile} onChange={(e) => updateSetting({ webKeyFile: e.target.value })} />
          </SettingRow>
        </div>
      )}

      {activeTab === '4' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.externalTrafficInformEnable')} description={t('pages.settings.externalTrafficInformEnableDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.externalTrafficInformEnable}
                onCheckedChange={(v) => updateSetting({ externalTrafficInformEnable: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.externalTrafficInformURI')} description={t('pages.settings.externalTrafficInformURIDesc')}>
            <Input
              value={allSetting.externalTrafficInformURI}
              placeholder="(http|https)://domain[:port]/path/"
              onChange={(e) => updateSetting({ externalTrafficInformURI: e.target.value })}
            />
          </SettingRow>
          <SettingRow title={t('pages.settings.restartXrayOnClientDisable')} description={t('pages.settings.restartXrayOnClientDisableDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.restartXrayOnClientDisable}
                onCheckedChange={(v) => updateSetting({ restartXrayOnClientDisable: v })} />
            </div>
          </SettingRow>
        </div>
      )}

      {activeTab === '5' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.timeZone')} description={t('pages.settings.timeZoneDesc')}>
            <Input value={allSetting.timeLocation} onChange={(e) => updateSetting({ timeLocation: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.datepicker')} description={t('pages.settings.datepickerDescription')}>
            <Select
              value={allSetting.datepicker || 'gregorian'}
              onChange={(v) => updateSetting({ datepicker: v as 'gregorian' | 'jalalian' })}
              options={DATEPICKER_LIST.map((d) => ({ value: d.value, label: d.name }))}
            />
          </SettingRow>
        </div>
      )}

      {activeTab === '6' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.ldap.enable')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.ldapEnable} onCheckedChange={(v) => updateSetting({ ldapEnable: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.host')}>
            <Input value={allSetting.ldapHost} onChange={(e) => updateSetting({ ldapHost: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.port')}>
            <Input type="number" min={1} max={65535} value={allSetting.ldapPort}
              onChange={(e) => updateSetting({ ldapPort: Number(e.target.value) || 0 })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.useTls')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.ldapUseTLS} onCheckedChange={(v) => updateSetting({ ldapUseTLS: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.bindDn')}>
            <Input value={allSetting.ldapBindDN} onChange={(e) => updateSetting({ ldapBindDN: e.target.value })} />
          </SettingRow>
          <SettingRow
            title={t('password')}
            description={allSetting.hasLdapPassword ? t('pages.settings.ldap.passwordConfigured') : t('pages.settings.ldap.passwordUnconfigured')}
          >
            <PasswordInput
              value={allSetting.ldapPassword}
              placeholder={allSetting.hasLdapPassword ? t('pages.settings.ldap.passwordPlaceholder') : ''}
              onChange={(e) => updateSetting({ ldapPassword: e.target.value })}
            />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.baseDn')}>
            <Input value={allSetting.ldapBaseDN} onChange={(e) => updateSetting({ ldapBaseDN: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.userFilter')}>
            <Input value={allSetting.ldapUserFilter} onChange={(e) => updateSetting({ ldapUserFilter: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.userAttr')}>
            <Input value={allSetting.ldapUserAttr} onChange={(e) => updateSetting({ ldapUserAttr: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.vlessField')}>
            <Input value={allSetting.ldapVlessField} onChange={(e) => updateSetting({ ldapVlessField: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.flagField')} description={t('pages.settings.ldap.flagFieldDesc')}>
            <Input value={allSetting.ldapFlagField} onChange={(e) => updateSetting({ ldapFlagField: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.truthyValues')} description={t('pages.settings.ldap.truthyValuesDesc')}>
            <Input value={allSetting.ldapTruthyValues} onChange={(e) => updateSetting({ ldapTruthyValues: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.invertFlag')} description={t('pages.settings.ldap.invertFlagDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.ldapInvertFlag} onCheckedChange={(v) => updateSetting({ ldapInvertFlag: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.syncSchedule')} description={t('pages.settings.ldap.syncScheduleDesc')}>
            <Input value={allSetting.ldapSyncCron} onChange={(e) => updateSetting({ ldapSyncCron: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.inboundTags')} description={t('pages.settings.ldap.inboundTagsDesc')}>
            <div className="flex flex-col gap-1">
              <MultiSelect
                value={ldapInboundTagList}
                onChange={setLdapInboundTagList}
                options={inboundOptions}
              />
              {inboundOptions.length === 0 && (
                <div className="text-xs text-muted-foreground">{t('pages.settings.ldap.noInbounds')}</div>
              )}
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.autoCreate')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.ldapAutoCreate} onCheckedChange={(v) => updateSetting({ ldapAutoCreate: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.autoDelete')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.ldapAutoDelete} onCheckedChange={(v) => updateSetting({ ldapAutoDelete: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.defaultTotalGb')}>
            <Input type="number" min={0} value={allSetting.ldapDefaultTotalGB}
              onChange={(e) => updateSetting({ ldapDefaultTotalGB: Number(e.target.value) || 0 })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.defaultExpiryDays')}>
            <Input type="number" min={0} value={allSetting.ldapDefaultExpiryDays}
              onChange={(e) => updateSetting({ ldapDefaultExpiryDays: Number(e.target.value) || 0 })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.ldap.defaultIpLimit')}>
            <Input type="number" min={0} value={allSetting.ldapDefaultLimitIP}
              onChange={(e) => updateSetting({ ldapDefaultLimitIP: Number(e.target.value) || 0 })} />
          </SettingRow>
        </div>
      )}
    </div>
    );
}
