import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Select } from './Select';

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  /** Total number of pages (>= 1). */
  pageCount: number;
  /** Called with the next 1-based page. The component clamps to [1, pageCount]. */
  onPageChange: (page: number) => void;
  /** Total item count — enables the "from–to of total" range readout. */
  total?: number;
  /** Active page size — used for the range readout and the size selector value. */
  pageSize?: number;
  /** Provide to render a rows-per-page selector. */
  onPageSizeChange?: (size: number) => void;
  /** Options for the size selector. Defaults to 10/25/50/100. */
  pageSizeOptions?: number[];
  /** Page numbers shown on each side of the current page (default 1). */
  siblingCount?: number;
  /** Page numbers pinned at each end (default 1). */
  boundaryCount?: number;
  /** Force the compact (no numbered pages) layout regardless of viewport. */
  compact?: boolean;
  className?: string;
}

type PageItem = number | 'start-ellipsis' | 'end-ellipsis';

const range = (start: number, end: number): number[] =>
    Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);

// Port of MUI's usePagination item algorithm: pinned boundary pages at each end,
// a window of `siblingCount` pages around the current page, and ellipses filling
// the gaps. Battle-tested for the edge cases (current near either end, tiny
// counts) so the bar never shows a broken/empty number window.
function paginationItems(
    page: number,
    count: number,
    siblingCount: number,
    boundaryCount: number
): PageItem[]
{
    const startPages = range(1, Math.min(boundaryCount, count));
    const endPages = range(Math.max(count - boundaryCount + 1, boundaryCount + 1), count);

    const siblingsStart = Math.max(
        Math.min(page - siblingCount, count - boundaryCount - siblingCount * 2 - 1),
        boundaryCount + 2
    );
    const siblingsEnd = Math.min(
        Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
        endPages.length > 0 ? endPages[0] - 2 : count - 1
    );

    return [
        ...startPages,
        ...(siblingsStart > boundaryCount + 2
            ? ['start-ellipsis' as const]
            : boundaryCount + 1 < count - boundaryCount
                ? [boundaryCount + 1]
                : []),
        ...range(siblingsStart, siblingsEnd),
        ...(siblingsEnd < count - boundaryCount - 1
            ? ['end-ellipsis' as const]
            : count - boundaryCount > boundaryCount
                ? [count - boundaryCount]
                : []),
        ...endPages
    ];
}

const navBtn =
    'grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors ' +
    'hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ' +
    'disabled:pointer-events-none disabled:opacity-40';

/**
 * Shared pagination bar — first / prev / numbered pages (with ellipses) / next /
 * last, an optional rows-per-page selector, and a "from–to of total" readout.
 *
 * Controlled: it owns no page state. RTL-safe (nav chevrons flip to match the
 * nearest writing direction, detected in JS because Tailwind's `rtl:` keys off
 * the document/ancestor lang and misfires for a region whose dir differs from
 * the page). Mobile-first: numbered pages collapse to a "page / count" pill on
 * narrow viewports or when `compact` is set.
 */
export function Pagination({
    page,
    pageCount,
    onPageChange,
    total,
    pageSize,
    onPageSizeChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    siblingCount = 1,
    boundaryCount = 1,
    compact = false,
    className
}: PaginationProps)
{
    const { t } = useTranslation();

    const rootRef = useRef<HTMLDivElement>(null);
    const [rtl, setRtl] = useState(false);
    useLayoutEffect(() =>
    {
        if (rootRef.current)
        {
            setRtl(getComputedStyle(rootRef.current).direction === 'rtl');
        }
    });

    const safeCount = Math.max(1, pageCount);
    const current = Math.min(Math.max(1, page), safeCount);
    const items = useMemo(
        () => paginationItems(current, safeCount, siblingCount, boundaryCount),
        [current, safeCount, siblingCount, boundaryCount]
    );

    const go = (p: number) => onPageChange(Math.min(safeCount, Math.max(1, p)));

    const Prev = rtl ? ChevronRight : ChevronLeft;
    const Next = rtl ? ChevronLeft : ChevronRight;
    const First = rtl ? ChevronsRight : ChevronsLeft;
    const Last = rtl ? ChevronsLeft : ChevronsRight;

    const showRange = typeof total === 'number' && typeof pageSize === 'number' && pageSize > 0;
    const rangeFrom = showRange ? (total === 0 ? 0 : (current - 1) * pageSize! + 1) : 0;
    const rangeTo = showRange ? Math.min(current * pageSize!, total!) : 0;

    const showSizeSelect = typeof onPageSizeChange === 'function' && typeof pageSize === 'number';

    return (
    <div
      ref={rootRef}
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3', className)}
    >
      {/* Left cluster: range readout + rows-per-page */}
      <div className="flex items-center gap-3">
        {showRange && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('pagination.range', { from: rangeFrom, to: rangeTo, total })}
          </span>
        )}
        {showSizeSelect && (
          <Select
            value={String(pageSize)}
            className="w-[5.5rem]"
            aria-label={t('pagination.rowsPerPage')}
            onChange={(v) => onPageSizeChange!(Number(v))}
            options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
          />
        )}
      </div>

      {/* Right cluster: navigation */}
      <nav className="flex items-center gap-1" aria-label={t('pagination.label')}>
        <button
          type="button"
          className={navBtn}
          disabled={current <= 1}
          onClick={() => go(1)}
          aria-label={t('pagination.first')}
        >
          <First className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={navBtn}
          disabled={current <= 1}
          onClick={() => go(current - 1)}
          aria-label={t('pagination.previous')}
        >
          <Prev className="h-4 w-4" aria-hidden />
        </button>

        {/* Numbered pages — desktop only (or hidden entirely when compact). */}
        {!compact && (
          <div className="hidden items-center gap-1 sm:flex">
            {items.map((item, i) =>
            {
                if (item === 'start-ellipsis' || item === 'end-ellipsis')
                {
                    return (
                    <span
                      key={`${ item }-${ i }`}
                      className="grid h-8 w-8 place-items-center text-muted-foreground"
                      aria-hidden
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                    );
                }
                const active = item === current;
                return (
                <button
                  key={item}
                  type="button"
                  onClick={() => go(item)}
                  aria-label={t('pagination.page', { page: item })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                      'grid h-8 min-w-8 place-items-center rounded-md px-2 text-xs font-medium tabular-nums outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring',
                      active
                          ? 'bg-accent text-accent-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground'
                  )}
                >
                  {item}
                </button>
                );
            })}
          </div>
        )}

        {/* Compact "page / count" pill — narrow viewports, or always when compact. */}
        <span
          className={cn(
              'px-2 text-xs tabular-nums text-muted-foreground',
              compact ? 'inline' : 'sm:hidden'
          )}
        >
          {current} / {safeCount}
        </span>

        <button
          type="button"
          className={navBtn}
          disabled={current >= safeCount}
          onClick={() => go(current + 1)}
          aria-label={t('pagination.next')}
        >
          <Next className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={navBtn}
          disabled={current >= safeCount}
          onClick={() => go(safeCount)}
          aria-label={t('pagination.last')}
        >
          <Last className="h-4 w-4" aria-hidden />
        </button>
      </nav>
    </div>
    );
}
