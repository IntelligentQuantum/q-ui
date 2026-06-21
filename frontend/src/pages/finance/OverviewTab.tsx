import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
    Banknote, CircleCheck, CircleDollarSign, Clock, Gift, Receipt, RotateCcw,
    ShieldCheck, ShoppingCart, TrendingUp, TriangleAlert, Users, Wallet
} from 'lucide-react';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useMe } from '@/hooks/useMe';
import { Alert, Card, CardContent, CardHeader, CardTitle, StatCard, Spinner } from '@/components/ui';
import Sparkline from '@/components/viz/Sparkline';

interface Dashboard {
  totalRevenue: number; todayRevenue: number; weekRevenue: number; monthRevenue: number; yearRevenue: number;
  grossRevenue: number; netRevenue: number; lifetimeRevenue: number;
  totalDeposits: number; totalWithdrawals: number; totalWalletBalance: number;
  pendingDeposits: number; approvedDeposits: number; rejectedDeposits: number;
  totalBonuses: number; totalReferralCommissions: number; totalRefunds: number;
  totalProductSales: number; productSalesCount: number;
  totalUsers: number; payingUsers: number; activeUsers: number; arpu: number; aov: number;
  totalSpend: number; totalClients: number; newClientsMonth: number;
}
interface DayPoint { date: string; revenue: number; deposits: number; orders: number; users: number; }
interface Segments {
  totalUsers: number; registeredNeverDeposited: number; depositedNeverPurchased: number;
  purchasedOnce: number; repeatBuyers: number; highValue: number; inactive90d: number;
  resellers: number; members: number; managers: number; admins: number;
}
interface Consistency {
  sumUserBalances: number; ledgerNet: number; difference: number; balanced: boolean;
  negativeBalances: number; duplicateTracking: number; orphanedOrders: number;
}

function compact(v: number): string
{
    if (Math.abs(v) >= 1_000_000)
    {
        return `${ (v / 1_000_000).toFixed(1) }M`;
    }
    if (Math.abs(v) >= 1_000)
    {
        return `${ Math.round(v / 1_000) }k`;
    }
    return String(Math.round(v));
}

export default function OverviewTab()
{
    const { t } = useTranslation();
    const { format: money, formatNumber, unit } = useCurrency();

    const dash = useQuery({
        queryKey: ['finance', 'dashboard'],
        queryFn: async () =>
        {
            const m = await HttpUtil.get('/panel/api/finance/dashboard', undefined, { silent: true });
            return m?.success ? (m.obj as Dashboard) : null;
        }
    });
    const series = useQuery({
        queryKey: ['finance', 'timeseries', 30],
        queryFn: async () =>
        {
            const m = await HttpUtil.get('/panel/api/finance/timeseries?days=30', undefined, { silent: true });
            return m?.success ? ((m.obj as DayPoint[]) ?? []) : [];
        }
    });
    const segs = useQuery({
        queryKey: ['finance', 'segments'],
        queryFn: async () =>
        {
            const m = await HttpUtil.get('/panel/api/finance/segments', undefined, { silent: true });
            return m?.success ? (m.obj as Segments) : null;
        }
    });
    const cons = useQuery({
        queryKey: ['finance', 'consistency'],
        queryFn: async () =>
        {
            const m = await HttpUtil.get('/panel/api/finance/consistency', undefined, { silent: true });
            return m?.success ? (m.obj as Consistency) : null;
        }
    });

    const { me } = useMe();
    const points = series.data ?? [];
    const labels = useMemo(() => points.map((p) => p.date.slice(5)), [points]);
    const moneyAxis = (v: number) => compact(v);

    const d = dash.data;

    if (dash.isLoading)
    {
        return <div className="flex min-h-[30vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>;
    }

    const moneyCards = [
        { k: 'totalRevenue', label: t('pages.finance.totalRevenue'), v: d?.totalRevenue, icon: <CircleDollarSign className="h-5 w-5 text-success" aria-hidden /> },
        { k: 'today', label: t('pages.finance.today'), v: d?.todayRevenue, icon: <TrendingUp className="h-5 w-5" aria-hidden /> },
        { k: 'week', label: t('pages.finance.week'), v: d?.weekRevenue, icon: <TrendingUp className="h-5 w-5" aria-hidden /> },
        { k: 'month', label: t('pages.finance.month'), v: d?.monthRevenue, icon: <TrendingUp className="h-5 w-5" aria-hidden /> },
        { k: 'year', label: t('pages.finance.year'), v: d?.yearRevenue, icon: <TrendingUp className="h-5 w-5" aria-hidden /> },
        { k: 'net', label: t('pages.finance.netRevenue'), v: d?.netRevenue, icon: <CircleDollarSign className="h-5 w-5" aria-hidden /> },
        { k: 'deposits', label: t('pages.finance.totalDeposits'), v: d?.totalDeposits, icon: <Banknote className="h-5 w-5 text-accent" aria-hidden /> },
        { k: 'wallet', label: t('pages.finance.walletBalance'), v: d?.totalWalletBalance, icon: <Wallet className="h-5 w-5" aria-hidden /> },
        { k: 'bonus', label: t('pages.finance.bonuses'), v: d?.totalBonuses, icon: <Gift className="h-5 w-5 text-success" aria-hidden /> },
        { k: 'commission', label: t('pages.finance.referralCommissions'), v: d?.totalReferralCommissions, icon: <Receipt className="h-5 w-5" aria-hidden /> },
        { k: 'refunds', label: t('pages.finance.refunds'), v: d?.totalRefunds, icon: <RotateCcw className="h-5 w-5 text-warning" aria-hidden /> },
        { k: 'sales', label: t('pages.finance.productSales'), v: d?.totalProductSales, icon: <ShoppingCart className="h-5 w-5" aria-hidden /> },
        { k: 'spend', label: t('pages.finance.totalSpend'), v: d?.totalSpend, icon: <Banknote className="h-5 w-5 text-warning" aria-hidden /> }
    ];

    // Manager: surface the workspace TREASURY (the capital the workspace sells
    // from, from /me.workspaceBalance) — distinct from customer wallet balances.
    // Admin has no treasury so this is manager-only.
    if (me?.isManager)
    {
        moneyCards.unshift({
            k: 'treasury',
            label: t('pages.managers.workspaceBalance'),
            v: me.workspaceBalance,
            icon: <Wallet className="h-5 w-5 text-success" aria-hidden />
        });
    }

    const countCards = [
        { k: 'users', label: t('pages.finance.totalUsers'), v: d?.totalUsers, icon: <Users className="h-5 w-5" aria-hidden /> },
        { k: 'paying', label: t('pages.finance.payingUsers'), v: d?.payingUsers, icon: <Users className="h-5 w-5 text-success" aria-hidden /> },
        { k: 'active', label: t('pages.finance.activeUsers'), v: d?.activeUsers, icon: <Users className="h-5 w-5" aria-hidden /> },
        { k: 'arpu', label: t('pages.finance.arpu'), v: d?.arpu, money: true, icon: <CircleDollarSign className="h-5 w-5" aria-hidden /> },
        { k: 'aov', label: t('pages.finance.aov'), v: d?.aov, money: true, icon: <ShoppingCart className="h-5 w-5" aria-hidden /> },
        { k: 'pending', label: t('pages.finance.pendingDeposits'), v: d?.pendingDeposits, icon: <Clock className="h-5 w-5 text-warning" aria-hidden /> },
        { k: 'approved', label: t('pages.finance.approvedDeposits'), v: d?.approvedDeposits, icon: <CircleCheck className="h-5 w-5 text-success" aria-hidden /> },
        { k: 'rejected', label: t('pages.finance.rejectedDeposits'), v: d?.rejectedDeposits, icon: <TriangleAlert className="h-5 w-5 text-danger" aria-hidden /> },
        { k: 'clients', label: t('pages.finance.totalClients'), v: d?.totalClients, icon: <Users className="h-5 w-5" aria-hidden /> },
        { k: 'newClients', label: t('pages.finance.newClients'), v: d?.newClientsMonth, icon: <Users className="h-5 w-5 text-success" aria-hidden /> }
    ];

    const c = cons.data;
    const seg = segs.data;

    return (
    <div className="flex flex-col gap-4">
      {/* Consistency banner */}
      {c && (
        <Alert variant={c.balanced ? 'success' : 'warning'} title={c.balanced ? t('pages.finance.ledgerBalanced') : t('pages.finance.ledgerDrift')}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              {t('pages.finance.balances')}: <strong>{money(c.sumUserBalances)}</strong>
            </span>
            <span>{t('pages.finance.ledgerNet')}: <strong>{money(c.ledgerNet)}</strong></span>
            <span>{t('pages.finance.difference')}: <strong>{money(c.difference)}</strong></span>
            {c.negativeBalances > 0 && <span className="text-danger">{t('pages.finance.negativeBalances')}: {c.negativeBalances}</span>}
            {c.duplicateTracking > 0 && <span className="text-danger">{t('pages.finance.duplicateTracking')}: {c.duplicateTracking}</span>}
            {c.orphanedOrders > 0 && <span className="text-danger">{t('pages.finance.orphanedOrders')}: {c.orphanedOrders}</span>}
          </div>
        </Alert>
      )}

      {/* Money KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {moneyCards.map((card) => (
          <StatCard key={card.k} icon={card.icon} label={card.label}
            value={<span className="text-lg">{money(card.v ?? 0)}</span>} />
        ))}
      </div>

      {/* Count / ratio KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {countCards.map((card) => (
          <StatCard key={card.k} icon={card.icon} label={card.label}
            value={card.money ? <span className="text-lg">{money(card.v ?? 0)}</span> : formatNumber(card.v ?? 0)} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0"><CardTitle>{t('pages.finance.chartRevenue')} <span className="text-xs font-normal text-muted-foreground">({unit})</span></CardTitle></CardHeader>
          <CardContent className="p-2 sm:p-3">
            <Sparkline data={points.map((p) => p.revenue)} labels={labels} height={160} showAxes showTooltip valueMax={null}
              stroke="#22c55e" yFormatter={moneyAxis} tooltipFormatter={(v) => money(v)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0"><CardTitle>{t('pages.finance.chartDeposits')} <span className="text-xs font-normal text-muted-foreground">({unit})</span></CardTitle></CardHeader>
          <CardContent className="p-2 sm:p-3">
            <Sparkline data={points.map((p) => p.deposits)} labels={labels} height={160} showAxes showTooltip valueMax={null}
              stroke="#6366f1" yFormatter={moneyAxis} tooltipFormatter={(v) => money(v)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0"><CardTitle>{t('pages.finance.chartOrders')}</CardTitle></CardHeader>
          <CardContent className="p-2 sm:p-3">
            <Sparkline data={points.map((p) => p.orders)} labels={labels} height={160} showAxes showTooltip valueMax={null}
              stroke="#f59e0b" yFormatter={(v) => String(Math.round(v))} tooltipFormatter={(v) => String(Math.round(v))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0"><CardTitle>{t('pages.finance.chartUsers')}</CardTitle></CardHeader>
          <CardContent className="p-2 sm:p-3">
            <Sparkline data={points.map((p) => p.users)} labels={labels} height={160} showAxes showTooltip valueMax={null}
              stroke="#06b6d4" yFormatter={(v) => String(Math.round(v))} tooltipFormatter={(v) => String(Math.round(v))} />
          </CardContent>
        </Card>
      </div>

      {/* Segments */}
      {seg && (
        <Card>
          <CardHeader className="p-4 sm:p-5"><CardTitle>{t('pages.finance.segments')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-3 sm:p-5 sm:pt-0 lg:grid-cols-4">
            {([
                ['registeredNeverDeposited', seg.registeredNeverDeposited],
                ['depositedNeverPurchased', seg.depositedNeverPurchased],
                ['purchasedOnce', seg.purchasedOnce],
                ['repeatBuyers', seg.repeatBuyers],
                ['highValue', seg.highValue],
                ['inactive90d', seg.inactive90d],
                ['resellers', seg.resellers],
                ['members', seg.members]
            ] as [string, number][]).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
                <span className="text-xs text-muted-foreground">{t(`pages.finance.seg_${ k }`)}</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">{formatNumber(v)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
    );
}
