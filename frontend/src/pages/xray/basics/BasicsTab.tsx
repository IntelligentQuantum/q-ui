import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Clock, FileText, RotateCcw, Settings } from 'lucide-react';

import { OutboundDomainStrategies } from '@/schemas/primitives';
import { HappyEyeballsSchema } from '@/schemas/protocols/stream/sockopt';
import {
    Alert,
    Button,
    Input,
    Select,
    SettingListItem,
    Switch,
    Tabs,
    confirm
} from '@/components/ui';
import type { XraySettingsValue, SetTemplate } from '@/hooks/useXraySetting';

import {
    ACCESS_LOG,
    ERROR_LOG,
    LOG_LEVELS,
    MASK_ADDRESS,
    ROUTING_DOMAIN_STRATEGIES
} from './constants';

interface BasicsTabProps {
  templateSettings: XraySettingsValue | null;
  setTemplateSettings: SetTemplate;
  outboundTestUrl: string;
  onChangeOutboundTestUrl: (v: string) => void;
  onResetDefault: () => void;
}

export default function BasicsTab({
    templateSettings,
    setTemplateSettings,
    outboundTestUrl,
    onChangeOutboundTestUrl,
    onResetDefault
}: BasicsTabProps)
{
    const { t } = useTranslation();
    const [tab, setTab] = useState('general');

    const mutate = useCallback(
        (mutator: (next: XraySettingsValue) => void) =>
        {
            setTemplateSettings((prev) =>
            {
                if (!prev)
                {
                    return prev;
                }
                const clone = JSON.parse(JSON.stringify(prev)) as XraySettingsValue;
                mutator(clone);
                return clone;
            });
        },
        [setTemplateSettings]
    );

    const setLevel0 = useCallback(
        (field: string, value: number | null) => mutate((tt) =>
        {
            if (!tt.policy)
            {
                tt.policy = {};
            }
            if (!tt.policy.levels)
            {
                tt.policy.levels = {};
            }
            if (!tt.policy.levels['0'])
            {
                tt.policy.levels['0'] = {};
            }
            if (value === null || value === undefined)
            {
                delete tt.policy.levels['0'][field];
            }
            else
            {
                tt.policy.levels['0'][field] = value;
            }
        }),
        [mutate]
    );

    async function confirmResetDefault()
    {
        const ok = await confirm({
            title: t('pages.settings.resetDefaultConfig'),
            confirmText: t('reset'),
            cancelText: t('cancel'),
            danger: true
        });
        if (ok)
        {
            onResetDefault();
        }
    }

    const freedomStrategy =
    (templateSettings?.outbounds?.find((o) => o?.protocol === 'freedom' && o?.tag === 'direct')?.settings as
      | { domainStrategy?: string }
      | undefined)?.domainStrategy ?? 'AsIs';

    const directFreedomOutbound = templateSettings?.outbounds?.find(
        (o) => o?.protocol === 'freedom' && o?.tag === 'direct'
    );
    const directHappyEyeballs = (() =>
    {
        const sockopt = (directFreedomOutbound?.streamSettings as { sockopt?: { happyEyeballs?: unknown } } | undefined)
            ?.sockopt;
        const raw = sockopt?.happyEyeballs;
        if (raw == null || typeof raw !== 'object')
        {
            return null;
        }
        return HappyEyeballsSchema.parse(raw);
    })();

    const setDirectHappyEyeballs = useCallback(
        (next: ReturnType<typeof HappyEyeballsSchema.parse> | null) =>
        {
            mutate((tt) =>
            {
                if (!tt.outbounds)
                {
                    tt.outbounds = [];
                }
                let idx = tt.outbounds.findIndex((o) => o?.protocol === 'freedom' && o?.tag === 'direct');
                if (idx < 0)
                {
                    tt.outbounds.push({ protocol: 'freedom', tag: 'direct', settings: {} });
                    idx = tt.outbounds.length - 1;
                }
                const ob = tt.outbounds[idx];
                const stream = (ob.streamSettings ?? {}) as Record<string, unknown>;
                const sockopt = (stream.sockopt ?? {}) as Record<string, unknown>;
                if (next == null)
                {
                    delete sockopt.happyEyeballs;
                }
                else
                {
                    sockopt.happyEyeballs = next;
                }
                if (Object.keys(sockopt).length === 0)
                {
                    delete stream.sockopt;
                }
                else
                {
                    stream.sockopt = sockopt;
                }
                if (Object.keys(stream).length === 0)
                {
                    delete ob.streamSettings;
                }
                else
                {
                    ob.streamSettings = stream;
                }
            });
        },
        [mutate]
    );

    const routingStrategy = templateSettings?.routing?.domainStrategy ?? 'AsIs';
    const log = (templateSettings?.log || {}) as Record<string, unknown>;
    const policy = (templateSettings?.policy?.system || {}) as Record<string, boolean>;
    const level0 = (templateSettings?.policy?.levels?.['0'] || {}) as Record<string, unknown>;

    const generalBody = (
    <>
      <Alert variant="warning" className="mb-3 text-center" title={t('pages.xray.generalConfigsDesc')} />
      <SettingListItem
        title={t('pages.xray.FreedomStrategy')}
        description={t('pages.xray.FreedomStrategyDesc')}
        paddings="small"
        control={
          <Select
            value={freedomStrategy}
            options={OutboundDomainStrategies.map((s) => ({ value: s, label: s }))}
            onChange={(next) => mutate((tt) =>
            {
                if (!tt.outbounds)
                {
                    tt.outbounds = [];
                }
                const idx = tt.outbounds.findIndex((o) => o?.protocol === 'freedom' && o?.tag === 'direct');
                if (idx < 0)
                {
                    tt.outbounds.push({ protocol: 'freedom', tag: 'direct', settings: { domainStrategy: next } });
                }
                else
                {
                    const ob = tt.outbounds[idx];
                    ob.settings = (ob.settings || {}) as Record<string, unknown>;
                    (ob.settings as Record<string, unknown>).domainStrategy = next;
                }
            })}
          />
        }
      />
      <SettingListItem
        title={t('pages.xray.FreedomHappyEyeballs')}
        description={t('pages.xray.FreedomHappyEyeballsDesc')}
        paddings="small"
        control={
          <Switch
            checked={directHappyEyeballs != null}
            onCheckedChange={(checked) =>
            {
                setDirectHappyEyeballs(checked ? HappyEyeballsSchema.parse({}) : null);
            }}
          />
        }
      />
      {directHappyEyeballs != null && (
        <>
          <SettingListItem
            title={t('pages.inbounds.form.tryDelayMs')}
            description={t('pages.xray.FreedomHappyEyeballsTryDelayDesc')}
            paddings="small"
            control={
              <Input
                type="number"
                min={0}
                value={directHappyEyeballs.tryDelayMs ?? ''}
                placeholder="150"
                onChange={(e) => setDirectHappyEyeballs({
                    ...directHappyEyeballs,
                    tryDelayMs: e.target.value === '' ? 0 : Number(e.target.value)
                })}
              />
            }
          />
          <SettingListItem
            title={t('pages.inbounds.form.prioritizeIPv6')}
            paddings="small"
            control={
              <Switch
                checked={directHappyEyeballs.prioritizeIPv6}
                onCheckedChange={(checked) => setDirectHappyEyeballs({
                    ...directHappyEyeballs,
                    prioritizeIPv6: checked
                })}
              />
            }
          />
        </>
      )}
      <SettingListItem
        title={t('pages.xray.RoutingStrategy')}
        description={t('pages.xray.RoutingStrategyDesc')}
        paddings="small"
        control={
          <Select
            value={routingStrategy}
            options={ROUTING_DOMAIN_STRATEGIES.map((s) => ({ value: s, label: s }))}
            onChange={(next) => mutate((tt) =>
            {
                if (tt.routing)
                {
                    tt.routing.domainStrategy = next;
                }
            })}
          />
        }
      />
      <SettingListItem
        title={t('pages.xray.outboundTestUrl')}
        description={t('pages.xray.outboundTestUrlDesc')}
        paddings="small"
        control={
          <Input
            value={outboundTestUrl}
            onChange={(e) => onChangeOutboundTestUrl(e.target.value)}
            placeholder="https://www.google.com/generate_204"
          />
        }
      />
    </>
    );

    const statsBody = (
    <>
      {([
          ['statsInboundUplink', t('pages.xray.statsInboundUplink')],
          ['statsInboundDownlink', t('pages.xray.statsInboundDownlink')],
          ['statsOutboundUplink', t('pages.xray.statsOutboundUplink')],
          ['statsOutboundDownlink', t('pages.xray.statsOutboundDownlink')]
      ] as const).map(([field, label]) => (
        <SettingListItem
          key={field}
          title={label}
          paddings="small"
          control={
            <Switch
              checked={!!policy[field]}
              onCheckedChange={(checked) => mutate((tt) =>
              {
                  if (!tt.policy)
                  {
                      tt.policy = {};
                  }
                  if (!tt.policy.system)
                  {
                      tt.policy.system = {};
                  }
                  tt.policy.system[field] = checked;
              })}
            />
          }
        />
      ))}
    </>
    );

    const connectionBody = (
    <>
      <Alert variant="warning" className="mb-3 text-center" title={t('pages.xray.connectionLimitsDesc')} />
      <SettingListItem
        title={t('pages.xray.connIdle')}
        description={t('pages.xray.connIdleDesc')}
        paddings="small"
        control={
          <div className="flex">
            <Input
              type="number"
              value={typeof level0.connIdle === 'number' ? level0.connIdle : ''}
              min={0}
              placeholder="300"
              className="rounded-e-none"
              onChange={(e) => setLevel0('connIdle', e.target.value === '' ? null : Number(e.target.value))}
            />
            <span className="inline-flex h-9 shrink-0 items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">
              {t('pages.xray.seconds')}
            </span>
          </div>
        }
      />
      <SettingListItem
        title={t('pages.xray.bufferSize')}
        description={t('pages.xray.bufferSizeDesc')}
        paddings="small"
        control={
          <div className="flex">
            <Input
              type="number"
              value={typeof level0.bufferSize === 'number' ? level0.bufferSize : ''}
              min={0}
              placeholder={t('pages.xray.bufferSizePlaceholder')}
              className="rounded-e-none"
              onChange={(e) => setLevel0('bufferSize', e.target.value === '' ? null : Number(e.target.value))}
            />
            <span className="inline-flex h-9 shrink-0 items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">
              KB
            </span>
          </div>
        }
      />
    </>
    );

    const logBody = (
    <>
      <Alert variant="warning" className="mb-3 text-center" title={t('pages.xray.logConfigsDesc')} />
      <SettingListItem
        title={t('pages.xray.logLevel')}
        description={t('pages.xray.logLevelDesc')}
        paddings="small"
        control={
          <Select
            value={(log.loglevel as string) || 'warning'}
            options={LOG_LEVELS.map((s) => ({ value: s, label: s }))}
            onChange={(v) => mutate((tt) =>
            {
                if (tt.log)
                {
                    tt.log.loglevel = v;
                }
            })}
          />
        }
      />
      <SettingListItem
        title={t('pages.xray.accessLog')}
        description={t('pages.xray.accessLogDesc')}
        paddings="small"
        control={
          <Select
            value={(log.access as string) || ''}
            options={ACCESS_LOG.map((s) => ({ value: s, label: s }))}
            onChange={(v) => mutate((tt) =>
            {
                if (tt.log)
                {
                    tt.log.access = v;
                }
            })}
          />
        }
      />
      <SettingListItem
        title={t('pages.xray.errorLog')}
        description={t('pages.xray.errorLogDesc')}
        paddings="small"
        control={
          <Select
            value={(log.error as string) || ''}
            options={[{ value: '', label: t('empty') }, ...ERROR_LOG.map((s) => ({ value: s, label: s }))]}
            onChange={(v) => mutate((tt) =>
            {
                if (tt.log)
                {
                    tt.log.error = v;
                }
            })}
          />
        }
      />
      <SettingListItem
        title={t('pages.xray.maskAddress')}
        description={t('pages.xray.maskAddressDesc')}
        paddings="small"
        control={
          <Select
            value={(log.maskAddress as string) || ''}
            options={[{ value: '', label: t('empty') }, ...MASK_ADDRESS.map((s) => ({ value: s, label: s }))]}
            onChange={(v) => mutate((tt) =>
            {
                if (tt.log)
                {
                    tt.log.maskAddress = v;
                }
            })}
          />
        }
      />
      <SettingListItem
        title={t('pages.xray.dnsLog')}
        description={t('pages.xray.dnsLogDesc')}
        paddings="small"
        control={
          <Switch
            checked={!!log.dnsLog}
            onCheckedChange={(v) => mutate((tt) =>
            {
                if (tt.log)
                {
                    tt.log.dnsLog = v;
                }
            })}
          />
        }
      />
    </>
    );

    const resetBody = (
    <div className="px-5">
      <Button variant="danger" onClick={confirmResetDefault}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        {t('pages.settings.resetDefaultConfig')}
      </Button>
    </div>
    );

    const tabs = [
        { key: 'general', label: t('pages.xray.generalConfigs'), icon: <Settings className="h-4 w-4" /> },
        { key: 'stats', label: t('pages.xray.statistics'), icon: <BarChart3 className="h-4 w-4" /> },
        { key: 'connection', label: t('pages.xray.connectionLimits'), icon: <Clock className="h-4 w-4" /> },
        { key: 'log', label: t('pages.xray.logConfigs'), icon: <FileText className="h-4 w-4" /> },
        { key: 'reset', label: t('pages.settings.resetDefaultConfig'), icon: <RotateCcw className="h-4 w-4" /> }
    ];

    return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div>
        {tab === 'general' && generalBody}
        {tab === 'stats' && statsBody}
        {tab === 'connection' && connectionBody}
        {tab === 'log' && logBody}
        {tab === 'reset' && resetBody}
      </div>
    </div>
    );
}
