import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { InfoIcon, CheckCircleIcon, AlertTriangleIcon, XCircleIcon } from './icons';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const variantClasses: Record<AlertVariant, string> = {
    info: 'border-border bg-surface-sunken text-foreground',
    success: 'border-transparent bg-success-subtle text-success',
    warning: 'border-transparent bg-warning-subtle text-warning',
    danger: 'border-transparent bg-danger-subtle text-danger'
};

const icons: Record<AlertVariant, typeof InfoIcon> = {
    info: InfoIcon,
    success: CheckCircleIcon,
    warning: AlertTriangleIcon,
    danger: XCircleIcon
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  icon?: boolean;
}

export function Alert({ className, variant = 'info', title, icon = true, children, ...props }: AlertProps)
{
    const Icon = icons[variant];
    return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-md border p-3 text-sm', variantClasses[variant], className)}
      {...props}
    >
      {icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="flex flex-col gap-0.5">
        {title != null && <div className="font-medium">{title}</div>}
        {children != null && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
    );
}
