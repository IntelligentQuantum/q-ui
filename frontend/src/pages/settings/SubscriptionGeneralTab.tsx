import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingRow } from '@/components/ui';
import { MultiSelect } from '@/components/ui';
import { Clock, Info, Settings, ShieldCheck } from 'lucide-react';

import type { AllSetting } from '@/models/setting';
import {
    Input,
    Select,
    Switch,
    Tabs,
    Textarea
} from '@/components/ui';
import { sanitizePath, normalizePath } from './uriPath';

const REMARK_MODELS: Record<string, string> = { i: 'Inbound', e: 'Email', o: 'Other' };
const REMARK_SAMPLES: Record<string, string> = { i: 'Germany', e: 'john', o: 'Relay' };
const REMARK_SEPARATORS = [' ', '-', '_', '@', ':', '~', '|', ',', '.', '/'];

interface SubscriptionGeneralTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

// One labelled settings row: title + optional description on the start, control on the end.
// Section divider with a centered label.
function SectionDivider({ children }: { children: ReactNode })
{
    return (
    <div className="flex items-center gap-3 py-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
    );
}

export default function SubscriptionGeneralTab({ allSetting, updateSetting }: SubscriptionGeneralTabProps)
{
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState('1');

    const remarkModel = useMemo(() =>
    {
        const rm = allSetting.remarkModel || '';
        return rm.length > 1 ? rm.substring(1).split('') : [];
    }, [allSetting.remarkModel]);

    const remarkSeparator = useMemo(() =>
    {
        const rm = allSetting.remarkModel || '-';
        return rm.length > 1 ? rm.charAt(0) : '-';
    }, [allSetting.remarkModel]);

    const remarkSample = useMemo(() =>
    {
        const parts = remarkModel.map((k) => REMARK_SAMPLES[k]);
        return parts.length === 0 ? '' : parts.join(remarkSeparator);
    }, [remarkModel, remarkSeparator]);

    function setRemarkModel(parts: string[])
    {
        updateSetting({ remarkModel: remarkSeparator + parts.join('') });
    }

    function setRemarkSeparator(sep: string)
    {
        const tail = (allSetting.remarkModel || '-').substring(1);
        updateSetting({ remarkModel: sep + tail });
    }

    return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
            { key: '1', label: t('pages.settings.panelSettings'), icon: <Settings className="h-4 w-4" /> },
            { key: '2', label: t('pages.settings.information'), icon: <Info className="h-4 w-4" /> },
            { key: '3', label: t('pages.settings.certs'), icon: <ShieldCheck className="h-4 w-4" /> },
            { key: '4', label: t('pages.settings.intervals'), icon: <Clock className="h-4 w-4" /> }
        ]}
      />

      {activeTab === '1' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.subEnable')} description={t('pages.settings.subEnableDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subEnable} onCheckedChange={(v) => updateSetting({ subEnable: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subJsonEnableTitle')} description={t('pages.settings.subJsonEnable')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subJsonEnable} onCheckedChange={(v) => updateSetting({ subJsonEnable: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subClashEnableTitle')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subClashEnable} onCheckedChange={(v) => updateSetting({ subClashEnable: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subListen')} description={t('pages.settings.subListenDesc')}>
            <Input value={allSetting.subListen} onChange={(e) => updateSetting({ subListen: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subDomain')} description={t('pages.settings.subDomainDesc')}>
            <Input value={allSetting.subDomain} onChange={(e) => updateSetting({ subDomain: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subPort')} description={t('pages.settings.subPortDesc')}>
            <Input type="number" min={1} max={65535} value={allSetting.subPort}
              onChange={(e) => updateSetting({ subPort: Number(e.target.value) || 0 })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subPath')} description={t('pages.settings.subPathDesc')}>
            <Input
              value={allSetting.subPath}
              placeholder="/sub/"
              onChange={(e) => updateSetting({ subPath: sanitizePath(e.target.value) })}
              onBlur={() => updateSetting({ subPath: normalizePath(allSetting.subPath) })}
            />
          </SettingRow>
          <SettingRow title={t('pages.settings.subURI')} description={t('pages.settings.subURIDesc')}>
            <Input value={allSetting.subURI} placeholder="(http|https)://domain[:port]/path/"
              onChange={(e) => updateSetting({ subURI: e.target.value })} />
          </SettingRow>
        </div>
      )}

      {activeTab === '2' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.subEncrypt')} description={t('pages.settings.subEncryptDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subEncrypt} onCheckedChange={(v) => updateSetting({ subEncrypt: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subShowInfo')} description={t('pages.settings.subShowInfoDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subShowInfo} onCheckedChange={(v) => updateSetting({ subShowInfo: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subEmailInRemark')} description={t('pages.settings.subEmailInRemarkDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subEmailInRemark} onCheckedChange={(v) => updateSetting({ subEmailInRemark: v })} />
            </div>
          </SettingRow>

          <SettingRow
            title={t('pages.settings.remarkModel')}
            description={
              <>
                {t('pages.settings.sampleRemark')}:{' '}
                <span className="whitespace-pre rounded border border-border bg-surface-sunken px-1.5 py-px font-mono">
                  {remarkSample ? `#${ remarkSample }` : '—'}
                </span>
              </>
            }
          >
            <div className="flex w-full gap-2">
              <MultiSelect
                value={remarkModel}
                onChange={setRemarkModel}
                className="min-w-0 flex-1"
                options={Object.entries(REMARK_MODELS).map(([k, l]) => ({ value: k, label: l }))}
              />
              <Select
                value={remarkSeparator}
                onChange={setRemarkSeparator}
                className="w-20 shrink-0"
                options={REMARK_SEPARATORS.map((s) => ({ value: s, label: s === ' ' ? '␣' : s }))}
              />
            </div>
          </SettingRow>

          <SectionDivider>{t('pages.settings.subTitle')}</SectionDivider>

          <SettingRow title={t('pages.settings.subTitle')} description={t('pages.settings.subTitleDesc')}>
            <Input value={allSetting.subTitle} onChange={(e) => updateSetting({ subTitle: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subSupportUrl')} description={t('pages.settings.subSupportUrlDesc')}>
            <Input value={allSetting.subSupportUrl} placeholder="https://example.com"
              onChange={(e) => updateSetting({ subSupportUrl: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subProfileUrl')} description={t('pages.settings.subProfileUrlDesc')}>
            <Input value={allSetting.subProfileUrl} placeholder="https://example.com"
              onChange={(e) => updateSetting({ subProfileUrl: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subAnnounce')} description={t('pages.settings.subAnnounceDesc')}>
            <Textarea value={allSetting.subAnnounce}
              onChange={(e) => updateSetting({ subAnnounce: e.target.value })} />
          </SettingRow>

          <SectionDivider>Happ</SectionDivider>

          <SettingRow title={t('pages.settings.subEnableRouting')} description={t('pages.settings.subEnableRoutingDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subEnableRouting} onCheckedChange={(v) => updateSetting({ subEnableRouting: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subRoutingRules')} description={t('pages.settings.subRoutingRulesDesc')}>
            <Textarea value={allSetting.subRoutingRules} placeholder="happ://routing/add/..."
              onChange={(e) => updateSetting({ subRoutingRules: e.target.value })} />
          </SettingRow>

          <SectionDivider>Clash / Mihomo</SectionDivider>

          <SettingRow title={t('pages.settings.subClashEnableRouting')} description={t('pages.settings.subClashEnableRoutingDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.subClashEnableRouting} onCheckedChange={(v) => updateSetting({ subClashEnableRouting: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.subClashRoutingRules')} description={t('pages.settings.subClashRoutingRulesDesc')}>
            <Textarea
              value={allSetting.subClashRules}
              rows={8}
              placeholder={'GEOSITE,category-ir,DIRECT\nGEOIP,private,DIRECT'}
              onChange={(e) => updateSetting({ subClashRules: e.target.value })}
            />
          </SettingRow>
        </div>
      )}

      {activeTab === '3' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.subCertPath')} description={t('pages.settings.subCertPathDesc')}>
            <Input value={allSetting.subCertFile} onChange={(e) => updateSetting({ subCertFile: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.subKeyPath')} description={t('pages.settings.subKeyPathDesc')}>
            <Input value={allSetting.subKeyFile} onChange={(e) => updateSetting({ subKeyFile: e.target.value })} />
          </SettingRow>
        </div>
      )}

      {activeTab === '4' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.subUpdates')} description={t('pages.settings.subUpdatesDesc')}>
            <Input type="number" min={1} value={allSetting.subUpdates}
              onChange={(e) => updateSetting({ subUpdates: Number(e.target.value) || 0 })} />
          </SettingRow>
        </div>
      )}
    </div>
    );
}
