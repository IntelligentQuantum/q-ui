import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { List, Power, RotateCw, Wrench } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Tooltip } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import type { Status } from '@/models/status';

interface XrayStatusCardProps {
  status: Status;
  isMobile: boolean;
  ipLimitEnable: boolean;
  onStopXray: () => void;
  onRestartXray: () => void;
  onOpenLogs: () => void;
  onOpenXrayLogs: () => void;
  onOpenVersionSwitch: () => void;
}

const XRAY_STATE_KEYS: Record<string, string> = {
    running: 'pages.index.xrayStatusRunning',
    stop: 'pages.index.xrayStatusStop',
    error: 'pages.index.xrayStatusError'
};

const XRAY_STATE_BADGE: Record<string, BadgeVariant> = {
    running: 'success',
    stop: 'warning',
    error: 'danger'
};

export default function XrayStatusCard({
    status,
    isMobile,
    ipLimitEnable,
    onStopXray,
    onRestartXray,
    onOpenLogs,
    onOpenXrayLogs,
    onOpenVersionSwitch
}: XrayStatusCardProps)
{
    const { t } = useTranslation();

    const stateText = t(XRAY_STATE_KEYS[status.xray.state] ?? 'pages.index.xrayStatusUnknown');
    const badgeVariant = XRAY_STATE_BADGE[status.xray.state] ?? 'neutral';

    const errorLines = useMemo(
        () => (status.xray.errorMsg || '').split('\n'),
        [status.xray.errorMsg]
    );

    const statusBadge = <Badge variant={badgeVariant}>{stateText}</Badge>;

    const versionLabel =
    status.xray.version && status.xray.version !== 'Unknown'
        ? `v${ status.xray.version }`
        : t('pages.index.xraySwitch');

    return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle>{t('pages.index.xrayStatus')}</CardTitle>
          {isMobile && status.xray.version && status.xray.version !== 'Unknown' && (
            <Badge variant="success">v{status.xray.version}</Badge>
          )}
        </div>
        {status.xray.state === 'error' ? (
          <Tooltip
            side="bottom"
            content={
              <div className="max-w-[320px] whitespace-pre-wrap break-words text-start">
                <button
                  type="button"
                  onClick={onOpenLogs}
                  className="mb-1 flex items-center gap-1 font-semibold text-accent"
                >
                  <List className="h-3.5 w-3.5" aria-hidden />
                  {t('pages.index.xrayStatusError')}
                </button>
                {errorLines.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </div>
            }
          >
            {statusBadge}
          </Tooltip>
        ) : (
            statusBadge
        )}
      </CardHeader>

      <CardContent className="mt-auto flex flex-wrap gap-2 pt-4">
        {ipLimitEnable && (
          <Button variant="secondary" size="sm" onClick={onOpenXrayLogs}>
            <List className="h-4 w-4" aria-hidden />
            {!isMobile && <span>{t('pages.index.logs')}</span>}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onStopXray}>
          <Power className="h-4 w-4" aria-hidden />
          {!isMobile && <span>{t('pages.index.stopXray')}</span>}
        </Button>
        <Button variant="secondary" size="sm" onClick={onRestartXray}>
          <RotateCw className="h-4 w-4" aria-hidden />
          {!isMobile && <span>{t('pages.index.restartXray')}</span>}
        </Button>
        <Button variant="secondary" size="sm" onClick={onOpenVersionSwitch}>
          <Wrench className="h-4 w-4" aria-hidden />
          {!isMobile && <span>{versionLabel}</span>}
        </Button>
      </CardContent>
    </Card>
    );
}
