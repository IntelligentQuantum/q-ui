import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingRow } from '@/components/ui';
import { TagsEditor } from '@/components/form/rhf';
import { Network, Rocket, Send, Settings } from 'lucide-react';

import type { AllSetting } from '@/models/setting';
import { Input, Select, Switch, Tabs } from '@/components/ui';
import { sanitizePath, normalizePath } from './uriPath';
import SubJsonFinalMaskForm from './SubJsonFinalMaskForm';

interface SubscriptionFormatsTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

const DEFAULT_MUX = {
    enabled: true,
    concurrency: 8,
    xudpConcurrency: 16,
    xudpProxyUDP443: 'reject'
};
const DEFAULT_RULES: { type: string; outboundTag: string; domain?: string[]; ip?: string[] }[] = [
    { type: 'field', outboundTag: 'direct', domain: ['geosite:category-ir'] },
    { type: 'field', outboundTag: 'direct', ip: ['geoip:private', 'geoip:ir'] }
];

const directIPsOptions = [
    { label: 'Private IP', value: 'geoip:private' },
    { label: '🇮🇷 Iran', value: 'geoip:ir' },
    { label: '🇨🇳 China', value: 'geoip:cn' },
    { label: '🇷🇺 Russia', value: 'geoip:ru' },
    { label: '🇻🇳 Vietnam', value: 'geoip:vn' },
    { label: '🇪🇸 Spain', value: 'geoip:es' },
    { label: '🇮🇩 Indonesia', value: 'geoip:id' },
    { label: '🇺🇦 Ukraine', value: 'geoip:ua' },
    { label: '🇹🇷 Türkiye', value: 'geoip:tr' },
    { label: '🇧🇷 Brazil', value: 'geoip:br' }
];
const directDomainsOptions = [
    { label: 'Private DNS', value: 'geosite:private' },
    { label: '🇮🇷 Iran', value: 'geosite:category-ir' },
    { label: '🇨🇳 China', value: 'geosite:cn' },
    { label: '🇷🇺 Russia', value: 'geosite:category-ru' },
    { label: 'Apple', value: 'geosite:apple' },
    { label: 'Meta', value: 'geosite:meta' },
    { label: 'Google', value: 'geosite:google' }
];

function readJson<T>(raw: string, fallback: T): T
{
    try
    {
        if (!raw)
        {
            return fallback;
        }
        return JSON.parse(raw) as T;
    }
    catch
    {
        return fallback;
    }
}

// One labelled settings row: title + optional description on the start, control on the end.
export default function SubscriptionFormatsTab({ allSetting, updateSetting }: SubscriptionFormatsTabProps)
{
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('1');

    const muxEnabled = allSetting.subJsonMux !== '';
    const directEnabled = allSetting.subJsonRules !== '';

    const muxObj = useMemo(
        () => (muxEnabled ? readJson<typeof DEFAULT_MUX>(allSetting.subJsonMux, DEFAULT_MUX) : DEFAULT_MUX),
        [allSetting.subJsonMux, muxEnabled]
    );

    function setMuxEnabled(v: boolean)
    {
        updateSetting({ subJsonMux: v ? JSON.stringify(DEFAULT_MUX) : '' });
    }

    function setMuxField<K extends keyof typeof DEFAULT_MUX>(key: K, value: typeof DEFAULT_MUX[K])
    {
        const next = { ...muxObj, [key]: value };
        updateSetting({ subJsonMux: JSON.stringify(next) });
    }

    const ruleArray = useMemo(() =>
    {
        if (!directEnabled)
        {
            return null;
        }
        return readJson<typeof DEFAULT_RULES | null>(allSetting.subJsonRules, null);
    }, [allSetting.subJsonRules, directEnabled]);

    const directIPs = useMemo(() =>
    {
        if (!ruleArray)
        {
            return [];
        }
        const ipRule = ruleArray.find((r) => r.ip);
        return ipRule?.ip ?? [];
    }, [ruleArray]);

    const directDomains = useMemo(() =>
    {
        if (!ruleArray)
        {
            return [];
        }
        const dRule = ruleArray.find((r) => r.domain);
        return dRule?.domain ?? [];
    }, [ruleArray]);

    function setDirectEnabled(v: boolean)
    {
        updateSetting({ subJsonRules: v ? JSON.stringify(DEFAULT_RULES) : '' });
    }

    function setDirectIPs(value: string[])
    {
        if (!ruleArray)
        {
            return;
        }
        let rules = [...ruleArray];
        if (value.length === 0)
        {
            rules = rules.filter((r) => !r.ip);
        }
        else
        {
            let idx = rules.findIndex((r) => r.ip);
            if (idx === -1)
            {
                rules.push({ ...DEFAULT_RULES[1] });
                idx = rules.length - 1;
            }
            rules[idx] = { ...rules[idx], ip: [...value] };
        }
        updateSetting({ subJsonRules: JSON.stringify(rules) });
    }

    function setDirectDomains(value: string[])
    {
        if (!ruleArray)
        {
            return;
        }
        let rules = [...ruleArray];
        if (value.length === 0)
        {
            rules = rules.filter((r) => !r.domain);
        }
        else
        {
            let idx = rules.findIndex((r) => r.domain);
            if (idx === -1)
            {
                rules.push({ ...DEFAULT_RULES[0] });
                idx = rules.length - 1;
            }
            rules[idx] = { ...rules[idx], domain: [...value] };
        }
        updateSetting({ subJsonRules: JSON.stringify(rules) });
    }

    return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
            { key: '1', label: t('pages.settings.panelSettings'), icon: <Settings className="h-4 w-4" /> },
            { key: '2', label: t('pages.settings.subFormats.finalMask'), icon: <Rocket className="h-4 w-4" /> },
            { key: '3', label: t('pages.settings.mux'), icon: <Network className="h-4 w-4" /> },
            { key: '4', label: t('pages.settings.direct'), icon: <Send className="h-4 w-4" /> }
        ]}
      />

      {activeTab === '1' && (
        <div className="flex flex-col divide-y divide-border">
          {allSetting.subJsonEnable && (
            <>
              <SettingRow
                title={<>JSON {t('pages.settings.subPath')}</>}
                description={t('pages.settings.subPathDesc')}
              >
                <Input
                  value={allSetting.subJsonPath}
                  placeholder="/json/"
                  onChange={(e) => updateSetting({ subJsonPath: sanitizePath(e.target.value) })}
                  onBlur={() => updateSetting({ subJsonPath: normalizePath(allSetting.subJsonPath) })}
                />
              </SettingRow>
              <SettingRow
                title={<>JSON {t('pages.settings.subURI')}</>}
                description={t('pages.settings.subURIDesc')}
              >
                <Input
                  value={allSetting.subJsonURI}
                  placeholder="(http|https)://domain[:port]/path/"
                  onChange={(e) => updateSetting({ subJsonURI: e.target.value })}
                />
              </SettingRow>
            </>
          )}
          {allSetting.subClashEnable && (
            <>
              <SettingRow
                title={<>Clash {t('pages.settings.subPath')}</>}
                description={t('pages.settings.subPathDesc')}
              >
                <Input
                  value={allSetting.subClashPath}
                  placeholder="/clash/"
                  onChange={(e) => updateSetting({ subClashPath: sanitizePath(e.target.value) })}
                  onBlur={() => updateSetting({ subClashPath: normalizePath(allSetting.subClashPath) })}
                />
              </SettingRow>
              <SettingRow
                title={<>Clash {t('pages.settings.subURI')}</>}
                description={t('pages.settings.subURIDesc')}
              >
                <Input
                  value={allSetting.subClashURI}
                  placeholder="(http|https)://domain[:port]/path/"
                  onChange={(e) => updateSetting({ subClashURI: e.target.value })}
                />
              </SettingRow>
            </>
          )}
        </div>
      )}

      {activeTab === '2' && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">{t('pages.settings.subFormats.finalMask')}</div>
            <div className="text-xs text-muted-foreground">{t('pages.settings.subFormats.finalMaskDesc')}</div>
          </div>
          <SubJsonFinalMaskForm
            value={allSetting.subJsonFinalMask}
            onChange={(v) => updateSetting({ subJsonFinalMask: v })}
          />
        </div>
      )}

      {activeTab === '3' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.mux')} description={t('pages.settings.muxDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={muxEnabled} onCheckedChange={setMuxEnabled} />
            </div>
          </SettingRow>
          {muxEnabled && (
            <>
              <SettingRow title={t('pages.settings.subFormats.concurrency')} htmlFor="mux-concurrency">
                <Input
                  id="mux-concurrency"
                  type="number"
                  min={-1}
                  max={1024}
                  value={muxObj.concurrency}
                  onChange={(e) => setMuxField('concurrency', Number(e.target.value) || 0)}
                />
              </SettingRow>
              <SettingRow title={t('pages.settings.subFormats.xudpConcurrency')} htmlFor="mux-xudp-concurrency">
                <Input
                  id="mux-xudp-concurrency"
                  type="number"
                  min={-1}
                  max={1024}
                  value={muxObj.xudpConcurrency}
                  onChange={(e) => setMuxField('xudpConcurrency', Number(e.target.value) || 0)}
                />
              </SettingRow>
              <SettingRow title={t('pages.settings.subFormats.xudpUdp443')}>
                <Select
                  value={muxObj.xudpProxyUDP443}
                  onChange={(v) => setMuxField('xudpProxyUDP443', v)}
                  options={['reject', 'allow', 'skip'].map((p) => ({ value: p, label: p }))}
                />
              </SettingRow>
            </>
          )}
        </div>
      )}

      {activeTab === '4' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.direct')} description={t('pages.settings.directDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={directEnabled} onCheckedChange={setDirectEnabled} />
            </div>
          </SettingRow>
          {directEnabled && (
            <>
              <SettingRow title={<>{t('pages.settings.direct')} IPs</>}>
                <TagsEditor value={directIPs} onChange={setDirectIPs} suggestions={directIPsOptions} />
              </SettingRow>
              <SettingRow title={<>{t('pages.settings.direct')} {t('domainName')}</>}>
                <TagsEditor value={directDomains} onChange={setDirectDomains} suggestions={directDomainsOptions} />
              </SettingRow>
            </>
          )}
        </div>
      )}
    </div>
    );
}
