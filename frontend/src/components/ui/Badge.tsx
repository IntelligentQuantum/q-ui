import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';

const variantClasses: Record<BadgeVariant, string> = {
    neutral: 'bg-surface-sunken text-muted-foreground',
    primary: 'bg-accent-subtle text-accent',
    success: 'bg-success-subtle text-success',
    warning: 'bg-warning-subtle text-warning',
    danger: 'bg-danger-subtle text-danger',
    outline: 'border border-border text-foreground'
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps)
{
    return (
    <span
      className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
          variantClasses[variant],
          className
      )}
      {...props}
    />
    );
}
