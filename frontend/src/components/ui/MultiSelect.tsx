import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { ChevronDownIcon, CheckIcon, XIcon } from './icons';

export interface MultiSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface MultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: ReactNode;
  disabled?: boolean;
  /** Show an inline filter box (matches antd optionFilterProp="label"). */
  searchable?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

/**
 * Multi-select listbox (replaces antd `<Select mode="multiple">`). Selected
 * values render as removable chips inside an input-styled box; the dropdown
 * lists options with a check toggle. Token-only, RTL-safe, hand-built. The
 * popup is PORTALLED to <body> with fixed positioning so it floats above a
 * scrollable Modal body instead of being clipped inside it.
 */
export function MultiSelect({
    value,
    onChange,
    options,
    placeholder = 'Select…',
    disabled,
    searchable = true,
    id,
    className,
    'aria-label': ariaLabel,
    'aria-invalid': ariaInvalid
}: MultiSelectProps)
{
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(-1);
    const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLUListElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    const selectedSet = useMemo(() => new Set(value), [value]);
    const selectedOptions = useMemo(
        () => value.map((v) => options.find((o) => o.value === v)).filter(Boolean) as MultiSelectOption[],
        [value, options]
    );

    const filtered = useMemo(() =>
    {
        const q = query.trim().toLowerCase();
        if (!q)
        {
            return options;
        }
        return options.filter((o) => (typeof o.label === 'string' ? o.label.toLowerCase().includes(q) : true));
    }, [options, query]);

    // Position the portalled menu under the trigger; realign on scroll/resize.
    useLayoutEffect(() =>
    {
        if (!open)
        {
            setMenuPos(null);
            return;
        }
        const place = () =>
        {
            const r = rootRef.current?.getBoundingClientRect();
            if (!r)
            {
                return;
            }
            // Auto-flip above when the viewport is cramped below, and clamp the
            // height to the room available so the list always scrolls into view.
            const gap = 6;
            const cap = 288;
            const vh = window.innerHeight;
            const spaceBelow = vh - r.bottom - gap;
            const spaceAbove = r.top - gap;
            const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
            const avail = Math.max(0, openUp ? spaceAbove : spaceBelow);
            const maxHeight = Math.min(cap, Math.max(96, avail));
            setMenuPos({
                top: openUp ? undefined : r.bottom + gap,
                bottom: openUp ? vh - r.top + gap : undefined,
                left: r.left,
                width: r.width,
                maxHeight
            });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () =>
        {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        setActive(0);
        const onDoc = (e: MouseEvent) =>
        {
            const target = e.target as Node;
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target))
            {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const toggle = (val: string) =>
    {
        if (selectedSet.has(val))
        {
            onChange(value.filter((v) => v !== val));
        }
        else
        {
            onChange([...value, val]);
        }
    };

    const move = (dir: 1 | -1) =>
    {
        setActive((prev) =>
        {
            let i = prev;
            for (let n = 0; n < filtered.length; n++)
            {
                i = (i + dir + filtered.length) % filtered.length;
                if (!filtered[i]?.disabled)
                {
                    return i;
                }
            }
            return prev;
        });
    };

    const onKeyDown = (e: React.KeyboardEvent) =>
    {
        if (disabled)
        {
            return;
        }
        if (!open && (e.key === 'ArrowDown' || e.key === 'Enter'))
        {
            e.preventDefault();
            setOpen(true);
            return;
        }
        switch (e.key)
        {
            case 'ArrowDown':
                e.preventDefault();
                move(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                move(-1);
                break;
            case 'Enter': {
                e.preventDefault();
                const opt = filtered[active];
                if (opt && !opt.disabled)
                {
                    toggle(opt.value);
                }
                break;
            }
            case 'Backspace':
                if (query === '' && value.length > 0)
                {
                    onChange(value.slice(0, -1));
                }
                break;
            case 'Escape':
                e.preventDefault();
                setOpen(false);
                setQuery('');
                break;
        }
    };

    return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={ariaInvalid}
        onClick={() =>
        {
            if (disabled)
            {
                return;
            }
            setOpen(true);
            inputRef.current?.focus();
        }}
        className={cn(
            'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 text-sm',
            'transition-[color,border-color] duration-150',
            open ? 'border-ring ring-2 ring-ring/35' : 'border-border',
            disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {selectedOptions.map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-foreground"
          >
            <span className="truncate">{opt.label}</span>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Remove"
              onMouseDown={(e) =>
              {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle(opt.value);
              }}
              className="grid h-3.5 w-3.5 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          aria-label={ariaLabel}
          value={query}
          readOnly={!searchable}
          onChange={(e) =>
          {
              setQuery(e.target.value);
              if (!open)
              {
                  setOpen(true);
              }
          }}
          onKeyDown={onKeyDown}
          placeholder={selectedOptions.length === 0 ? (typeof placeholder === 'string' ? placeholder : undefined) : undefined}
          className="min-w-[3rem] flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        <ChevronDownIcon
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')}
          aria-hidden
        />
      </div>

      {open && menuPos && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          id={listId}
          aria-multiselectable
          tabIndex={-1}
          style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
          className="z-[var(--z-popover)] overflow-auto rounded-lg border border-border bg-surface-raised p-1.5 shadow-lg motion-safe:animate-[fade-in_120ms_ease-out]"
        >
          {filtered.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">—</li>
          )}
          {filtered.map((opt, i) =>
          {
              const checked = selectedSet.has(opt.value);
              return (
              <li
                key={opt.value}
                role="option"
                aria-selected={checked}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) =>
                {
                    e.preventDefault();
                    if (!opt.disabled)
                    {
                        toggle(opt.value);
                    }
                }}
                className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground',
                    opt.disabled && 'cursor-not-allowed opacity-50',
                    i === active && !opt.disabled && 'bg-foreground/8'
                )}
              >
                <span
                  className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center rounded border',
                      checked ? 'border-accent bg-accent text-accent-foreground' : 'border-border'
                  )}
                >
                  {checked && <CheckIcon className="h-3 w-3" aria-hidden />}
                </span>
                <span className="truncate">{opt.label}</span>
              </li>
              );
          })}
        </ul>,
        document.body
      )}
    </div>
    );
}
