import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Zap } from 'lucide-react';

import { Badge, cn } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface SubUsageSummaryProps {
  usedByte: number;
  totalByte: number;
  usedLabel: string;
  totalLabel: string;
  remainedLabel: string;
  expireMs: number;
  isActive: boolean;
}

function pickBarClass(pct: number): string
{
    if (pct >= 90)
    {
        return 'bg-danger';
    }
    if (pct >= 75)
    {
        return 'bg-warning';
    }
    return 'bg-success';
}

function formatExpiryChip(expireMs: number): { label: string; variant: BadgeVariant } | null
{
    if (expireMs <= 0)
    {
        return null;
    }
    const diff = expireMs - Date.now();
    if (diff <= 0)
    {
        return { label: 'Expired', variant: 'danger' };
    }
    const days = Math.floor(diff / 86400000);
    if (days >= 1)
    {
        return { label: `${ days }d`, variant: days <= 3 ? 'warning' : 'primary' };
    }
    const hours = Math.max(1, Math.floor(diff / 3600000));
    return { label: `${ hours }h`, variant: 'warning' };
}

export default function SubUsageSummary({
    usedByte,
    totalByte,
    usedLabel,
    totalLabel,
    remainedLabel,
    expireMs,
    isActive
}: SubUsageSummaryProps)
{
    const { t } = useTranslation();
    const pct = useMemo(() =>
    {
        if (totalByte <= 0)
        {
            return 0;
        }
        const v = (usedByte / totalByte) * 100;
        if (!Number.isFinite(v))
        {
            return 0;
        }
        return Math.max(0, Math.min(100, v));
    }, [usedByte, totalByte]);

    const expiry = formatExpiryChip(expireMs);
    const isUnlimited = totalByte <= 0;

    return (
    <div
      className={cn(
          'mt-3 rounded-lg border border-border bg-surface-sunken px-4 py-3.5',
          !isActive && 'border-danger/40 opacity-70'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-1.5 tabular-nums">
          <span className="text-lg font-bold text-foreground">{usedLabel}</span>
          <span className="text-base text-muted-foreground">/</span>
          <span className="text-sm font-medium text-muted-foreground">
            {isUnlimited ? '∞' : totalLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isUnlimited && (
            <Badge variant="primary">
              <Zap className="h-3 w-3" aria-hidden />
              {t('subscription.unlimited')}
            </Badge>
          )}
          {expiry && (
            <Badge variant={expiry.variant}>
              <Clock className="h-3 w-3" aria-hidden />
              {expiry.label}
            </Badge>
          )}
        </div>
      </div>
      {!isUnlimited && (
        <div className="mb-1.5 h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', pickBarClass(pct))}
            style={{ width: `${ pct }%` }}
          />
        </div>
      )}
      <div className="flex min-h-4 items-center justify-between text-xs tabular-nums text-muted-foreground">
        {!isUnlimited && (
          <>
            <span>{remainedLabel}</span>
            <span className="font-semibold text-foreground">{pct.toFixed(1)}%</span>
          </>
        )}
      </div>
    </div>
    );
}
