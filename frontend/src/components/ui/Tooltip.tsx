import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

// Anchor position per side, kept separate from the hover gap: an interactive
// tooltip drops the gap so the cursor can travel onto the popover (which lives
// inside the wrapper) without firing mouseleave, making its content scrollable.
const sidePos: Record<TooltipSide, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2',
    bottom: 'top-full left-1/2 -translate-x-1/2',
    start: 'end-full top-1/2 -translate-y-1/2',
    end: 'start-full top-1/2 -translate-y-1/2'
};

const sideGap: Record<TooltipSide, string> = {
    top: 'mb-2',
    bottom: 'mt-2',
    start: 'me-2',
    end: 'ms-2'
};

export interface TooltipProps {
  content: ReactNode;
  side?: TooltipSide;
  delay?: number;
  children: ReactNode;
  className?: string;
  /** Stretch the trigger wrapper to fill its container (e.g. a grid track) so
   *  the wrapped element isn't shrunk to content width. Off by default to keep
   *  the inline behaviour every existing call site relies on. */
  block?: boolean;
  /** Make the popover hoverable: pointer events are enabled and the hover gap
   *  is removed so the cursor can reach it. Use for data-heavy tooltips whose
   *  content is taller than `max-h-*` and needs to be scrolled. */
  interactive?: boolean;
}

/**
 * Lightweight hover/focus tooltip (CSS-positioned relative to an inline wrapper).
 * Shows on pointer-enter and keyboard focus; respects reduced-motion via the
 * global guard. Token-only, RTL-safe (logical start/end placement).
 */
export function Tooltip({ content, side = 'top', delay = 150, children, className, block, interactive }: TooltipProps)
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
      className={cn('relative inline-flex', block && 'w-full')}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className={cn(block && 'block w-full')} aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
              'absolute z-[var(--z-popover)] rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-medium text-foreground shadow-md',
              'motion-safe:animate-[fade-in_120ms_ease-out]',
              interactive ? 'pointer-events-auto whitespace-normal' : 'pointer-events-none whitespace-nowrap',
              sidePos[side],
              !interactive && sideGap[side],
              className
          )}
        >
          {content}
        </span>
      )}
    </span>
    );
}
