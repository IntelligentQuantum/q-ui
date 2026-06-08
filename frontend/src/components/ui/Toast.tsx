import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleX, TriangleAlert, Info, LoaderCircle, X } from 'lucide-react';
import { cn } from './cn';

// Token-only toast system (replaces AntD `message`). A single module-level
// store feeds one globally-mounted <Toaster/>, so any caller — components via
// the `message` shim, or non-component code via getMessage() — renders into the
// same themed, RTL-safe stack. Hand-built per the Tailwind-only constraint.

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastItem {
  id: number;
  type: ToastType;
  content: ReactNode;
  /** Seconds before auto-dismiss; 0 keeps it until dismissed. */
  duration: number;
  onClose?: () => void;
}

let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let seq = 0;

function emit()
{
    for (const listener of listeners)
    {
        listener(items);
    }
}

export function dismissToast(id: number)
{
    const item = items.find((t) => t.id === id);
    items = items.filter((t) => t.id !== id);
    const timer = timers.get(id);
    if (timer)
    {
        clearTimeout(timer);
        timers.delete(id);
    }
    emit();
    item?.onClose?.();
}

export function clearToasts()
{
    for (const timer of timers.values())
    {
        clearTimeout(timer);
    }
    timers.clear();
    items = [];
    emit();
}

/** Push a toast; returns a closer. duration defaults to 3s (0 = sticky). */
export function showToast(type: ToastType, content: ReactNode, duration = 3, onClose?: () => void): () => void
{
    const id = ++seq;
    items = [...items, { id, type, content, duration, onClose }];
    emit();
    if (duration > 0)
    {
        timers.set(
            id,
            setTimeout(() => dismissToast(id), duration * 1000)
        );
    }
    return () => dismissToast(id);
}

const ICONS: Record<ToastType, typeof Info> = {
    success: CircleCheck,
    error: CircleX,
    warning: TriangleAlert,
    info: Info,
    loading: LoaderCircle
};

const ICON_COLOR: Record<ToastType, string> = {
    success: 'text-success',
    error: 'text-danger',
    warning: 'text-warning',
    info: 'text-accent',
    loading: 'text-muted-foreground'
};

/** Mount once near the app root. Subscribes to the store and renders the stack. */
export function Toaster()
{
    const [list, setList] = useState<ToastItem[]>(items);
    useEffect(() =>
    {
        const listener = (next: ToastItem[]) => setList(next);
        listeners.add(listener);
        setList(items);
        return () =>
        {
            listeners.delete(listener);
        };
    }, []);

    if (list.length === 0)
    {
        return null;
    }

    return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[var(--z-toast)] flex flex-col items-center gap-2 px-4">
      {list.map((toast) =>
      {
          const Icon = ICONS[toast.type];
          return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5 text-sm text-foreground shadow-lg motion-safe:animate-[modal-in_150ms_var(--ease-out)]"
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_COLOR[toast.type], toast.type === 'loading' && 'animate-spin')} />
            <div className="min-w-0 flex-1 break-words">{toast.content}</div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Close"
              className="-me-1 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          );
      })}
    </div>,
    document.body
    );
}
