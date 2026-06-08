import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowDown,
    ArrowUp,
    ChartArea,
    CloudDownload,
    CloudUpload,
    Copy,
    Database,
    Eye,
    EyeOff,
    Globe,
    HardDrive,
    List,
    Monitor,
    Server,
    SlidersHorizontal,
    Split,
    Zap
} from 'lucide-react';

import { HttpUtil, SizeFormatter, TimeFormatter, ClipboardManager, FileManager } from '@/utils';
import { useTheme } from '@/hooks/useTheme';
import { useStatusQuery } from '@/api/queries/useStatusQuery';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import PageShell from '@/layouts/PageShell';
import { LazyMount } from '@/components/utility';
import { setMessageInstance } from '@/utils/messageBus';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Modal,
    Spinner,
    Tooltip
} from '@/components/ui';
import { message } from '@/components/ui/message';
import StatusCard from './StatusCard';
import XrayStatusCard from './XrayStatusCard';
import type { PanelUpdateInfo } from './PanelUpdateModal';
const JsonEditor = lazy(() => import('@/components/form/JsonEditor'));
const PanelUpdateModal = lazy(() => import('./PanelUpdateModal'));
const LogModal = lazy(() => import('./LogModal'));
const BackupModal = lazy(() => import('./BackupModal'));
const SystemHistoryModal = lazy(() => import('./SystemHistoryModal'));
const XrayMetricsModal = lazy(() => import('./XrayMetricsModal'));
const XrayLogModal = lazy(() => import('./XrayLogModal'));
const VersionModal = lazy(() => import('./VersionModal'));

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

// A single metric (icon + label + value) used inside the metric cards' two-up grid.
function Stat({
    icon: Icon,
    title,
    value,
    suffix,
    className
}: {
  icon: IconType;
  title: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  className?: string;
})
{
    return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{title}</span>
      </div>
      <div className="mt-1 break-all text-lg font-semibold tabular-nums text-foreground">
        {value}
        {suffix ? <span className="text-sm font-normal text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
    );
}

// An action chip used as a card footer trigger (logs/config/backup/etc).
function ActionButton({
    icon: Icon,
    label,
    onClick,
    showLabel,
    highlight,
    title
}: {
  icon?: IconType;
  label: ReactNode;
  onClick: () => void;
  showLabel: boolean;
  highlight?: boolean;
  title?: string;
})
{
    return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      className={highlight ? 'text-warning hover:text-warning' : undefined}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {showLabel && <span className="min-w-0 truncate">{label}</span>}
    </Button>
    );
}

export default function IndexPage()
{
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { status, fetched, fetchError, refresh } = useStatusQuery();
    const { isMobile } = useMediaQuery();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const [ipLimitEnable, setIpLimitEnable] = useState(false);
    const [panelUpdateInfo, setPanelUpdateInfo] = useState<PanelUpdateInfo>({
        currentVersion: '',
        latestVersion: '',
        updateAvailable: false
    });
    // True when the update check itself failed (GitHub unreachable / rate-limited),
    // as opposed to "checked successfully, already up to date".
    const [updateCheckFailed, setUpdateCheckFailed] = useState(false);

    const basePath = window.Q_UI_BASE_PATH || '';

    const [showIp, setShowIp] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [backupOpen, setBackupOpen] = useState(false);
    const [panelUpdateOpen, setPanelUpdateOpen] = useState(false);
    const [sysHistoryOpen, setSysHistoryOpen] = useState(false);
    const [xrayMetricsOpen, setXrayMetricsOpen] = useState(false);
    const [xrayLogsOpen, setXrayLogsOpen] = useState(false);
    const [versionOpen, setVersionOpen] = useState(false);
    const [configTextOpen, setConfigTextOpen] = useState(false);
    const [configText, setConfigText] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingTip, setLoadingTip] = useState(t('loading'));

    useEffect(() =>
    {
        HttpUtil.post<{ ipLimitEnable?: boolean }>('/panel/setting/defaultSettings').then((msg) =>
        {
            if (msg?.success && msg.obj)
            {
                setIpLimitEnable(!!msg.obj.ipLimitEnable);
            }
        });
        HttpUtil.get<PanelUpdateInfo>('/panel/api/server/getPanelUpdateInfo').then((msg) =>
        {
            if (msg?.success && msg.obj)
            {
                setPanelUpdateInfo(msg.obj);
                setUpdateCheckFailed(false);
            }
            else
            {
                // The check errored (the message is also toasted by HttpUtil); flag it so
                // the version chip doesn't masquerade as "up to date".
                setUpdateCheckFailed(true);
            }
        });
    }, []);

    const displayVersion = useMemo(
        () => panelUpdateInfo.currentVersion || window.Q_UI_CUR_VER || '?',
        [panelUpdateInfo.currentVersion]
    );

    const setBusy = useCallback(
        ({ busy, tip }: { busy: boolean; tip?: string }) =>
        {
            setLoading(busy);
            if (tip)
            {
                setLoadingTip(tip);
            }
        },
        []
    );

    const stopXray = useCallback(async () =>
    {
        await HttpUtil.post('/panel/api/server/stopXrayService');
        await refresh();
    }, [refresh]);

    const restartXray = useCallback(async () =>
    {
        await HttpUtil.post('/panel/api/server/restartXrayService');
        await refresh();
    }, [refresh]);

    function openPanelVersion()
    {
        if (panelUpdateInfo.updateAvailable)
        {
            setPanelUpdateOpen(true);
        }
        else
        {
            window.open('https://github.com/IntelligentQuantum/q-ui/releases', '_blank', 'noopener,noreferrer');
        }
    }

    function openTelegram()
    {
        window.open('https://t.me/XrayUI', '_blank', 'noopener,noreferrer');
    }

    async function openConfig()
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.get('/panel/api/server/getConfigJson');
            if (!msg?.success)
            {
                return;
            }
            setConfigText(JSON.stringify(msg.obj, null, 2));
            setConfigTextOpen(true);
        }
        finally
        {
            setLoading(false);
        }
    }

    async function copyConfig()
    {
        const ok = await ClipboardManager.copyText(configText || '');
        if (ok)
        {
            messageApi.success('Copied');
        }
    }

    function downloadConfig()
    {
        FileManager.downloadTextFile(configText, 'config.json');
    }

    const pageClass = `index-page ${ isDark ? 'is-dark' : '' }`.trim();

    const panelVersionLabel = panelUpdateInfo.updateAvailable
        ? `${ t('update') } ${ panelUpdateInfo.latestVersion }`
        : `v${ displayVersion }${ updateCheckFailed ? ' ⚠' : '' }`;

    return (
    <PageShell name={pageClass}>
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="h-8 w-8 text-muted-foreground" />
              </div>
            ) : fetchError ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
                <h2 className="text-lg font-semibold text-foreground">{t('somethingWentWrong')}</h2>
                <p className="max-w-md text-sm text-muted-foreground">{fetchError}</p>
                <Button variant="primary" onClick={refresh}>{t('refresh')}</Button>
              </div>
            ) : (
              <div className="relative flex flex-col gap-4">
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
                    <div className="flex flex-col items-center gap-2">
                      <Spinner className="h-7 w-7 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{loadingTip}</span>
                    </div>
                  </div>
                )}

                <StatusCard status={status} isMobile={isMobile} />

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <XrayStatusCard
                    status={status}
                    isMobile={isMobile}
                    ipLimitEnable={ipLimitEnable}
                    onStopXray={stopXray}
                    onRestartXray={restartXray}
                    onOpenXrayLogs={() => setXrayLogsOpen(true)}
                    onOpenLogs={() => setLogsOpen(true)}
                    onOpenVersionSwitch={() => setVersionOpen(true)}
                  />

                  {/* Panel links / actions */}
                  <Card className="flex h-full flex-col">
                    <CardHeader>
                      <CardTitle>{t('menu.link')}</CardTitle>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-wrap gap-2 pt-4">
                      <ActionButton icon={List} label={t('pages.index.logs')} onClick={() => setLogsOpen(true)} showLabel={!isMobile} />
                      <ActionButton icon={SlidersHorizontal} label={t('pages.index.config')} onClick={openConfig} showLabel={!isMobile} />
                      <ActionButton icon={Server} label={t('pages.index.backupTitle')} onClick={() => setBackupOpen(true)} showLabel={!isMobile} />
                    </CardContent>
                  </Card>

                  {/* Q-UI / version */}
                  <Card className="flex h-full flex-col">
                    <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                      <CardTitle>Q-UI</CardTitle>
                      {isMobile && displayVersion && (
                        <Badge
                          variant={panelUpdateInfo.updateAvailable ? 'warning' : updateCheckFailed ? 'danger' : 'success'}
                          title={updateCheckFailed ? t('pages.index.panelUpdateCheckFailed') : undefined}
                        >
                          {panelUpdateInfo.updateAvailable
                              ? `v${ panelUpdateInfo.latestVersion }`
                              : `v${ displayVersion }${ updateCheckFailed ? ' ⚠' : '' }`}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-wrap gap-2 pt-4">
                      <Button variant="ghost" size="sm" onClick={openTelegram}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                          <path d="M21.93 4.34a1.5 1.5 0 0 0-2.05-1.6L2.97 9.6c-.92.36-.91 1.66.02 1.99l4.32 1.53 1.7 5.23a1 1 0 0 0 1.68.36l2.43-2.43 4.36 3.21a1.5 1.5 0 0 0 2.36-.91l3.09-13.86a1.5 1.5 0 0 0 0-.38ZM9.97 14.66l-.55 3.36-1.36-4.2 9.8-7.05-7.89 7.89Z" />
                        </svg>
                        {!isMobile && <span>@XrayUI</span>}
                      </Button>
                      <ActionButton
                        icon={CloudDownload}
                        label={panelVersionLabel}
                        onClick={openPanelVersion}
                        showLabel={!isMobile}
                        highlight={panelUpdateInfo.updateAvailable}
                        title={updateCheckFailed ? t('pages.index.panelUpdateCheckFailed') : undefined}
                      />
                    </CardContent>
                  </Card>

                  {/* Charts */}
                  <Card className="flex h-full flex-col">
                    <CardHeader>
                      <CardTitle>{t('pages.index.charts')}</CardTitle>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-wrap gap-2 pt-4">
                      <ActionButton icon={ChartArea} label={t('pages.index.systemHistoryTitle')} onClick={() => setSysHistoryOpen(true)} showLabel={!isMobile} />
                      <ActionButton icon={ChartArea} label={t('pages.index.xrayMetricsTitle')} onClick={() => setXrayMetricsOpen(true)} showLabel={!isMobile} />
                    </CardContent>
                  </Card>

                  {/* Operation hours */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('pages.index.operationHours')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 pt-4">
                      <Stat icon={Zap} title="Xray" value={TimeFormatter.formatSecond(status.appStats.uptime)} />
                      <Stat icon={Monitor} title="OS" value={TimeFormatter.formatSecond(status.uptime)} />
                    </CardContent>
                  </Card>

                  {/* Usage */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('usage')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 pt-4">
                      <Stat icon={Database} title={t('pages.index.memory')} value={SizeFormatter.sizeFormat(status.appStats.mem)} />
                      <Stat icon={Split} title={t('pages.index.threads')} value={status.appStats.threads} />
                    </CardContent>
                  </Card>

                  {/* Overall speed */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('pages.index.overallSpeed')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 pt-4">
                      <Stat icon={ArrowUp} title={t('pages.index.upload')} value={SizeFormatter.sizeFormat(status.netIO.up)} suffix="/s" />
                      <Stat icon={ArrowDown} title={t('pages.index.download')} value={SizeFormatter.sizeFormat(status.netIO.down)} suffix="/s" />
                    </CardContent>
                  </Card>

                  {/* Total data */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('pages.index.totalData')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 pt-4">
                      <Stat icon={CloudUpload} title={t('pages.index.sent')} value={SizeFormatter.sizeFormat(status.netTraffic.sent)} />
                      <Stat icon={CloudDownload} title={t('pages.index.received')} value={SizeFormatter.sizeFormat(status.netTraffic.recv)} />
                    </CardContent>
                  </Card>

                  {/* IP addresses */}
                  <Card>
                    <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                      <CardTitle>{t('pages.index.ipAddresses')}</CardTitle>
                      <Tooltip content={t('pages.index.toggleIpVisibility')}>
                        <button
                          type="button"
                          onClick={() => setShowIp((v) => !v)}
                          aria-label={t('pages.index.toggleIpVisibility')}
                          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
                        >
                          {showIp ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                        </button>
                      </Tooltip>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                      <Stat
                        icon={Globe}
                        title="IPv4"
                        value={status.publicIP.ipv4}
                        className={showIp ? '' : 'blur-sm transition-[filter]'}
                      />
                      <Stat
                        icon={Globe}
                        title="IPv6"
                        value={status.publicIP.ipv6}
                        className={showIp ? '' : 'blur-sm transition-[filter]'}
                      />
                    </CardContent>
                  </Card>

                  {/* Connection count */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('pages.index.connectionCount')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 pt-4">
                      <Stat icon={HardDrive} title="TCP" value={status.tcpCount} />
                      <Stat icon={HardDrive} title="UDP" value={status.udpCount} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

        <LazyMount when={panelUpdateOpen}>
          <PanelUpdateModal
            open={panelUpdateOpen}
            info={panelUpdateInfo}
            onClose={() => setPanelUpdateOpen(false)}
            onBusy={setBusy}
          />
        </LazyMount>
        <LazyMount when={logsOpen}>
          <LogModal open={logsOpen} onClose={() => setLogsOpen(false)} />
        </LazyMount>
        <LazyMount when={backupOpen}>
          <BackupModal
            open={backupOpen}
            basePath={basePath}
            onClose={() => setBackupOpen(false)}
            onBusy={setBusy}
          />
        </LazyMount>
        <LazyMount when={sysHistoryOpen}>
          <SystemHistoryModal
            open={sysHistoryOpen}
            status={status}
            onClose={() => setSysHistoryOpen(false)}
          />
        </LazyMount>
        <LazyMount when={xrayMetricsOpen}>
          <XrayMetricsModal open={xrayMetricsOpen} onClose={() => setXrayMetricsOpen(false)} />
        </LazyMount>
        <LazyMount when={xrayLogsOpen}>
          <XrayLogModal open={xrayLogsOpen} onClose={() => setXrayLogsOpen(false)} />
        </LazyMount>
        <LazyMount when={versionOpen}>
          <VersionModal
            open={versionOpen}
            status={status}
            onClose={() => setVersionOpen(false)}
            onBusy={setBusy}
          />
        </LazyMount>

        <LazyMount when={configTextOpen}>
          <Modal
            open={configTextOpen}
            title={t('pages.index.config')}
            size="xl"
            onClose={() => setConfigTextOpen(false)}
            footer={
              <>
                <Button variant="secondary" size={isMobile ? 'sm' : 'md'} onClick={downloadConfig}>
                  <CloudDownload className="h-4 w-4" aria-hidden />
                  {isMobile ? 'Download' : 'config.json'}
                </Button>
                <Button variant="primary" size={isMobile ? 'sm' : 'md'} onClick={copyConfig}>
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy
                </Button>
              </>
            }
          >
            <JsonEditor
              value={configText}
              onChange={setConfigText}
              minHeight={isMobile ? '300px' : 'calc(100vh - 220px)'}
              maxHeight={isMobile ? '70vh' : 'calc(100vh - 220px)'}
              readOnly
            />
          </Modal>
        </LazyMount>
    </PageShell>
    );
}
