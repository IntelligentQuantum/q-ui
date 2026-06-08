import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from './cn';
import { Checkbox } from './Checkbox';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Custom cell renderer. Falls back to `accessor` value, else the row's `key`. */
  cell?: (row: T, index: number) => ReactNode;
  /** Value used for the default cell and for sorting. Required for `sortable`. */
  accessor?: (row: T) => string | number;
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  width?: string | number;
  /** Hide this column below the given breakpoint (mobile-first column priority). */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface TableRowSelection<T = unknown> {
  /** Controlled set of selected row keys. */
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
  /** Rows for which selection is disabled (excluded from select-all). */
  getDisabled?: (row: T) => boolean;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  /** Rows per page. `0` disables pagination. Default 10. */
  pageSize?: number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Enables a leading checkbox column for multi-row selection. */
  rowSelection?: TableRowSelection<T>;
  className?: string;
}

const alignClass = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;
const hideClass = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

function SelectAllCheckbox({
    checked,
    indeterminate,
    onChange
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
})
{
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() =>
    {
        if (ref.current)
        {
            ref.current.indeterminate = indeterminate && !checked;
        }
    }, [indeterminate, checked]);
    return <Checkbox ref={ref} checked={checked} onChange={onChange} aria-label="Select all rows" />;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function Table<T>({
    columns,
    data,
    rowKey,
    loading = false,
    pageSize = 10,
    empty,
    onRowClick,
    rowSelection,
    className
}: TableProps<T>)
{
    const [sort, setSort] = useState<SortState>(null);
    const [page, setPage] = useState(0);

    // Resolve the table's actual direction (nearest `dir`) to flip the pagination
    // chevrons. JS, not CSS — Tailwind's `:dir()`/`rtl:` compile to language- or
    // ancestor-based selectors that misfire when a region's dir differs from the
    // document (e.g. an LTR view inside an RTL panel). Runs every render to stay in
    // sync; setState bails when unchanged.
    const rootRef = useRef<HTMLDivElement>(null);
    const [rtl, setRtl] = useState(false);
    useLayoutEffect(() =>
    {
        if (rootRef.current)
        {
            setRtl(getComputedStyle(rootRef.current).direction === 'rtl');
        }
    });

    const sorted = useMemo(() =>
    {
        if (!sort)
        {
            return data;
        }
        const col = columns.find((c) => c.key === sort.key);
        if (!col?.accessor)
        {
            return data;
        }
        const acc = col.accessor;
        return [...data].sort((a, b) =>
        {
            const av = acc(a);
            const bv = acc(b);
            if (av < bv)
            {
                return sort.dir === 'asc' ? -1 : 1;
            }
            if (av > bv)
            {
                return sort.dir === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [data, sort, columns]);

    const paginated = pageSize > 0;
    const pageCount = paginated ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
    const current = Math.min(page, pageCount - 1);
    const rows = paginated ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted;

    const toggleSort = (key: string) =>
    {
        setPage(0);
        setSort((prev) =>
        {
            if (!prev || prev.key !== key)
            {
                return { key, dir: 'asc' };
            }
            if (prev.dir === 'asc')
            {
                return { key, dir: 'desc' };
            }
            return null;
        });
    };

    // Multi-row selection. Select-all spans every selectable sorted row (not just
    // the current page), excluding rows marked disabled by getDisabled.
    const selectedSet = useMemo(() => new Set(rowSelection?.selectedKeys ?? []), [rowSelection]);
    const selectableKeys = useMemo(
        () =>
            rowSelection
                ? sorted.filter((row) => !rowSelection.getDisabled?.(row)).map((row, i) => rowKey(row, i))
                : [],
        [sorted, rowKey, rowSelection]
    );
    const allSelected = !!rowSelection && selectableKeys.length > 0 && selectableKeys.every((k) => selectedSet.has(k));
    const someSelected = !!rowSelection && selectableKeys.some((k) => selectedSet.has(k));

    const toggleAll = () =>
    {
        if (!rowSelection)
        {
            return;
        }
        if (allSelected)
        {
            const drop = new Set(selectableKeys);
            rowSelection.onChange(rowSelection.selectedKeys.filter((k) => !drop.has(k)));
        }
        else
        {
            const merged = new Set(rowSelection.selectedKeys);
            selectableKeys.forEach((k) => merged.add(k));
            rowSelection.onChange([...merged]);
        }
    };

    const toggleRow = (key: string) =>
    {
        if (!rowSelection)
        {
            return;
        }
        if (selectedSet.has(key))
        {
            rowSelection.onChange(rowSelection.selectedKeys.filter((k) => k !== key));
        }
        else
        {
            rowSelection.onChange([...rowSelection.selectedKeys, key]);
        }
    };

    const totalCols = columns.length + (rowSelection ? 1 : 0);

    return (
    <div ref={rootRef} className={cn('overflow-hidden rounded-lg border border-border bg-surface', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              {rowSelection && (
                <th scope="col" className="w-10 px-3 py-2.5 sm:px-4">
                  <SelectAllCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                </th>
              )}
              {columns.map((col) =>
              {
                  const active = sort?.key === col.key;
                  const a = alignClass[col.align ?? 'start'];
                  return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                        'px-3 py-2.5 font-medium text-muted-foreground sm:px-4',
                        a,
                        col.hideBelow && hideClass[col.hideBelow],
                        col.className
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                            'inline-flex items-center gap-1.5 outline-none transition-colors hover:text-foreground',
                            'focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
                            col.align === 'end' && 'flex-row-reverse',
                            active && 'text-foreground'
                        )}
                      >
                        {col.header}
                        {active ? (
                            sort?.dir === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                            )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                        col.header
                    )}
                  </th>
                  );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
                Array.from({ length: paginated ? Math.min(pageSize, 5) : 5 }).map((_, r) => (
                <tr key={`sk-${ r }`} className="border-b border-border last:border-0">
                  {rowSelection && <td className="px-3 py-3 sm:px-4" />}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-3 py-3 sm:px-4', col.hideBelow && hideClass[col.hideBelow])}
                    >
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
                ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="p-0">
                  {typeof empty === 'string' || empty === undefined
                      ? <EmptyState icon={<Inbox aria-hidden />} title={empty ?? 'No data'} />
                      : <div className="px-4 py-12 text-center text-muted-foreground">{empty}</div>}
                </td>
              </tr>
            ) : (
                rows.map((row, i) =>
                {
                    const key = rowKey(row, i);
                    return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                      'border-b border-border transition-colors last:border-0',
                      (onRowClick || rowSelection) && 'hover:bg-foreground/[0.03]',
                      onRowClick && 'cursor-pointer'
                  )}
                >
                  {rowSelection && (
                    <td className="px-3 py-3 sm:px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedSet.has(key)}
                        disabled={rowSelection.getDisabled?.(row)}
                        onChange={() => toggleRow(key)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((col) =>
                  {
                      const content = col.cell
                          ? col.cell(row, i)
                          : col.accessor
                              ? String(col.accessor(row))
                              : null;
                      return (
                      <td
                        key={col.key}
                        className={cn(
                            'px-3 py-3 text-foreground sm:px-4',
                            alignClass[col.align ?? 'start'],
                            col.hideBelow && hideClass[col.hideBelow],
                            col.className
                        )}
                      >
                        {content}
                      </td>
                      );
                  })}
                </tr>
                    );
                })
            )}
          </tbody>
        </table>
      </div>

      {paginated && !loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className={cn('h-4 w-4', rtl && 'rotate-180')} aria-hidden />
            </button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={current >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className={cn('h-4 w-4', rtl && 'rotate-180')} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
    );
}
