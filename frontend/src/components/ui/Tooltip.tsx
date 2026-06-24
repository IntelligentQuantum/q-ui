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
//
// It also caps maxHeight to the available space in the chosen direction (and
// flips top<->bottom when the anchored side is too cramped) so a tall list never
// runs off-screen with unreachable rows — it scrolls inside the viewport instead.
// Keep a data-heavy popover a sensible, popover-sized height (it scrolls inside),
// never taller than the room available in the chosen direction.
const MAX_POPOVER_HEIGHT = 360;

function fixedStyleFor(sideValue: TooltipSide, rect: DOMRect): CSSProperties
{
    const margin = 8;
    const vh = window.innerHeight;
    const cap = (space: number) => Math.min(Math.max(0, space), MAX_POPOVER_HEIGHT);

    if (sideValue === 'start')
    {
        return { top: rect.top + rect.height / 2, left: rect.left, transform: 'translate(-100%, -50%)', maxHeight: cap(vh - margin * 2) };
    }
    if (sideValue === 'end')
    {
        return { top: rect.top + rect.height / 2, left: rect.right, transform: 'translateY(-50%)', maxHeight: cap(vh - margin * 2) };
    }

    // top / bottom — pick the side with usable room, preferring the requested one.
    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let placeBelow = sideValue !== 'top';
    if (placeBelow && spaceBelow < 180 && spaceAbove > spaceBelow)
    {
        placeBelow = false;
    }
    else if (!placeBelow && spaceAbove < 180 && spaceBelow > spaceAbove)
    {
        placeBelow = true;
    }

    const left = rect.left + rect.width / 2;
    return placeBelow
        ? { top: rect.bottom, left, transform: 'translateX(-50%)', maxHeight: cap(spaceBelow) }
        : { top: rect.top, left, transform: 'translate(-50%, -100%)', maxHeight: cap(spaceAbove) };
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
              'z-[var(--z-popover)] rounded-md border border-border bg-surface-raised text-xs font-medium text-foreground shadow-md',
              'motion-safe:animate-[fade-in_120ms_ease-out]',
              interactive
                  // The popover is the single scroll container: capped to a
                  // popover height (see fixedStyleFor) and scrolling internally so
                  // a data-heavy list (e.g. all online clients) is fully reachable
                  // instead of overflowing off-screen. No padding here — content
                  // (e.g. TooltipList) owns its layout so a sticky header sits flush.
                  ? 'fixed pointer-events-auto max-w-[min(85vw,24rem)] overflow-y-auto overscroll-contain whitespace-normal'
                  : cn('absolute pointer-events-none whitespace-nowrap px-2 py-1', sidePos[side], sideGap[side]),
              className
          )}
        >
          {content}
        </span>
      )}
    </span>
    );
}

export interface TooltipListProps {
  /** The rows to show (emails, inbound labels, …). */
  items: string[];
  /** Optional sticky header label; a count badge is shown next to it. */
  title?: ReactNode;
  /** Monospace the rows (use for emails/IDs so they align). */
  mono?: boolean;
  /** Shown when `items` is empty. */
  emptyText?: string;
}

/**
 * Standard content for a data-heavy interactive Tooltip: a sticky header with a
 * count and a clean, scrollable list of rows. Pair with `<Tooltip interactive>`,
 * which provides the fixed positioning, viewport clamping and the scroll. Used
 * for the clients summary cards, the inbound client-count badges, and inbound
 * overflow chips so they all look and behave identically.
 */
export function TooltipList({ items, title, mono = false, emptyText = '—' }: TooltipListProps)
{
    return (
    <div className="min-w-[10rem]">
      {title != null && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
          <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] font-semibold tabular-nums text-foreground">
            {items.length}
          </span>
        </div>
      )}
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</div>
      ) : (
        <ul className="flex flex-col py-1">
          {items.map((it, i) => (
            <li
              key={`${ it }-${ i }`}
              title={it}
              className={cn(
                  'truncate px-3 py-1 text-xs leading-relaxed text-foreground/90 transition-colors hover:bg-foreground/[0.06]',
                  mono && 'font-mono text-[11px]'
              )}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
    );
}
