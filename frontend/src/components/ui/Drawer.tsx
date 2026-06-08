import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { XIcon } from './icons';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Max panel width (it is full-width below this). Default 400. */
  width?: number | string;
  /** Side the panel docks to (logical — `end` = right in LTR). Default `end`. */
  side?: 'start' | 'end';
  closeOnOverlay?: boolean;
  className?: string;
}

/**
 * Side panel rendered in a portal, with overlay, Esc-to-close, scroll-lock and
 * role/aria wiring. Token-only, RTL-safe (logical insets/borders). Hand-built to
 * mirror Modal — used for filter/detail panels (replaces antd `<Drawer>`).
 */
export function Drawer({
    open,
    onClose,
    title,
    children,
    footer,
    width = 400,
    side = 'end',
    closeOnOverlay = true,
    className
}: DrawerProps)
{
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) =>
        {
            if (e.key === 'Escape')
            {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        panelRef.current?.focus();
        return () =>
        {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose]);

    if (!open)
    {
        return null;
    }

    return createPortal(
    <div className="fixed inset-0 z-[var(--z-drawer)]">
      <div
        aria-hidden
        onClick={closeOnOverlay ? onClose : undefined}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] motion-safe:animate-[fade-in_120ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ maxWidth: typeof width === 'number' ? `${ width }px` : width }}
        className={cn(
            'absolute inset-y-0 flex h-full w-full flex-col bg-surface-raised shadow-xl outline-none',
            side === 'end'
                ? 'end-0 border-s border-border motion-safe:animate-[drawer-in-end_220ms_var(--ease-out)]'
                : 'start-0 border-e border-border motion-safe:animate-[drawer-in_220ms_var(--ease-out)]',
            className
        )}
      >
        {title != null && (
          <div className="flex items-center justify-between gap-4 border-b border-border p-4">
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-me-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {children != null && <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>}
        {footer != null && <div className="border-t border-border p-4">{footer}</div>}
      </div>
    </div>,
    document.body
    );
}
