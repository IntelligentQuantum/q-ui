import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EllipsisVertical } from 'lucide-react';
import { cn } from './cn';

export type DropdownItem =
  | {
      type?: 'item';
      key: string;
      label: ReactNode;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      icon?: ReactNode;
    }
  | { type: 'separator'; key?: string };

export interface DropdownMenuProps {
  items: DropdownItem[];
  /** Content rendered inside the trigger button (NOT a button itself). Defaults to a ⋮ icon. */
  trigger?: ReactNode;
  align?: 'start' | 'end';
  /** Accessible name for the trigger / menu. */
  label?: string;
  className?: string;
}

/**
 * Accessible menu (no Radix). Click to open, outside-click / Esc to close,
 * ↑/↓/Home/End to move, Enter to activate; focus returns to the trigger on close.
 *
 * The menu is rendered in a PORTAL on document.body with fixed positioning
 * anchored to the trigger, so it is never clipped by a scroll/overflow ancestor
 * (e.g. a table). Position is recomputed on open, scroll and resize, flips above
 * when there's no room below, and clamps to the viewport. RTL is resolved from
 * the trigger's computed direction (logical start/end), so it's correct even when
 * a region's dir differs from the document.
 *
 * Highlighting uses a single `active` index + `aria-activedescendant` — exactly
 * one row is ever highlighted, and nothing until you hover or arrow.
 */
export function DropdownMenu({ items, trigger, align = 'end', label = 'Open menu', className }: DropdownMenuProps)
{
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const baseId = useId();
    const itemId = (i: number) => `${ baseId }-item-${ i }`;

    const reposition = useCallback(() =>
    {
        const t = triggerRef.current;
        if (!t)
        {
            return;
        }
        const r = t.getBoundingClientRect();
        const m = menuRef.current;
        const mw = m?.offsetWidth ?? 192;
        const mh = m?.offsetHeight ?? 0;
        const isRtl = getComputedStyle(t).direction === 'rtl';
        const alignEnd = align === 'end';
        // Map logical start/end to a physical left, respecting the trigger's dir.
        let left = alignEnd ? (isRtl ? r.left : r.right - mw) : isRtl ? r.right - mw : r.left;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        let top = r.bottom + 6;
        if (mh && top + mh > window.innerHeight - 8)
        {
            top = Math.max(8, r.top - mh - 6);
        } // flip above
        setCoords({ top, left });
    }, [align]);

    useLayoutEffect(() =>
    {
        if (open)
        {
            reposition();
        }
    }, [open, reposition]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        setActive(-1);
        requestAnimationFrame(() => menuRef.current?.focus());
        const onMove = () => reposition();
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        const onDoc = (e: MouseEvent) =>
        {
            const target = e.target as Node;
            if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target))
            {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () =>
        {
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
            document.removeEventListener('mousedown', onDoc);
        };
    }, [open, reposition]);

    const close = (returnFocus = true) =>
    {
        setOpen(false);
        setCoords(null);
        if (returnFocus)
        {
            triggerRef.current?.focus();
        }
    };

    const move = (dir: 1 | -1) =>
    {
        setActive((prev) =>
        {
            let i = prev;
            for (let n = 0; n < items.length; n++)
            {
                i = (i + dir + items.length) % items.length;
                const it = items[i];
                if (it.type !== 'separator' && !it.disabled)
                {
                    return i;
                }
            }
            return prev;
        });
    };

    const activate = (i: number) =>
    {
        const it = items[i];
        if (!it || it.type === 'separator' || it.disabled)
        {
            return;
        }
        it.onSelect?.();
        close();
    };

    const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) =>
    {
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
            case 'Home':
                e.preventDefault();
                setActive(-1);
                move(1);
                break;
            case 'End':
                e.preventDefault();
                setActive(-1);
                move(-1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (active >= 0)
                {
                    activate(active);
                }
                break;
            case 'Escape':
                e.preventDefault();
                close();
                break;
            case 'Tab':
                close(false);
                break;
        }
    };

    const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) =>
    {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')
        {
            e.preventDefault();
            setOpen(true);
        }
    };

    return (
    <div className={cn('inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? baseId : undefined}
        aria-label={trigger ? undefined : label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium outline-none',
            'transition-colors duration-150 hover:bg-surface-sunken hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            open ? 'bg-surface-sunken text-foreground' : 'text-muted-foreground',
            trigger ? 'h-9 px-3' : 'h-9 w-9'
        )}
      >
        {trigger ?? <EllipsisVertical className="h-4 w-4" aria-hidden />}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            id={baseId}
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={active >= 0 ? itemId(active) : undefined}
            onKeyDown={onMenuKeyDown}
            style={{
                position: 'fixed',
                top: coords?.top ?? -9999,
                left: coords?.left ?? -9999,
                visibility: coords ? 'visible' : 'hidden'
            }}
            className={cn(
                'z-[var(--z-dropdown)] flex min-w-[12rem] flex-col gap-0.5 rounded-lg border border-border',
                'bg-surface-raised p-1.5 shadow-lg outline-none motion-safe:animate-[fade-in_120ms_ease-out]'
            )}
          >
            {items.map((it, i) =>
            {
                if (it.type === 'separator')
                {
                    return <div key={it.key ?? `sep-${ i }`} role="separator" className="-mx-1.5 my-1 h-px bg-border" />;
                }
                const isActive = i === active;
                return (
                <div
                  key={it.key}
                  id={itemId(i)}
                  role="menuitem"
                  aria-disabled={it.disabled || undefined}
                  onMouseEnter={() => !it.disabled && setActive(i)}
                  onClick={() => activate(i)}
                  className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm select-none',
                      it.disabled
                          ? 'cursor-not-allowed opacity-50'
                          : it.danger
                              ? cn('cursor-pointer text-danger', isActive && 'bg-danger-subtle')
                              : cn('cursor-pointer text-foreground', isActive && 'bg-foreground/8')
                  )}
                >
                  {it.icon && <span className="grid h-4 w-4 shrink-0 place-items-center">{it.icon}</span>}
                  <span className="truncate">{it.label}</span>
                </div>
                );
            })}
          </div>,
          document.body
        )}
    </div>
    );
}
