import type { ReactNode } from 'react';
import { Card } from './Card';

export interface StatCardProps {
  /** Leading icon. Pass a status color (e.g. text-success) to override the
   *  default neutral tint. */
  icon?: ReactNode;
  /** Metric caption. `title` is accepted as an alias (older call sites). */
  label?: ReactNode;
  title?: ReactNode;
  value: ReactNode;
  className?: string;
}

/**
 * The one canonical summary/metric card used across every page (replaces the
 * ~8 per-page copies that had drifted apart). Monochrome icon chip by default;
 * status-colored icons override it. Token-only, RTL-safe.
 */
export function StatCard({ icon, label, title, value, className }: StatCardProps)
{
    return (
    <Card className={className}>
      <div className="flex items-center gap-3 p-4">
        {icon != null && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted-foreground">
            {icon}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs text-muted-foreground">{label ?? title}</span>
          <span className="truncate text-xl font-semibold leading-tight tabular-nums text-foreground">{value}</span>
        </div>
      </div>
    </Card>
    );
}
