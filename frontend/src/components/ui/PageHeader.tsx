import type { ReactNode } from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot for page-level actions (buttons, etc.). */
  actions?: ReactNode;
  className?: string;
}

/**
 * The consistent page title block shown at the top of every panel page. Title +
 * optional description on the start side, actions on the end side; stacks on
 * mobile. Token-only, RTL-safe. Rendered automatically by PageShell.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps)
{
    return (
    <div
      className={cn(
          'mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
          className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">{title}</h1>
        {description != null && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions != null && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
    );
}
