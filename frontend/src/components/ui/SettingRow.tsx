import type { ReactNode } from 'react';
import { Label } from './Label';

export interface SettingRowProps {
  title: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}

/**
 * The canonical settings row: title (+ optional description) on the inline-start,
 * control on the inline-end. Stacks on mobile, splits side-by-side on lg+. Used
 * across every Settings tab so the whole settings surface reads identically.
 */
export function SettingRow({ title, description, htmlFor, children }: SettingRowProps)
{
    return (
    <div className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        {htmlFor ? (
          <Label htmlFor={htmlFor}>{title}</Label>
        ) : (
          <span className="text-sm font-medium text-foreground">{title}</span>
        )}
        {description != null && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      {children != null && <div className="w-full lg:w-1/2 lg:max-w-sm">{children}</div>}
    </div>
    );
}
