import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck } from 'lucide-react';

import { HttpUtil, IntlUtil } from '@/utils';
import { Spinner, cn } from '@/components/ui';

interface Notification {
  id: number;
  title: string;
  body: string;
  params: string;
  level: 'info' | 'success' | 'warning' | 'error';
  link: string;
  read: boolean;
  createdAt: number;
}

const LEVEL_DOT: Record<string, string> = {
    info: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-danger'
};

function parseParams(raw: string): Record<string, unknown>
{
    if (!raw)
    {
        return {};
    }
    try
    {
        return JSON.parse(raw) as Record<string, unknown>;
    }
    catch
    {
        return {};
    }
}

/**
 * NotificationBell renders the navbar bell + unread badge and an accessible
 * notifications panel: a full-width sheet under the navbar on mobile, an anchored
 * dropdown on sm+. Stored title/body are i18n keys with a params map, so each
 * notification renders in the active UI language. Polls the unread count every
 * 30s; loads the list when opened.
 */
export default function NotificationBell({ className }: { className?: string })
{
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [limit, setLimit] = useState(30);
    const rootRef = useRef<HTMLDivElement>(null);

    const countQuery = useQuery({
        queryKey: ['notifications', 'count'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/notifications/unread-count', undefined, { silent: true });
            return msg?.success ? Number((msg.obj as { count?: number })?.count ?? 0) : 0;
        },
        refetchInterval: 30_000,
        refetchOnWindowFocus: true
    });

    const listQuery = useQuery({
        queryKey: ['notifications', 'list', limit],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get(`/panel/api/notifications?limit=${ limit }`, undefined, { silent: true });
            return msg?.success ? ((msg.obj as Notification[]) ?? []) : [];
        },
        enabled: open
    });

    const invalidate = () =>
    {
        queryClient.invalidateQueries({ queryKey: ['notifications', 'count'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    };

    const markRead = useMutation({
        mutationFn: (id: number) => HttpUtil.post(`/panel/api/notifications/${ id }/read`, {}, { silent: true }),
        onSuccess: invalidate
    });
    const markAll = useMutation({
        mutationFn: () => HttpUtil.post('/panel/api/notifications/read-all', {}, { silent: true }),
        onSuccess: invalidate
    });

    // Close on outside click (sm+ dropdown) and on Escape.
    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const onDoc = (e: MouseEvent) =>
        {
            if (!rootRef.current?.contains(e.target as Node))
            {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () =>
        {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const count = countQuery.data ?? 0;
    const items = listQuery.data ?? [];

    function onItemClick(n: Notification)
    {
        if (!n.read)
        {
            markRead.mutate(n.id);
        }
        if (n.link)
        {
            setOpen(false);
            navigate(n.link);
        }
    }

    return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('notifications.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-surface">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop — dims the page behind the sheet. */}
          <div
            className="fixed inset-0 z-[var(--z-popover)] bg-black/40 motion-safe:animate-[fade-in_120ms_ease-out] sm:hidden"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label={t('notifications.title')}
            className={cn(
                'z-[var(--z-popover)] flex flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl motion-safe:animate-[fade-in_120ms_ease-out]',
                // Mobile: fixed sheet under the navbar, full width with side gutters.
                'fixed inset-x-3 top-[3.75rem] max-h-[min(70vh,32rem)]',
                // sm+: anchored dropdown under the bell.
                'sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-[32rem]'
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">{t('notifications.title')}</span>
              {count > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => markAll.mutate()}
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden /> {t('notifications.markAllRead')}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-muted-foreground">
                  <BellOff className="h-8 w-8 opacity-50" aria-hidden />
                  <span className="text-sm">{t('notifications.empty')}</span>
                </div>
              ) : (
                <>
                <ul className="divide-y divide-border">
                  {items.map((n) =>
                  {
                      const params = parseParams(n.params);
                      return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:bg-foreground/[0.04]',
                            !n.read && 'bg-accent-subtle/40'
                        )}
                        onClick={() => onItemClick(n)}
                      >
                        <span
                          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent ring-1 ring-border' : LEVEL_DOT[n.level] ?? 'bg-accent')}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{t(n.title, { ...params, defaultValue: n.title })}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{t(n.body, { ...params, defaultValue: n.body })}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground/80">{IntlUtil.formatDate(n.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                      );
                  })}
                </ul>
                {items.length >= limit && limit < 200 && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 border-t border-border px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setLimit((l) => Math.min(200, l + 30))}
                  >
                    {listQuery.isFetching ? <Spinner className="h-4 w-4" /> : t('notifications.loadMore')}
                  </button>
                )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    );
}
