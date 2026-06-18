import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { inputClasses } from './Input';
import { ChevronDownIcon, CheckIcon } from './icons';

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: ReactNode;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

/**
 * Custom listbox select (no native <select>, no Radix). Keyboard: ↑/↓ to move,
 * Enter/Space to choose, Esc to close, type nothing fancy. Closes on outside
 * click. Token-only, RTL-safe. The popup is PORTALLED to <body> with fixed
 * positioning so it is never clipped by (or stacked under) a scrollable Modal
 * body — it always floats above, at popover z-index.
 */
export function Select({
    value,
    onChange,
    options,
    placeholder = 'Select…',
    disabled,
    id,
    className,
    'aria-label': ariaLabel,
    'aria-invalid': ariaInvalid
}: SelectProps)
{
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLUListElement>(null);
    const listId = useId();
    const selected = options.find((o) => o.value === value) ?? null;

    // Position the portalled menu under the trigger using viewport coordinates,
    // and keep it aligned on scroll/resize while open.
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
            if (r)
            {
                setMenuPos({ top: r.bottom + 6, left: r.left, width: r.width });
            }
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
        setActive(options.findIndex((o) => o.value === value));
        const onDoc = (e: MouseEvent) =>
        {
            const target = e.target as Node;
            // The menu is portalled OUTSIDE rootRef, so check it explicitly.
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target))
            {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open, options, value]);

    const move = (dir: 1 | -1) =>
    {
        setActive((prev) =>
        {
            let i = prev;
            for (let n = 0; n < options.length; n++)
            {
                i = (i + dir + options.length) % options.length;
                if (!options[i]?.disabled)
                {
                    return i;
                }
            }
            return prev;
        });
    };

    const choose = (i: number) =>
    {
        const opt = options[i];
        if (!opt || opt.disabled)
        {
            return;
        }
        onChange(opt.value);
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) =>
    {
        if (disabled)
        {
            return;
        }
        if (!open)
        {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')
            {
                e.preventDefault();
                setOpen(true);
            }
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
            case 'Enter':
            case ' ':
                e.preventDefault();
                choose(active);
                break;
            case 'Escape':
                e.preventDefault();
                setOpen(false);
                break;
            case 'Tab':
                setOpen(false);
                break;
        }
    };

    return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
            inputClasses,
            'items-center justify-between gap-2 text-start',
            // Show a focused look while the listbox is open.
            open && 'border-ring ring-2 ring-ring/35'
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDownIcon
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && menuPos && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          id={listId}
          tabIndex={-1}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          className="z-[var(--z-popover)] max-h-60 overflow-auto rounded-lg border border-border bg-surface-raised p-1.5 shadow-lg motion-safe:animate-[fade-in_120ms_ease-out]"
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) =>
              {
                  e.preventDefault();
                  choose(i);
              }}
              className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground',
                  opt.disabled && 'cursor-not-allowed opacity-50',
                  i === active && !opt.disabled && 'bg-foreground/8'
              )}
            >
              <CheckIcon
                className={cn('h-3.5 w-3.5 shrink-0 text-accent', opt.value === value ? 'opacity-100' : 'opacity-0')}
                aria-hidden
              />
              <span className="truncate">{opt.label}</span>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
    );
}
