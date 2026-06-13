import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, Clock, Hourglass, Inbox, TriangleAlert, Zap } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { HttpUtil } from '@/utils';
import PageShell from '@/layouts/PageShell';
import { Card, CardContent, StatCard } from '@/components/ui';

interface Dashboard {
  open: number;
  waitingForStaff: number;
  waitingForUser: number;
  urgent: number;
  closedToday: number;
  overdue: number;
  avgResponseMs: number;
}

function humanizeDuration(ms: number, t: TFunction): string
{
    if (!ms || ms <= 0)
    {
        return '—';
    }
    const mins = Math.round(ms / 60000);
    if (mins < 60)
    {
        return t('pages.support.minutes', { n: mins });
    }
    const hrs = Math.round(mins / 60);
    if (hrs < 48)
    {
        return t('pages.support.hours', { n: hrs });
    }
    return t('pages.support.days', { n: Math.round(hrs / 24) });
}

export default function SupportDashboardPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const navigate = useNavigate();

    const query = useQuery({
        queryKey: ['tickets', 'dashboard'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/tickets/dashboard', undefined, { silent: true });
            return msg?.success ? (msg.obj as Dashboard) : null;
        },
        refetchInterval: 60_000
    });
    const d = query.data;

    const cards = [
        { key: 'open', filter: 'open', label: t('pages.support.open'), value: d?.open ?? 0, icon: <Inbox className="h-5 w-5" aria-hidden /> },
        { key: 'waitingForStaff', filter: 'unassigned', label: t('pages.support.waitingStaff'), value: d?.waitingForStaff ?? 0, icon: <Clock className="h-5 w-5 text-warning" aria-hidden /> },
        { key: 'waitingForUser', filter: '', label: t('pages.support.waitingUser'), value: d?.waitingForUser ?? 0, icon: <Hourglass className="h-5 w-5" aria-hidden /> },
        { key: 'urgent', filter: 'urgent', label: t('pages.support.urgent'), value: d?.urgent ?? 0, icon: <Zap className="h-5 w-5 text-danger" aria-hidden /> },
        { key: 'overdue', filter: '', label: t('pages.support.overdue'), value: d?.overdue ?? 0, icon: <TriangleAlert className="h-5 w-5 text-danger" aria-hidden /> },
        { key: 'closedToday', filter: 'closed', label: t('pages.support.closedToday'), value: d?.closedToday ?? 0, icon: <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> }
    ];

    return (
    <PageShell title={t('pages.support.title')} description={t('pages.support.subtitle')}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              className="text-start outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              onClick={() => navigate(c.filter ? `/tickets?filter=${ c.filter }` : '/tickets')}
            >
              <StatCard icon={c.icon} label={c.label} value={String(c.value)} />
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="flex items-center gap-3 p-4 sm:p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted-foreground">
              <AlarmClock className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <div className="text-xs text-muted-foreground">{t('pages.support.avgResponse')}</div>
              <div className="text-xl font-semibold text-foreground">{humanizeDuration(d?.avgResponseMs ?? 0, t)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
    );
}
