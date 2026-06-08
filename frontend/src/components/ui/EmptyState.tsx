import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  /** Optional illustrative icon (rendered in a soft circular chip). */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Optional primary action (e.g. a "Create" button). */
  action?: ReactNode;
  className?: string;
}

/**
 * The one canonical empty state: a centered icon chip + title + optional
 * description and action. Used by tables/lists so "nothing here yet" reads the
 * same everywhere. Token-only, RTL-safe.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps)
{
    return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon != null && (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-sunken text-muted-foreground [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description != null && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action != null && <div className="mt-1">{action}</div>}
    </div>
    );
}
