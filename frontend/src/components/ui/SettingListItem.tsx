import type { ReactNode } from 'react';
import { cn } from './cn';

interface SettingListItemProps {
  paddings?: 'small' | 'default';
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  control?: ReactNode;
}

export default function SettingListItem({
    paddings = 'default',
    title,
    description,
    children,
    control
}: SettingListItemProps)
{
    return (
    <div
      className={cn(
          'flex flex-col gap-4 border-b border-border last:border-b-0 lg:flex-row lg:items-center lg:justify-between',
          paddings === 'small' ? 'px-5 py-2.5' : 'p-5'
      )}
    >
      <div className="flex flex-col gap-1 lg:w-1/2">
        {title && <div className="text-sm font-medium text-foreground">{title}</div>}
        {description && (
          <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="lg:w-1/2">{control ?? children}</div>
    </div>
    );
}
