import { useTranslation } from 'react-i18next';
import { ChartArea } from 'lucide-react';

import { CPUFormatter, SizeFormatter } from '@/utils';
import { Card, CardContent, Tooltip } from '@/components/ui';
import type { Status } from '@/models/status';

interface StatusCardProps {
  status: Status;
  isMobile: boolean;
}

interface GaugeProps {
  percent: number;
  color: string;
  size: number;
  strokeWidth: number;
}

// Token-aware ring gauge (replaces AntD dashboard Progress). The rail uses a
// subtle foreground tint so it adapts to light/dark automatically; the arc keeps
// the status-driven color from the model.
function Gauge({ percent, color, size, strokeWidth }: GaugeProps)
{
    const radius = (size - strokeWidth) / 2;
    // Dashboard-style ~75% arc (270deg) with a gap at the bottom.
    const gap = 0.25;
    const circumference = 2 * Math.PI * radius;
    const arcLength = circumference * (1 - gap);
    const clamped = Math.max(0, Math.min(100, percent));
    const dashOffset = arcLength * (1 - clamped / 100);

    return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[225deg]" role="img" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-foreground/[0.08]"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${ arcLength } ${ circumference }`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${ arcLength } ${ circumference }`}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-medium tabular-nums text-foreground">{clamped}%</span>
    </div>
    );
}

export default function StatusCard({ status, isMobile }: StatusCardProps)
{
    const { t } = useTranslation();
    const gaugeSize = isMobile ? 60 : 90;
    const strokeWidth = isMobile ? 7 : 5;

    return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-4 md:gap-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Gauge percent={status.cpu.percent} color={status.cpu.color} size={gaugeSize} strokeWidth={strokeWidth} />
            <div className="flex items-center justify-center gap-1 text-sm text-foreground">
              <span className="font-semibold">{t('pages.index.cpu')}:</span>
              <span className="text-muted-foreground">{CPUFormatter.cpuCoreFormat(status.cpuCores)}</span>
              <Tooltip
                content={
                  <div className="space-y-0.5">
                    <div>
                      <b>{t('pages.index.logicalProcessors')}:</b> {status.logicalPro}
                    </div>
                    <div>
                      <b>{t('pages.index.frequency')}:</b> {CPUFormatter.cpuSpeedFormat(status.cpuSpeedMhz)}
                    </div>
                  </div>
                }
              >
                <ChartArea className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </Tooltip>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <Gauge percent={status.mem.percent} color={status.mem.color} size={gaugeSize} strokeWidth={strokeWidth} />
            <div className="text-sm text-foreground">
              <span className="font-semibold">{t('pages.index.memory')}:</span>{' '}
              <span className="text-muted-foreground">
                {SizeFormatter.sizeFormat(status.mem.current)} / {SizeFormatter.sizeFormat(status.mem.total)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <Gauge percent={status.swap.percent} color={status.swap.color} size={gaugeSize} strokeWidth={strokeWidth} />
            <div className="text-sm text-foreground">
              <span className="font-semibold">{t('pages.index.swap')}:</span>{' '}
              <span className="text-muted-foreground">
                {SizeFormatter.sizeFormat(status.swap.current)} / {SizeFormatter.sizeFormat(status.swap.total)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <Gauge percent={status.disk.percent} color={status.disk.color} size={gaugeSize} strokeWidth={strokeWidth} />
            <div className="text-sm text-foreground">
              <span className="font-semibold">{t('pages.index.storage')}:</span>{' '}
              <span className="text-muted-foreground">
                {SizeFormatter.sizeFormat(status.disk.current)} / {SizeFormatter.sizeFormat(status.disk.total)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    );
}
