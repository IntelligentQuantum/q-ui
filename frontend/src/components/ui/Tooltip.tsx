import { useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';

export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

// Anchor position per side for the default (non-interactive) tooltip, which is
// absolutely positioned relative to its inline wrapper. Kept separate from the
// hover gap below.
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

// Fixed-position coordinates per side for an INTERACTIVE tooltip. Anchored to
// the trigger's viewport rect so the popover escapes any overflow-clipped /
// scrollable ancestor (e.g. a data table), which plain z-index cannot do. No
// gap is left, so the cursor can travel from the trigger onto the popover (a
// DOM descendant) without firing mouseleave — keeping its content scrollable.
function fixedStyleFor(sideValue: TooltipSide, rect: DOMRect): CSSProperties
{
    switch (sideValue)
    {
        case 'top':
            return { top: rect.top, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' };
        case 'start':
            return { top: rect.top + rect.height / 2, left: rect.left, transform: 'translate(-100%, -50%)' };
        case 'end':
            return { top: rect.top + rect.height / 2, left: rect.right, transform: 'translateY(-50%)' };
        case 'bottom':
        default:
            return { top: rect.bottom, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    }
}

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
  /** Make the popover hoverable AND lift it out of clipping ancestors: it is
   *  rendered position:fixed at the trigger's rect with pointer events enabled,
   *  so it sits above (and is never clipped by) a scrollable table. Use for
   *  data-heavy tooltips whose content is taller than `max-h-*` and must scroll. */
  interactive?: boolean;
}

/**
 * Lightweight hover/focus tooltip. The default variant is CSS-positioned
 * relative to an inline wrapper; the `interactive` variant is fixed-positioned
 * (escapes table overflow) and hoverable/scrollable. Token-only, RTL-safe.
 */
export function Tooltip({ content, side = 'top', delay = 150, children, className, block, interactive }: TooltipProps)
{
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<CSSProperties | null>(null);
    const timer = useRef<number | undefined>(undefined);
    const wrapRef = useRef<HTMLSpanElement>(null);
    const id = useId();

    const show = () =>
    {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() =>
        {
            if (interactive && wrapRef.current)
            {
                setPos(fixedStyleFor(side, wrapRef.current.getBoundingClientRect()));
            }
            setOpen(true);
        }, delay);
    };
    const hide = () =>
    {
        window.clearTimeout(timer.current);
        setOpen(false);
    };

    return (
    <span
      ref={wrapRef}
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
          style={interactive ? (pos ?? undefined) : undefined}
          className={cn(
              'z-[var(--z-popover)] rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-medium text-foreground shadow-md',
              'motion-safe:animate-[fade-in_120ms_ease-out]',
              interactive
                  ? 'fixed pointer-events-auto whitespace-normal'
                  : cn('absolute pointer-events-none whitespace-nowrap', sidePos[side], sideGap[side]),
              className
          )}
        >
          {content}
        </span>
      )}
    </span>
    );
}
