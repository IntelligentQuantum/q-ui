import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { message } from '@/components/ui/message';
import { ArrowUp, CircleHelp } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useXraySetting } from '@/hooks/useXraySetting';
import type { XraySettingsValue } from '@/hooks/useXraySetting';
import PageShell from '@/layouts/PageShell';
import { JsonEditor } from '@/components/form';
import { setMessageInstance } from '@/utils/messageBus';
import {
    Alert,
    Button,
    Card,
    Spinner,
    Tabs,
    Tooltip,
    confirm
} from '@/components/ui';

import { BasicsTab } from './basics';
import { RoutingTab } from './routing';
import { OutboundsTab } from './outbounds';
import { BalancersTab } from './balancers';
import { DnsTab } from './dns';
import { WarpModal, NordModal } from './overrides';

const SECTION_SLUGS = ['basic', 'routing', 'outbound', 'balancer', 'dns', 'advanced'];

type AdvKey = 'xraySetting' | 'inboundSettings' | 'outboundSettings' | 'routingRuleSettings';

export default function XrayPage()
{
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { isMobile } = useMediaQuery();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const xs = useXraySetting();
    const {
        fetched,
        spinning,
        saveDisabled,
        fetchError,
        xraySetting,
        setXraySetting,
        templateSettings,
        setTemplateSettings,
        outboundTestUrl,
        setOutboundTestUrl,
        inboundTags,
        clientReverseTags,
        subscriptionOutbounds,
        restartResult,
        outboundsTraffic,
        outboundTestStates,
        subscriptionTestStates,
        testingAll,
        fetchAll,
        resetOutboundsTraffic,
        testOutbound,
        testSubscriptionOutbound,
        testAllOutbounds,
        saveAll,
        resetToDefault,
        restartXray
    } = xs;

    const [warpOpen, setWarpOpen] = useState(false);
    const [nordOpen, setNordOpen] = useState(false);
    const [advSettings, setAdvSettings] = useState<AdvKey>('xraySetting');
    const location = useLocation();
    const navigate = useNavigate();
    const sectionSlug = location.hash.replace(/^#/, '');
    const activeSection = SECTION_SLUGS.includes(sectionSlug) ? sectionSlug : 'basic';

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

    async function onTestOutbound(idx: number, mode: string)
    {
        const outbound = templateSettings?.outbounds?.[idx];
        if (outbound)
        {
            await testOutbound(idx, outbound, mode);
        }
    }

    async function onTestSubscriptionOutbound(outbound: Record<string, unknown>, mode: string)
    {
        const tag = typeof outbound?.tag === 'string' ? outbound.tag : '';
        if (tag)
        {
            await testSubscriptionOutbound(tag, outbound, mode);
        }
    }

    function onAddOutbound(outbound: Record<string, unknown>)
    {
        mutate((tt) =>
        {
            if (!Array.isArray(tt.outbounds))
            {
                tt.outbounds = [];
            }
            tt.outbounds.push(outbound as never);
        });
    }
    function onResetOutbound(payload: { index: number; outbound: Record<string, unknown>; oldTag?: string; newTag?: string })
    {
        mutate((tt) =>
        {
            if (!tt.outbounds || payload.index < 0)
            {
                return;
            }
            tt.outbounds[payload.index] = payload.outbound as never;
            if (payload.oldTag && payload.newTag && payload.oldTag !== payload.newTag)
            {
                const rules = tt.routing?.rules || [];
                for (const r of rules)
                {
                    if (r?.outboundTag === payload.oldTag)
                    {
                        r.outboundTag = payload.newTag;
                    }
                }
            }
        });
    }
    function onRemoveOutboundByTag(tag: string)
    {
        mutate((tt) =>
        {
            if (!tt.outbounds)
            {
                return;
            }
            const idx = tt.outbounds.findIndex((o) => o?.tag === tag);
            if (idx >= 0)
            {
                tt.outbounds.splice(idx, 1);
            }
        });
    }
    function onRemoveOutboundByIndex(index: number)
    {
        mutate((tt) =>
        {
            if (tt.outbounds && index >= 0)
            {
                tt.outbounds.splice(index, 1);
            }
        });
    }
    function onRemoveRoutingRules(payload: { prefix: string })
    {
        mutate((tt) =>
        {
            const rules = tt.routing?.rules;
            if (!Array.isArray(rules))
            {
                return;
            }
      tt.routing!.rules = rules.filter((r) => !r?.outboundTag?.startsWith?.(payload.prefix));
        });
    }

    const advancedText = useMemo(() =>
    {
        if (advSettings === 'xraySetting')
        {
            return xraySetting;
        }
        const tpl = templateSettings;
        if (!tpl)
        {
            return '';
        }
        try
        {
            switch (advSettings)
            {
                case 'inboundSettings': return JSON.stringify(tpl.inbounds || [], null, 2);
                case 'outboundSettings': return JSON.stringify(tpl.outbounds || [], null, 2);
                case 'routingRuleSettings': return JSON.stringify(tpl.routing?.rules || [], null, 2);
                default: return '';
            }
        }
        catch
        {
            return '';
        }
    }, [advSettings, xraySetting, templateSettings]);

    function onAdvancedTextChange(next: string)
    {
        if (advSettings === 'xraySetting')
        {
            setXraySetting(next);
            return;
        }
        let parsed;
        try
        {
            parsed = JSON.parse(next);
        }
        catch
        {
            return;
        }
        mutate((tt) =>
        {
            switch (advSettings)
            {
                case 'inboundSettings':
                    tt.inbounds = parsed;
                    break;
                case 'outboundSettings':
                    tt.outbounds = parsed;
                    break;
                case 'routingRuleSettings':
                    if (!tt.routing)
                    {
                        tt.routing = {};
                    }
                    tt.routing.rules = parsed;
                    break;
            }
        });
    }

    async function confirmRestart()
    {
        const ok = await confirm({
            title: t('pages.xray.restartConfirmTitle'),
            description: t('pages.xray.restartConfirmContent'),
            confirmText: t('pages.xray.restart'),
            cancelText: t('cancel')
        });
        if (ok)
        {
            restartXray();
        }
    }

    function onSaveAll()
    {
        try
        {
            JSON.parse(xraySetting);
        }
        catch (e)
        {
            messageApi.error(`Advanced JSON: ${ (e as Error).message }`);
            navigate('/xray#advanced');
            return;
        }
        saveAll();
    }

    function scrollTop()
    {
        (document.getElementById('content-layout') || window).scrollTo({ top: 0, behavior: 'smooth' });
    }

    const pageClass = `xray-page ${ isDark ? 'is-dark' : '' }`.trim();

    const advancedTabs: { key: AdvKey; label: string }[] = [
        { key: 'xraySetting', label: t('pages.xray.completeTemplate') },
        { key: 'inboundSettings', label: t('pages.xray.Inbounds') },
        { key: 'outboundSettings', label: t('pages.xray.Outbounds') },
        { key: 'routingRuleSettings', label: t('pages.xray.Routings') }
    ];

    const sectionBody = (() =>
    {
        switch (activeSection)
        {
            case 'routing':
                return (
          <RoutingTab
            templateSettings={templateSettings}
            setTemplateSettings={setTemplateSettings}
            inboundTags={inboundTags}
            clientReverseTags={clientReverseTags}
            isMobile={isMobile}
          />
                );
            case 'outbound':
                return (
          <OutboundsTab
            templateSettings={templateSettings}
            setTemplateSettings={setTemplateSettings}
            outboundsTraffic={outboundsTraffic}
            outboundTestStates={outboundTestStates}
            subscriptionTestStates={subscriptionTestStates}
            testingAll={testingAll}
            inboundTags={inboundTags}
            subscriptionOutbounds={subscriptionOutbounds}
            isMobile={isMobile}
            onResetTraffic={resetOutboundsTraffic}
            onTest={onTestOutbound}
            onTestSubscription={onTestSubscriptionOutbound}
            onTestAll={testAllOutbounds}
            onShowWarp={() => setWarpOpen(true)}
            onShowNord={() => setNordOpen(true)}
            onRefreshXrayData={fetchAll}
          />
                );
            case 'balancer':
                return (
          <BalancersTab
            templateSettings={templateSettings}
            setTemplateSettings={setTemplateSettings}
            clientReverseTags={clientReverseTags}
            isMobile={isMobile}
          />
                );
            case 'dns':
                return (
          <DnsTab
            templateSettings={templateSettings}
            setTemplateSettings={setTemplateSettings}
          />
                );
            case 'advanced':
                return (
          <>
            <div className="mb-3">
              <h4 className="m-0 text-sm font-semibold text-foreground">{t('pages.xray.Template')}</h4>
              <p className="m-0 text-sm text-muted-foreground">{t('pages.xray.TemplateDesc')}</p>
            </div>
            <Tabs
              tabs={advancedTabs}
              value={advSettings}
              onChange={(k) => setAdvSettings(k as AdvKey)}
              variant="segmented"
              className="my-3 w-fit max-w-full"
            />
            <JsonEditor
              value={advancedText}
              onChange={onAdvancedTextChange}
              minHeight="420px"
              maxHeight="720px"
            />
          </>
                );
            default:
                return (
          <BasicsTab
            templateSettings={templateSettings}
            setTemplateSettings={setTemplateSettings}
            outboundTestUrl={outboundTestUrl}
            onChangeOutboundTestUrl={setOutboundTestUrl}
            onResetDefault={resetToDefault}
          />
                );
        }
    })();

    return (
    <PageShell name={pageClass}>
            {!fetched ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : fetchError ? (
              <Card>
                <div className="flex flex-col items-center gap-3 p-12 text-center">
                  <h3 className="text-lg font-semibold text-foreground">{t('somethingWentWrong')}</h3>
                  <p className="text-sm text-muted-foreground">{fetchError}</p>
                  <Button onClick={fetchAll}>{t('check')}</Button>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button disabled={saveDisabled} onClick={onSaveAll}>
                        {t('pages.xray.save')}
                      </Button>
                      <Button variant="danger" disabled={!saveDisabled} onClick={confirmRestart}>
                        {t('pages.xray.restart')}
                      </Button>
                      {restartResult && (
                        <Tooltip
                          content={
                            <pre className="m-0 max-w-[480px] whitespace-pre-wrap text-xs">{restartResult}</pre>
                          }
                          side="end"
                        >
                          <CircleHelp className="h-4 w-4 cursor-pointer text-accent" aria-hidden />
                        </Tooltip>
                      )}
                    </div>
                    <Alert
                      variant="warning"
                      title={t('pages.settings.infoDesc')}
                      className="w-full sm:w-auto sm:flex-1 sm:max-w-md"
                    />
                  </div>
                </Card>

                <Card>
                  <div className="p-4 sm:p-5">{sectionBody}</div>
                </Card>
              </div>
            )}

            {fetched && !fetchError && (
              <Button
                size="icon"
                variant="secondary"
                onClick={scrollTop}
                aria-label="Scroll to top"
                className="fixed bottom-6 end-6 z-[var(--z-popover)] rounded-full shadow-md"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
            )}

            {(spinning && fetched) && (
              <div className="pointer-events-none fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
                <div className="rounded-lg bg-surface-raised/90 p-4 shadow-lg">
                  <Spinner className="h-7 w-7" />
                </div>
              </div>
            )}

        <WarpModal
          open={warpOpen}
          templateSettings={templateSettings}
          onClose={() => setWarpOpen(false)}
          onAddOutbound={onAddOutbound}
          onResetOutbound={onResetOutbound}
          onRemoveOutbound={onRemoveOutboundByTag}
        />
        <NordModal
          open={nordOpen}
          templateSettings={templateSettings}
          onClose={() => setNordOpen(false)}
          onAddOutbound={onAddOutbound}
          onResetOutbound={onResetOutbound}
          onRemoveOutbound={onRemoveOutboundByIndex}
          onRemoveRoutingRules={onRemoveRoutingRules}
        />
    </PageShell>
    );
}
