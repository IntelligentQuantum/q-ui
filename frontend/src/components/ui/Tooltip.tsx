import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

const sideClasses: Record<TooltipSide, string> = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
    start: 'end-full top-1/2 me-2 -translate-y-1/2',
    end: 'start-full top-1/2 ms-2 -translate-y-1/2'
};

export interface TooltipProps {
  content: ReactNode;
  side?: TooltipSide;
  delay?: number;
  children: ReactNode;
  className?: string;
}

/**
 * Lightweight hover/focus tooltip (CSS-positioned relative to an inline wrapper).
 * Shows on pointer-enter and keyboard focus; respects reduced-motion via the
 * global guard. Token-only, RTL-safe (logical start/end placement).
 */
export function Tooltip({ content, side = 'top', delay = 150, children, className }: TooltipProps)
{
    const [open, setOpen] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    const id = useId();

    const show = () =>
    {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setOpen(true), delay);
    };
    const hide = () =>
    {
        window.clearTimeout(timer.current);
        setOpen(false);
    };

    return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
              'pointer-events-none absolute z-[var(--z-popover)] whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-medium text-foreground shadow-md',
              'motion-safe:animate-[fade-in_120ms_ease-out]',
              sideClasses[side],
              className
          )}
        >
          {content}
        </span>
      )}
    </span>
    );
}
