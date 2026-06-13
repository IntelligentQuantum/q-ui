import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import {
    Crown,
    DollarSign,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    Users,
    Wallet
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import Sparkline from '@/components/viz/Sparkline';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    SearchInput,
    Spinner,
    StatCard,
    Table,
    cn
} from '@/components/ui';
import type { Column } from '@/components/ui';

interface PeriodStat {
  amount: number;
  count: number;
}

interface DailyPoint {
  date: string;
  revenue: number;
  spend: number;
}

interface ResellerStat {
  userId: number;
  username: string;
  spend: number;
  clients: number;
}

interface IncomeReport {
  revenue: Record<string, PeriodStat>;
  spend: Record<string, PeriodStat>;
  newClients: Record<string, number>;
  daily: DailyPoint[];
  topResellers: ResellerStat[] | null;
  pendingCount: number;
  totalUsers: number;
  totalClients: number;
  outstanding: number;
}

// Period slugs in the order the backend reports them. Each maps to a localized
// label and feeds the breakdown table rows.
const PERIOD_KEYS = ['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth', 'thisYear', 'allTime'] as const;
type PeriodKey = (typeof PERIOD_KEYS)[number];

interface PeriodRow {
  key: PeriodKey;
  revenue: number;
  payments: number;
  spend: number;
  newClients: number;
}

async function fetchReport(): Promise<IncomeReport>
{
    const msg = await HttpUtil.get('/panel/api/admin/reports/income', undefined, { silent: true });
    if (!msg?.success || !msg.obj)
    {
        throw new Error(msg?.msg || 'Failed to load report');
    }
    return msg.obj as IncomeReport;
}

export default function ReportsPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { format: formatMoney, formatNumber, unit } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const reportQuery = useQuery({ queryKey: ['admin', 'income-report'], queryFn: fetchReport });
    const report = reportQuery.data;
    const fetched = reportQuery.data !== undefined || reportQuery.isError;
    const fetchError = reportQuery.error ? (reportQuery.error as Error).message : '';

    const periodRows = useMemo<PeriodRow[]>(() =>
    {
        if (!report)
        {
            return [];
        }
        return PERIOD_KEYS.map((key) => ({
            key,
            revenue: report.revenue[key]?.amount ?? 0,
            payments: report.revenue[key]?.count ?? 0,
            spend: report.spend[key]?.amount ?? 0,
            newClients: report.newClients[key] ?? 0
        }));
    }, [report]);

    const [periodQ, setPeriodQ] = useState('');
    const [resellerQ, setResellerQ] = useState('');

    const filteredPeriodRows = useMemo(() =>
    {
        const s = periodQ.trim().toLowerCase();
        if (!s)
        {
            return periodRows;
        }
        return periodRows.filter((row) => t(`pages.reports.periods.${ row.key }`).toLowerCase().includes(s));
    }, [periodRows, periodQ, t]);

    const filteredResellers = useMemo(() =>
    {
        const list = report?.topResellers ?? [];
        const s = resellerQ.trim().toLowerCase();
        if (!s)
        {
            return list;
        }
        return list.filter((row) => (row.username || '').toLowerCase().includes(s));
    }, [report, resellerQ]);

    const daily = useMemo(() => report?.daily ?? [], [report]);
    const revenueSeries = useMemo(() => daily.map((d) => d.revenue), [daily]);
    const spendSeries = useMemo(() => daily.map((d) => d.spend), [daily]);
    const dayLabels = useMemo(() => daily.map((d) => d.date.slice(5)), [daily]);

    const periodColumns: Column<PeriodRow>[] = [
        {
            key: 'key',
            header: t('pages.reports.period'),
            cell: (row) => <strong>{t(`pages.reports.periods.${ row.key }`)}</strong>
        },
        {
            key: 'revenue',
            header: t('pages.reports.revenue'),
            align: 'end',
            cell: (row) => <span className="text-success">{formatMoney(row.revenue)}</span>
        },
        {
            key: 'payments',
            header: t('pages.reports.payments'),
            align: 'end',
            className: 'hidden sm:table-cell',
            cell: (row) => formatNumber(row.payments)
        },
        {
            key: 'spend',
            header: t('pages.reports.spend'),
            align: 'end',
            cell: (row) => formatMoney(row.spend)
        },
        {
            key: 'newClients',
            header: t('pages.reports.newClients'),
            align: 'end',
            className: 'hidden md:table-cell',
            cell: (row) => formatNumber(row.newClients)
        }
    ];

    const resellerColumns: Column<ResellerStat>[] = [
        {
            key: 'username',
            header: t('username'),
            cell: (row) =>
                row.username ? (
          <Badge variant="primary">{row.username}</Badge>
                ) : (
          <span className="opacity-50">—</span>
                )
        },
        {
            key: 'spend',
            header: t('pages.reports.spend'),
            align: 'end',
            cell: (row) => <strong>{formatMoney(row.spend)}</strong>
        },
        {
            key: 'clients',
            header: t('clients'),
            align: 'end',
            className: 'hidden sm:table-cell',
            cell: (row) => formatNumber(row.clients)
        }
    ];

    const pageClass = useMemo(() => `reports-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    const allTimeRevenue = report?.revenue.allTime?.amount ?? 0;
    const monthRevenue = report?.revenue.thisMonth?.amount ?? 0;

    const hasActivity = revenueSeries.some((v) => v > 0) || spendSeries.some((v) => v > 0);

    return (
    <PageShell name={pageClass}>
            {!fetched ? (
              <div className="grid min-h-[40vh] place-items-center">
                <Spinner className="h-8 w-8 text-muted-foreground" />
              </div>
            ) : fetchError ? (
              <Card className="mx-auto max-w-md">
                <CardContent className="flex flex-col items-center gap-3 p-8 pt-8 text-center">
                  <TrendingDown className="h-8 w-8 text-danger" aria-hidden />
                  <div className="text-base font-semibold">{t('somethingWentWrong')}</div>
                  <p className="text-sm text-muted-foreground">{fetchError}</p>
                  <Button onClick={() => reportQuery.refetch()}>{t('refresh')}</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3 sm:gap-4">
                {/* Summary metrics */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <StatCard
                    icon={<DollarSign className="h-5 w-5" aria-hidden />}
                    label={t('pages.reports.totalIncome')}
                    value={<>{formatNumber(allTimeRevenue)} <span className="text-base font-medium text-muted-foreground">{unit}</span></>}
                  />
                  <StatCard
                    icon={<TrendingUp className="h-5 w-5" aria-hidden />}
                    label={t('pages.reports.periods.thisMonth')}
                    value={<>{formatNumber(monthRevenue)} <span className="text-base font-medium text-muted-foreground">{unit}</span></>}
                  />
                  <StatCard
                    icon={<Wallet className="h-5 w-5" aria-hidden />}
                    label={t('pages.reports.outstanding')}
                    value={<>{formatNumber(report?.outstanding ?? 0)} <span className="text-base font-medium text-muted-foreground">{unit}</span></>}
                  />
                  <StatCard
                    icon={<Users className="h-5 w-5" aria-hidden />}
                    label={t('pages.users.totalUsers')}
                    value={formatNumber(report?.totalUsers ?? 0)}
                  />
                  <StatCard
                    icon={<Crown className="h-5 w-5" aria-hidden />}
                    label={t('pages.reports.totalClients')}
                    value={formatNumber(report?.totalClients ?? 0)}
                  />
                  <StatCard
                    icon={<TrendingDown className="h-5 w-5" aria-hidden />}
                    label={t('pages.reports.pending')}
                    value={formatNumber(report?.pendingCount ?? 0)}
                  />
                </div>

                {/* Daily chart */}
                <Card>
                  <div className="flex items-center justify-between gap-2 p-4 sm:p-5">
                    <CardTitle>{t('pages.reports.dailyTitle')}</CardTitle>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={reportQuery.isFetching}
                      onClick={() => reportQuery.refetch()}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">{t('refresh')}</span>
                    </Button>
                  </div>
                  <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                    {hasActivity ? (
                      <Sparkline
                        data={revenueSeries}
                        data2={spendSeries}
                        labels={dayLabels}
                        name1={t('pages.reports.revenue')}
                        name2={t('pages.reports.spend')}
                        height={260}
                        showAxes
                        showTooltip
                        valueMax={null}
                        yFormatter={(v) => formatNumber(v)}
                        tooltipFormatter={(v) => formatMoney(v)}
                        strokeWidth={2}
                      />
                    ) : (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        {t('pages.reports.noActivity')}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Breakdown + top resellers */}
                <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[7fr_5fr]">
                  <Card>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-5">
                      <CardTitle>{t('pages.reports.breakdownTitle')}</CardTitle>
                      <SearchInput
                        className="w-full sm:w-52"
                        aria-label={t('search')}
                        placeholder={t('search')}
                        value={periodQ}
                        onChange={(e) => setPeriodQ(e.target.value)}
                      />
                    </CardHeader>
                    <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                      <Table<PeriodRow>
                        columns={periodColumns}
                        data={filteredPeriodRows}
                        rowKey={(row) => row.key}
                        pageSize={15}
                        empty={
                          <div className="py-6 text-center text-muted-foreground">{t('noData')}</div>
                        }
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-5">
                      <CardTitle>{t('pages.reports.topResellersTitle')}</CardTitle>
                      <SearchInput
                        className="w-full sm:w-52"
                        aria-label={t('search')}
                        placeholder={t('search')}
                        value={resellerQ}
                        onChange={(e) => setResellerQ(e.target.value)}
                      />
                    </CardHeader>
                    <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                      <Table<ResellerStat>
                        columns={resellerColumns}
                        data={filteredResellers}
                        rowKey={(row) => String(row.userId)}
                        pageSize={15}
                        empty={
                          <div className={cn('flex flex-col items-center gap-2 py-6 text-muted-foreground')}>
                            <Crown className="h-7 w-7 opacity-50" aria-hidden />
                            <span>{t('pages.reports.noResellers')}</span>
                          </div>
                        }
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
    </PageShell>
    );
}
