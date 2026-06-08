import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { message } from '@/components/ui/message';
import { CircleCheck, Info, Receipt, Wallet } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe, ME_QUERY_KEY } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil, IntlUtil } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Alert,
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    StatCard,
    Table,
    cn
} from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;
const QUICK_AMOUNTS = [50000, 100000, 200000, 500000];

interface Payment {
  id: number;
  amount: number;
  status: string;
  refId: string;
  gateway: string;
  createdAt: number;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
    paid: 'success',
    failed: 'danger'
};

async function fetchPayments(): Promise<Payment[]>
{
    const msg = await HttpUtil.get('/panel/api/billing/payments', undefined, { silent: true });
    if (!msg?.success)
    {
        return [];
    }
    return (msg.obj as Payment[]) ?? [];
}

// One compact metric tile inside the summary card.
export default function BillingPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { me } = useMe();
    const { format: formatMoney, formatNumber, unit, clientCostPerGB } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();

    const [amount, setAmount] = useState<number>(QUICK_AMOUNTS[1]);

    const paymentsQuery = useQuery({ queryKey: ['billing', 'payments'], queryFn: fetchPayments });

    const paidStats = useMemo(() =>
    {
        const rows = paymentsQuery.data ?? [];
        let totalPaid = 0;
        let count = 0;
        for (const p of rows)
        {
            if (p.status === 'paid')
            {
                totalPaid += p.amount || 0;
                count += 1;
            }
        }
        return { totalPaid, count };
    }, [paymentsQuery.data]);

    // Handle the redirect back from ZarinPal (?status=ok|cancelled|failed).
    useEffect(() =>
    {
        const status = searchParams.get('status');
        if (!status)
        {
            return;
        }
        const refId = searchParams.get('refId');
        if (status === 'ok')
        {
            messageApi.success(refId ? t('pages.billing.toasts.paidWithRef', { refId }) : t('pages.billing.toasts.paid'));
            queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] });
        }
        else if (status === 'cancelled')
        {
            messageApi.warning(t('pages.billing.toasts.cancelled'));
        }
        else
        {
            messageApi.error(t('pages.billing.toasts.failed'));
        }
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams, messageApi, t, queryClient]);

    const payMut = useMutation({
        mutationFn: (amt: number) =>
            HttpUtil.post('/panel/api/billing/zarinpal/request', { amount: amt }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            const url = (msg?.obj as { url?: string } | null)?.url;
            if (msg?.success && url)
            {
                window.location.href = url; // hand off to the ZarinPal gateway
            }
        }
    });

    function startPayment()
    {
        if (!amount || amount <= 0)
        {
            messageApi.error(t('pages.billing.toasts.invalidAmount'));
            return;
        }
        payMut.mutate(amount);
    }

    const columns: Column<Payment>[] = [
        {
            key: 'amount',
            header: t('pages.billing.amount'),
            cell: (row) => <strong>{formatMoney(row.amount)}</strong>
        },
        {
            key: 'status',
            header: t('pages.users.txType'),
            cell: (row) => (
        <Badge variant={STATUS_BADGE[row.status] ?? 'warning'}>
          {t(`pages.billing.status_${ row.status }`, { defaultValue: row.status })}
        </Badge>
            )
        },
        {
            key: 'refId',
            header: t('pages.billing.refId'),
            className: 'hidden md:table-cell',
            cell: (row) => row.refId
        },
        {
            key: 'createdAt',
            header: t('pages.users.txDate'),
            cell: (row) => IntlUtil.formatDate(row.createdAt)
        }
    ];

    const pageClass = useMemo(() => `billing-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    const disabled = !!me && !me.zarinpalEnable;

    return (
    <PageShell name={pageClass}>
            <div className="flex w-full flex-col gap-4">
              {/* Summary */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  icon={<Wallet className="h-5 w-5" aria-hidden />}
                  label={t('pages.billing.currentBalance')}
                  value={<>{formatNumber(me?.balance ?? 0)} <span className="text-base font-medium text-muted-foreground">{unit}</span></>}
                />
                <StatCard
                  icon={<CircleCheck className="h-5 w-5" aria-hidden />}
                  label={t('pages.billing.totalPaid')}
                  value={<>{formatNumber(paidStats.totalPaid)} <span className="text-base font-medium text-muted-foreground">{unit}</span></>}
                />
                <StatCard
                  icon={<Receipt className="h-5 w-5" aria-hidden />}
                  label={t('pages.billing.paymentsCount')}
                  value={formatNumber(paidStats.count)}
                />
              </div>
              {clientCostPerGB > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('pages.billing.perGbInfo', { price: formatMoney(clientCostPerGB) })}
                </p>
              )}

              {/* Top-up */}
              {disabled ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 p-8 pt-8 text-center">
                    <Info className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <div className="text-base font-semibold">{t('pages.billing.disabledTitle')}</div>
                    <p className="text-sm text-muted-foreground">{t('pages.billing.disabledDesc')}</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="p-4 sm:p-5">
                    <CardTitle>{t('pages.billing.topUpTitle')}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
                    <Alert variant="info">{t('pages.billing.topUpHint')}</Alert>

                    <div className="flex flex-wrap gap-2">
                      {QUICK_AMOUNTS.map((a) => (
                        <Button
                          key={a}
                          variant={amount === a ? 'primary' : 'secondary'}
                          onClick={() => setAmount(a)}
                        >
                          {formatNumber(a)}
                        </Button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="bill-amount">{t('pages.billing.amount')}</Label>
                        <div className="flex">
                          <Input
                            id="bill-amount"
                            inputMode="numeric"
                            className={cn('rounded-e-none')}
                            value={amount ? formatNumber(amount) : ''}
                            onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                          />
                          <span className="inline-flex items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </div>
                      <Button loading={payMut.isPending} onClick={startPayment} className="sm:w-auto">
                        {t('pages.billing.payWithZarinpal')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* History */}
              <Card>
                <CardHeader className="p-4 sm:p-5">
                  <CardTitle>{t('pages.billing.history')}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                  <Table<Payment>
                    columns={columns}
                    data={paymentsQuery.data ?? []}
                    rowKey={(row) => String(row.id)}
                    loading={paymentsQuery.isFetching}
                    pageSize={10}
                  />
                </CardContent>
              </Card>
            </div>
    </PageShell>
    );
}
