import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { Button, Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui';

interface Cashflow {
  from: number; to: number; income: number; productSales: number; bonuses: number;
  refunds: number; net: number; deposits: number; orders: number;
}

const PRESETS: { key: string; days: number }[] = [
    { key: 'today', days: 0 },
    { key: 'd7', days: 7 },
    { key: 'd30', days: 30 },
    { key: 'd90', days: 90 }
];

function startOfDay(daysAgo: number): number
{
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
}

function exportUrl(path: string): string
{
    return `${ window.Q_UI_BASE_PATH || '/' }panel/api/finance/export/${ path }`.replace(/\/{2,}/g, '/');
}

export default function CashflowTab()
{
    const { t } = useTranslation();
    const { format: money, formatNumber } = useCurrency();
    const [preset, setPreset] = useState('d30');

    const from = useMemo(() =>
    {
        const p = PRESETS.find((x) => x.key === preset);
        return startOfDay(p ? p.days : 30);
    }, [preset]);

    const query = useQuery({
        queryKey: ['finance', 'cashflow', from],
        queryFn: async () =>
        {
            const m = await HttpUtil.get(`/panel/api/finance/cashflow?from=${ from }`, undefined, { silent: true });
            return m?.success ? (m.obj as Cashflow) : null;
        }
    });
    const cf = query.data;

    return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.key} variant={preset === p.key ? 'primary' : 'secondary'} size="sm" onClick={() => setPreset(p.key)}>
                {t(`pages.finance.range_${ p.key }`)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={exportUrl('transactions')} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-foreground/[0.04]">
              <Download className="h-4 w-4" aria-hidden /> {t('pages.finance.exportTransactions')}
            </a>
            <a href={exportUrl('orders')} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-foreground/[0.04]">
              <Download className="h-4 w-4" aria-hidden /> {t('pages.finance.exportOrders')}
            </a>
            <a href={exportUrl('users')} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-foreground/[0.04]">
              <Download className="h-4 w-4" aria-hidden /> {t('pages.finance.exportUsers')}
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('pages.finance.income')} value={<span className="text-lg">{money(cf?.income ?? 0)}</span>} />
        <StatCard label={t('pages.finance.productSales')} value={<span className="text-lg">{money(cf?.productSales ?? 0)}</span>} />
        <StatCard label={t('pages.finance.bonuses')} value={<span className="text-lg">{money(cf?.bonuses ?? 0)}</span>} />
        <StatCard label={t('pages.finance.refunds')} value={<span className="text-lg">{money(cf?.refunds ?? 0)}</span>} />
        <StatCard label={t('pages.finance.netProfit')} value={<span className="text-lg">{money(cf?.net ?? 0)}</span>} />
        <StatCard label={t('pages.finance.depositsCount')} value={formatNumber(cf?.deposits ?? 0)} />
        <StatCard label={t('pages.finance.ordersCount')} value={formatNumber(cf?.orders ?? 0)} />
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-5"><CardTitle>{t('pages.finance.cashflowNote')}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 text-sm text-muted-foreground sm:p-5 sm:pt-0">
          {t('pages.finance.cashflowExplain')}
        </CardContent>
      </Card>
    </div>
    );
}
