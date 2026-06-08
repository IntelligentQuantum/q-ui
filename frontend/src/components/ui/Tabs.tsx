import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (key: string) => void;
  /** `underline` = bottom-border tabs; `segmented` = pill track. */
  variant?: 'underline' | 'segmented';
  /** Stretch tabs to fill the width (each tab flex-1). Good on mobile. */
  fullWidth?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Accessible tablist (ARIA roving tabindex, ←/→/Home/End with automatic
 * activation). Horizontally scrollable on small screens. Token-only, RTL-safe.
 */
export function Tabs({
    tabs,
    value,
    onChange,
    variant = 'underline',
    fullWidth,
    className,
    'aria-label': ariaLabel
}: TabsProps)
{
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const segmented = variant === 'segmented';

    const moveTo = (dir: 1 | -1, from: number) =>
    {
        const n = tabs.length;
        let i = from;
        for (let c = 0; c < n; c++)
        {
            i = (i + dir + n) % n;
            if (!tabs[i].disabled)
            {
                onChange(tabs[i].key);
                refs.current[i]?.focus();
                return;
            }
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) =>
    {
        switch (e.key)
        {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                moveTo(1, idx);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                moveTo(-1, idx);
                break;
            case 'Home':
                e.preventDefault();
                moveTo(1, -1);
                break;
            case 'End':
                e.preventDefault();
                moveTo(-1, 0);
                break;
        }
    };

    return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
          'flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          segmented ? 'gap-1 rounded-xl bg-surface-sunken p-1' : 'gap-1 border-b border-border',
          fullWidth && 'w-full',
          className
      )}
    >
      {tabs.map((tab, i) =>
      {
          const selected = tab.key === value;
          return (
          <button
            key={tab.key}
            ref={(el) =>
            {
                refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
                'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none',
                'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-50',
                fullWidth && 'flex-1',
                segmented
                    ? cn(
                        'rounded-lg px-3 py-1.5',
                        selected ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )
                    : cn(
                        '-mb-px border-b-2 px-3 py-2.5',
                        selected
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    )
            )}
          >
            {tab.icon && <span className="grid h-4 w-4 place-items-center">{tab.icon}</span>}
            {tab.label}
          </button>
          );
      })}
    </div>
    );
}
