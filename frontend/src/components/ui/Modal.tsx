import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { XIcon } from './icons';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Hide the default header close (×) button. */
  hideClose?: boolean;
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  className?: string;
}

/**
 * Accessible dialog: rendered in a portal, with focus trapping, Esc-to-close,
 * background scroll-lock, focus restore on close, and role/aria wiring. Token-
 * only, RTL-safe (logical insets). No Radix/Headless — hand-built per the
 * styling constraint.
 */
export function Modal({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md',
    hideClose = false,
    closeOnOverlay = true,
    closeOnEsc = true,
    className
}: ModalProps)
{
    const panelRef = useRef<HTMLDivElement>(null);
    const restoreRef = useRef<HTMLElement | null>(null);
    const labelId = useId();
    const descId = useId();

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) =>
        {
            if (e.key === 'Escape' && closeOnEsc)
            {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== 'Tab')
            {
                return;
            }
            const panel = panelRef.current;
            if (!panel)
            {
                return;
            }
            const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
                (el) => el.offsetParent !== null || el === document.activeElement
            );
            if (nodes.length === 0)
            {
                e.preventDefault();
                panel.focus();
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey && (active === first || active === panel))
            {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && active === last)
            {
                e.preventDefault();
                first.focus();
            }
        },
        [closeOnEsc, onClose]
    );

    // Scroll-lock + focus management while open.
    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        restoreRef.current = document.activeElement as HTMLElement | null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus the first focusable element, or the panel itself.
        const panel = panelRef.current;
        const target = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
        target?.focus();

        return () =>
        {
            document.body.style.overflow = prevOverflow;
            restoreRef.current?.focus?.();
        };
    }, [open]);

    if (!open)
    {
        return null;
    }

    return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        aria-hidden
        onClick={closeOnOverlay ? onClose : undefined}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] motion-safe:animate-[fade-in_120ms_ease-out]"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
            'relative z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-lg border border-border bg-surface-raised text-foreground shadow-lg outline-none',
            'motion-safe:animate-[modal-in_150ms_var(--ease-out)]',
            sizeClasses[size],
            className
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start gap-4 border-b border-border p-5">
            <div className="flex min-w-0 flex-col gap-1">
              {title && (
                <h2 id={labelId} className="text-base font-semibold leading-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-me-1 ms-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {children != null && <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>}

        {footer != null && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
    );
}
