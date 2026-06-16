import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { message } from '@/components/ui/message';
import { ArrowUp, X } from 'lucide-react';

import { HttpUtil, PromiseUtil } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import { useTheme } from '@/hooks/useTheme';
import { useAllSettings } from '@/api/queries/useAllSettings';
import { AllSettingSchema } from '@/schemas/setting';
import PageShell from '@/layouts/PageShell';
import {
    Alert,
    Button,
    Card,
    CardContent,
    Spinner,
    confirm
} from '@/components/ui';
import GeneralTab from './GeneralTab';
import SecurityTab from './SecurityTab';
import ResellerTab from './ResellerTab';
import PaymentsTab from './PaymentsTab';
import ManualDepositTab from './ManualDepositTab';
import TicketCategoriesTab from './TicketCategoriesTab';
import TelegramTab from './TelegramTab';
import EmailTab from './EmailTab';
import SubscriptionGeneralTab from './SubscriptionGeneralTab';
import SubscriptionFormatsTab from './SubscriptionFormatsTab';

interface ApiMsg {
  success?: boolean;
}

const tabSlugs = ['general', 'security', 'reseller', 'payments', 'manual-deposit', 'ticket-categories', 'telegram', 'email', 'subscription', 'subscription-formats'];

function isIp(h: string): boolean
{
    if (typeof h !== 'string')
    {
        return false;
    }
    const v4 = h.split('.');
    if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255))
    {
        return true;
    }
    if (!h.includes(':') || h.includes(':::'))
    {
        return false;
    }
    const parts = h.split('::');
    if (parts.length > 2)
    {
        return false;
    }
    const split = (s: string) => (s ? s.split(':').filter(Boolean) : []);
    const head = split(parts[0]);
    const tail = split(parts[1]);
    const valid = (seg: string) => /^[0-9a-fA-F]{1,4}$/.test(seg);
    if (![...head, ...tail].every(valid))
    {
        return false;
    }
    const groups = head.length + tail.length;
    return parts.length === 2 ? groups < 8 : groups === 8;
}

export default function SettingsPage()
{
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const [messageApi] = message.useMessage();

    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const {
        allSetting,
        updateSetting,
        fetched,
        spinning,
        setSpinning,
        saveDisabled,
        saveAll
    } = useAllSettings();

    const [entryHost, setEntryHost] = useState('');
    const [entryPort, setEntryPort] = useState('');
    const [entryIsIP, setEntryIsIP] = useState(false);
    const [showBackTop, setShowBackTop] = useState(false);

    useEffect(() =>
    {

        const host = window.location.hostname;
        setEntryHost(host);
        setEntryPort(window.location.port);
        setEntryIsIP(isIp(host));

    }, []);

    useEffect(() =>
    {
        const el = document.getElementById('content-layout');
        if (!el)
        {
            return;
        }
        const onScroll = () => setShowBackTop(el.scrollTop > 200);
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [fetched]);

    const [alertVisible, setAlertVisible] = useState(true);
    const location = useLocation();
    const slug = location.hash.replace(/^#/, '');
    const activeSlug = tabSlugs.includes(slug) ? slug : 'general';

    function rebuildUrlAfterRestart(): string
    {
        const { webDomain, webPort, webBasePath, webCertFile, webKeyFile } = allSetting;
        const newProtocol = (webCertFile || webKeyFile) ? 'https:' : 'http:';

        let base = webBasePath ? webBasePath.replace(/^\//, '') : '';
        if (base && !base.endsWith('/'))
        {
            base += '/';
        }

        if (!entryIsIP)
        {
            const url = new URL(window.location.href);
            url.pathname = `/${ base }panel/settings`;
            url.protocol = newProtocol;
            return url.toString();
        }

        let finalHost = entryHost;
        let finalPort = entryPort || '';
        if (webDomain && isIp(webDomain))
        {
            finalHost = webDomain;
        }
        if (webPort && Number(webPort) !== Number(entryPort))
        {
            finalPort = String(webPort);
        }

        const url = new URL(`${ newProtocol }//${ finalHost }`);
        if (finalPort)
        {
            url.port = finalPort;
        }
        url.pathname = `/${ base }panel/settings`;
        return url.toString();
    }

    async function onSave()
    {
        const result = AllSettingSchema.safeParse(allSetting);
        if (!result.success)
        {
            const issue = result.error.issues[0];
            const fieldPath = issue?.path.join('.') ?? 'value';
            const msgKey = issue?.message ?? 'somethingWentWrong';
            messageApi.error(`${ fieldPath }: ${ t(msgKey, { defaultValue: msgKey }) }`);
            return;
        }
        await saveAll();
    }

    async function restartPanel()
    {
        const ok = await confirm({
            title: t('pages.settings.restartPanel'),
            description: t('pages.settings.restartPanelDesc'),
            confirmText: t('pages.settings.restartPanel'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        setSpinning(true);
        try
        {
            const msg = await HttpUtil.post('/panel/setting/restartPanel') as ApiMsg;
            if (!msg?.success)
            {
                return;
            }
            await PromiseUtil.sleep(5000);
            window.location.replace(rebuildUrlAfterRestart());
        }
        finally
        {
            setSpinning(false);
        }
    }

    function scrollToTop()
    {
        document.getElementById('content-layout')?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const confAlerts = useMemo<string[]>(() =>
    {
        const out: string[] = [];
        if (window.location.protocol !== 'https:')
        {
            out.push(t('pages.settings.warnHttp'));
        }
        if (allSetting.webPort === 2053)
        {
            out.push(t('pages.settings.warnDefaultPort'));
        }
        const segs = window.location.pathname.split('/').length < 4;
        if (segs && allSetting.webBasePath === '/')
        {
            out.push(t('pages.settings.warnDefaultBasePath'));
        }
        if (allSetting.subEnable)
        {
            let subPath = allSetting.subPath;
            if (allSetting.subURI)
            {
                try
                {
                    subPath = new URL(allSetting.subURI).pathname;
                }
                catch
                { /* noop */ }
            }
            if (subPath === '/sub/')
            {
                out.push(t('pages.settings.warnDefaultSubPath'));
            }
        }
        if (allSetting.subJsonEnable)
        {
            let p = allSetting.subJsonPath;
            if (allSetting.subJsonURI)
            {
                try
                {
                    p = new URL(allSetting.subJsonURI).pathname;
                }
                catch
                { /* noop */ }
            }
            if (p === '/json/')
            {
                out.push(t('pages.settings.warnDefaultJsonPath'));
            }
        }
        return out;
    }, [allSetting, t]);

    const pageClass = useMemo(() => `settings-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    const categoryBody = useMemo(() =>
    {
        switch (activeSlug)
        {
            case 'security': return <SecurityTab allSetting={allSetting} updateSetting={updateSetting} />;
            case 'reseller': return <ResellerTab allSetting={allSetting} updateSetting={updateSetting} />;
            case 'payments': return <PaymentsTab allSetting={allSetting} updateSetting={updateSetting} />;
            case 'manual-deposit': return <ManualDepositTab />;
            case 'ticket-categories': return <TicketCategoriesTab />;
            case 'telegram': return <TelegramTab allSetting={allSetting} updateSetting={updateSetting} />;
            case 'email': return <EmailTab allSetting={allSetting} updateSetting={updateSetting} />;
            case 'subscription': return <SubscriptionGeneralTab allSetting={allSetting} updateSetting={updateSetting} />;
            case 'subscription-formats': return <SubscriptionFormatsTab allSetting={allSetting} updateSetting={updateSetting} />;
            default: return <GeneralTab allSetting={allSetting} updateSetting={updateSetting} />;
        }
    }, [activeSlug, allSetting, updateSetting]);

    return (
    <PageShell name={pageClass}>
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="h-7 w-7" />
              </div>
            ) : (
              <div className="relative flex flex-col gap-4">
                {spinning && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
                    <Spinner className="h-7 w-7" />
                  </div>
                )}

                {confAlerts.length > 0 && alertVisible && (
                  <Alert variant="danger" className="relative pe-11" title={t('pages.settings.securityWarnings')}>
                    <div className="flex flex-col gap-1">
                      <b className="text-foreground">{t('pages.settings.panelExposed')}</b>
                      <ul className="list-disc ps-5">
                        {confAlerts.map((msg, i) => <li key={i}>{msg}</li>)}
                      </ul>
                    </div>
                    <button
                      type="button"
                      aria-label={t('cancel')}
                      onClick={() => setAlertVisible(false)}
                      className="absolute end-2 top-2 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </Alert>
                )}

                <Card>
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button disabled={saveDisabled} onClick={onSave}>
                        {t('pages.settings.save')}
                      </Button>
                      <Button variant="danger" disabled={!saveDisabled} onClick={restartPanel}>
                        {t('pages.settings.restartPanel')}
                      </Button>
                    </div>
                    <Alert
                      variant="warning"
                      title={t('pages.settings.infoDesc')}
                      className="w-full sm:w-auto sm:flex-1 sm:max-w-md"
                    />
                  </div>
                </Card>

                <Card>
                  <CardContent className="p-4 sm:p-5">
                    {categoryBody}
                  </CardContent>
                </Card>
              </div>
            )}

            {showBackTop && (
              <button
                type="button"
                onClick={scrollToTop}
                aria-label="Back to top"
                className="fixed bottom-6 end-6 z-20 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface-raised text-foreground shadow-lg outline-none transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowUp className="h-5 w-5" aria-hidden />
              </button>
            )}
    </PageShell>
    );
}
