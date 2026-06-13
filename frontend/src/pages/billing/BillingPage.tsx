import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { message } from '@/components/ui/message';
import { Bitcoin, CircleCheck, Gift, Info, Receipt, Wallet } from 'lucide-react';
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
  currency: string;
  bonusAmount: number;
  status: string;
  refId: string;
  gateway: string;
  createdAt: number;
}

interface CryptoBucket {
  key: string;
  amount: number;
  bonus: number;
  count: number;
}

interface CryptoReport {
  totalDeposits: number;
  totalBonus: number;
  depositCount: number;
  byCurrency: CryptoBucket[];
  byRole: CryptoBucket[];
  recent: Payment[];
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

async function fetchCryptoReport(): Promise<CryptoReport | null>
{
    const msg = await HttpUtil.get('/panel/api/billing/crypto/report', undefined, { silent: true });
    if (!msg?.success)
    {
        return null;
    }
    return (msg.obj as CryptoReport) ?? null;
}

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
    const [cryptoAmount, setCryptoAmount] = useState<number>(QUICK_AMOUNTS[1]);

    const paymentsQuery = useQuery({ queryKey: ['billing', 'payments'], queryFn: fetchPayments });

    const zarinpalOn = !!me?.zarinpalEnable;
    const plisioOn = !!me?.plisioEnable;
    // The crypto deposit is entered in wallet credits (same unit as everything
    // else); we preview the fiat amount Plisio will actually charge at the rate.
    const fiatCurrency = me?.plisioSourceCurrency || 'USD';
    const cryptoRate = me?.cryptoExchangeRate && me.cryptoExchangeRate > 0 ? me.cryptoExchangeRate : 1;
    const cryptoFiat = cryptoAmount / cryptoRate;

    const reportQuery = useQuery({
        queryKey: ['billing', 'cryptoReport'],
        queryFn: fetchCryptoReport,
        enabled: !!me?.isAdmin
    });

    const paidStats = useMemo(() =>
    {
        const rows = paymentsQuery.data ?? [];
        let totalPaid = 0;
        let count = 0;
        for (const p of rows)
        {
            if (p.status === 'paid')
            {
                totalPaid += (p.amount || 0) + (p.bonusAmount || 0);
                count += 1;
            }
        }
        return { totalPaid, count };
    }, [paymentsQuery.data]);

    // Live bonus preview for the crypto deposit, mirroring the backend rule:
    // enabled + percent>0 + deposit clears the minimum, capped at the maximum.
    const bonusPreview = useMemo(() =>
    {
        if (!plisioOn || !me?.cryptoBonusEnabled || me.cryptoBonusPercent <= 0)
        {
            return null;
        }
        const eligible = me.cryptoBonusMinDeposit <= 0 || cryptoAmount >= me.cryptoBonusMinDeposit;
        let bonus = Math.floor((cryptoAmount * me.cryptoBonusPercent) / 100);
        if (me.cryptoBonusMax > 0)
        {
            bonus = Math.min(bonus, me.cryptoBonusMax);
        }
        return { eligible, bonus: eligible ? bonus : 0, total: cryptoAmount + (eligible ? bonus : 0), pct: me.cryptoBonusPercent };
    }, [plisioOn, me, cryptoAmount]);

    // Handle the redirect back from a gateway (?status=...).
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
        else if (status === 'crypto_pending')
        {
            messageApi.info(t('pages.billing.toasts.cryptoPending'));
            queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] });
        }
        else if (status === 'cancelled')
        {
            messageApi.warning(t('pages.billing.toasts.cancelled'));
        }
        else if (status === 'crypto_failed')
        {
            messageApi.error(t('pages.billing.toasts.cryptoFailed'));
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

    const cryptoMut = useMutation({
        mutationFn: (amt: number) =>
            HttpUtil.post('/panel/api/billing/plisio/request', { amount: amt }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            const url = (msg?.obj as { url?: string } | null)?.url;
            if (msg?.success && url)
            {
                window.location.href = url; // hand off to the Plisio invoice page
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

    function startCryptoPayment()
    {
        if (!cryptoAmount || cryptoAmount <= 0)
        {
            messageApi.error(t('pages.billing.toasts.invalidAmount'));
            return;
        }
        cryptoMut.mutate(cryptoAmount);
    }

    const columns: Column<Payment>[] = [
        {
            key: 'amount',
            header: t('pages.billing.amount'),
            cell: (row) => (
        <span className="flex flex-col">
          <strong>{formatMoney(row.amount)}</strong>
          {row.bonusAmount > 0 && (
            <span className="text-xs text-success">+{formatMoney(row.bonusAmount)} {t('pages.billing.bonus')}</span>
          )}
        </span>
            )
        },
        {
            key: 'gateway',
            header: t('pages.billing.gateway'),
            className: 'hidden sm:table-cell',
            cell: (row) => <span className="capitalize">{row.gateway}{row.currency ? ` · ${ row.currency }` : ''}</span>
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

    const noGateway = !!me && !zarinpalOn && !plisioOn;
    const report = reportQuery.data;

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
              {noGateway ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 p-8 pt-8 text-center">
                    <Info className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <div className="text-base font-semibold">{t('pages.billing.disabledTitle')}</div>
                    <p className="text-sm text-muted-foreground">{t('pages.billing.disabledDesc')}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {zarinpalOn && (
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

                  {plisioOn && (
                    <Card>
                      <CardHeader className="p-4 sm:p-5">
                        <CardTitle className="flex items-center gap-2">
                          <Bitcoin className="h-5 w-5 text-warning" aria-hidden />
                          {t('pages.billing.cryptoTitle')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
                        <Alert variant="info">{t('pages.billing.cryptoHint')}</Alert>

                        <div className="flex flex-wrap gap-2">
                          {QUICK_AMOUNTS.map((a) => (
                            <Button
                              key={a}
                              variant={cryptoAmount === a ? 'primary' : 'secondary'}
                              onClick={() => setCryptoAmount(a)}
                            >
                              {formatNumber(a)}
                            </Button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="flex flex-1 flex-col gap-1.5">
                            <Label htmlFor="crypto-amount">{t('pages.billing.amount')}</Label>
                            <div className="flex">
                              <Input
                                id="crypto-amount"
                                inputMode="numeric"
                                className={cn('rounded-e-none')}
                                value={cryptoAmount ? formatNumber(cryptoAmount) : ''}
                                onChange={(e) => setCryptoAmount(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                              />
                              <span className="inline-flex items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">
                                {unit}
                              </span>
                            </div>
                          </div>
                          <Button
                            loading={cryptoMut.isPending}
                            onClick={startCryptoPayment}
                            className="sm:w-auto"
                          >
                            {t('pages.billing.payWithCrypto')}
                          </Button>
                        </div>

                        {cryptoAmount > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {t('pages.billing.cryptoEstimate', {
                                amount: cryptoFiat.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                                currency: fiatCurrency
                            })}
                          </p>
                        )}

                        {bonusPreview && (
                          <Alert variant={bonusPreview.eligible && bonusPreview.bonus > 0 ? 'success' : 'info'}>
                            <span className="flex items-center gap-2">
                              <Gift className="h-4 w-4 shrink-0" aria-hidden />
                              {bonusPreview.eligible && bonusPreview.bonus > 0 ? (
                                <span>
                                  {t('pages.billing.bonusPreview', {
                                      deposit: `${ formatNumber(cryptoAmount) } ${ unit }`,
                                      bonus: `${ formatNumber(bonusPreview.bonus) } ${ unit }`,
                                      total: `${ formatNumber(bonusPreview.total) } ${ unit }`,
                                      pct: bonusPreview.pct
                                  })}
                                </span>
                              ) : (
                                <span>
                                  {t('pages.billing.bonusMinHint', {
                                      min: `${ formatNumber(me?.cryptoBonusMinDeposit ?? 0) } ${ unit }`,
                                      pct: bonusPreview.pct
                                  })}
                                </span>
                              )}
                            </span>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Admin crypto report */}
              {me?.isAdmin && report && report.depositCount > 0 && (
                <Card>
                  <CardHeader className="p-4 sm:p-5">
                    <CardTitle>{t('pages.billing.report.title')}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <StatCard
                        label={t('pages.billing.report.totalDeposits')}
                        value={formatMoney(report.totalDeposits)}
                      />
                      <StatCard
                        icon={<Gift className="h-5 w-5 text-success" aria-hidden />}
                        label={t('pages.billing.report.totalBonus')}
                        value={formatMoney(report.totalBonus)}
                      />
                      <StatCard
                        label={t('pages.billing.report.depositCount')}
                        value={formatNumber(report.depositCount)}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{t('pages.billing.report.byCurrency')}</h4>
                        {report.byCurrency.map((b) => (
                          <div key={b.key} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                            <Badge variant="primary">{b.key}</Badge>
                            <span className="tabular-nums">{formatMoney(b.amount)} · {b.count}×</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{t('pages.billing.report.byRole')}</h4>
                        {report.byRole.map((b) => (
                          <div key={b.key} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                            <Badge variant="neutral" className="capitalize">{b.key}</Badge>
                            <span className="tabular-nums">{formatMoney(b.amount)} · {b.count}×</span>
                          </div>
                        ))}
                      </div>
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
                    pageSize={15}
                  />
                </CardContent>
              </Card>
            </div>
    </PageShell>
    );
}
