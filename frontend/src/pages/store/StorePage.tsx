import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    LayoutGrid,
    ShoppingCart,
    Wallet,
    Clock,
    Gauge
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, ErrorState, StatCard, SearchInput } from '@/components/ui';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import { ME_QUERY_KEY, useMe } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import PageShell from '@/layouts/PageShell';
import {
    Button,
    Card,
    Input,
    Label,
    Modal,
    Skeleton
} from '@/components/ui';
import SubscriptionDetailsModal, { type PurchaseSubscription } from '@/components/SubscriptionDetailsModal';

interface Product {
  id: number;
  name: string;
  description: string;
  trafficLimit: number;
  durationDays: number;
  price: number;
  audience: string;
  status: string;
}

const GB = 1024 * 1024 * 1024;
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

// StorePage lets resellers and members browse the active catalog and purchase a
// product with their wallet balance. Buying calls POST /panel/api/orders; the
// backend debits the balance (writing a Transaction) and creates the order
// atomically. All gating is enforced server-side — this is presentation only.
export default function StorePage()
{
    const { t } = useTranslation();
    const qc = useQueryClient();
    const { balance } = useMe();
    const { format, formatNumber, unit } = useCurrency();
    const [buying, setBuying] = useState<Product | null>(null);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    // Post-purchase success modal: the subscription/connection details returned
    // by the purchase call, plus the product that was bought (for the summary).
    const [successSub, setSuccessSub] = useState<PurchaseSubscription | null>(null);
    const [successProduct, setSuccessProduct] = useState<Product | null>(null);

    const { data: products, isLoading, isError, refetch } = useQuery({
        queryKey: ['products', 'store'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || '');
            }
            return (msg.obj as Product[] | null) ?? [];
        }
    });

    // Open the buy dialog where the buyer can name the config (the config name is
    // the client "email", as on the Clients page).
    const openBuy = (p: Product) =>
    {
        setBuying(p);
        setName('');
    };

    const doBuy = async () =>
    {
        if (!buying)
        {
            return;
        }
        setBusy(true);
        try
        {
            const msg = await HttpUtil.post(
                '/panel/api/orders',
                { productId: buying.id, name: name.trim() },
                { ...JSON_HEADERS, silent: true }
            );
            if (msg.success)
            {
                // Show the connection details immediately — no navigation needed.
                const data = (msg.obj ?? {}) as { subscription?: PurchaseSubscription };
                setSuccessProduct(buying);
                setSuccessSub(
                    data.subscription ?? { email: '', subId: '', subUrl: '', links: [], partial: false }
                );
                setBuying(null);
                qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
                qc.invalidateQueries({ queryKey: ['orders'] });
                qc.invalidateQueries({ queryKey: ['clients'] });
            }
            else
            {
                getMessage().error(msg.msg || t('somethingWentWrong'));
            }
        }
        finally
        {
            setBusy(false);
        }
    };

    const list = products ?? [];
    const [q, setQ] = useState('');
    const filtered = useMemo(() =>
    {
        const s = q.trim().toLowerCase();
        return s ? list.filter((p) => p.name.toLowerCase().includes(s)) : list;
    }, [list, q]);

    const formatTraffic = (v: number) => (v > 0 ? `${ Math.round(v / GB) } GB` : '∞');
    const formatDuration = (v: number) => (v > 0 ? `${ v } ${ t('pages.store.days') }` : '∞');

    return (
    <PageShell name="store-page">
      <div className="flex w-full flex-col gap-4">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            label={t('pages.store.balance')}
            value={
              <>
                {formatNumber(balance)}{' '}
                <span className="text-base font-medium text-muted-foreground">{unit}</span>
              </>
            }
          />
          <StatCard
            icon={<LayoutGrid className="h-5 w-5" aria-hidden />}
            label={t('pages.store.available')}
            value={list.length}
          />
        </div>

        {/* Catalog */}
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <SearchInput
              className="w-full sm:w-64"
              aria-label={t('search')}
              placeholder={t('search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<LayoutGrid aria-hidden />} title={t('noData')} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) =>
              {
                  const affordable = balance >= p.price;
                  return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{p.name}</span>
                        {p.audience && p.audience !== 'all' && (
                          <Badge variant="neutral" className="shrink-0">
                            {p.audience === 'reseller' ? t('pages.products.audienceReseller') : t('pages.products.audienceMember')}
                          </Badge>
                        )}
                      </div>
                      <span className="text-lg font-bold tabular-nums text-foreground">{format(p.price)}</span>
                    </div>

                    {p.description && (
                      <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{p.description}</p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Gauge className="h-4 w-4" aria-hidden />
                        {formatTraffic(p.trafficLimit)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4" aria-hidden />
                        {formatDuration(p.durationDays)}
                      </span>
                    </div>

                    <Button
                      className="mt-auto w-full"
                      disabled={!affordable}
                      onClick={() => openBuy(p)}
                    >
                      <ShoppingCart className="h-4 w-4" aria-hidden />
                      {t('pages.store.buy')}
                    </Button>
                  </div>
                  );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Buy dialog */}
      <Modal
        open={!!buying}
        onClose={() => setBuying(null)}
        title={t('pages.store.confirmTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBuying(null)}>
              {t('cancel')}
            </Button>
            <Button loading={busy} onClick={doBuy}>
              {t('pages.store.buy')}
            </Button>
          </>
        }
      >
        {buying && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-sunken p-3 text-sm">
              <span className="text-base font-semibold text-foreground">{buying.name}</span>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('pages.store.price')}</span>
                <span className="font-semibold tabular-nums">{format(buying.price)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('pages.store.balanceAfter')}</span>
                <span className="tabular-nums">{format(Math.max(0, balance - buying.price))}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store-config-name">{t('pages.store.configName')}</Label>
              <Input
                id="store-config-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('pages.store.configNamePlaceholder')}
                maxLength={64}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Post-purchase success: subscription URL + configs + QR + summary */}
      <SubscriptionDetailsModal
        open={!!successSub}
        onClose={() => setSuccessSub(null)}
        subscription={successSub}
        summary={
          successProduct
              ? {
                  name: successProduct.name,
                  active: true,
                  trafficLabel: formatTraffic(successProduct.trafficLimit),
                  expiryLabel: successProduct.durationDays > 0
                      ? new Date(Date.now() + successProduct.durationDays * 86400000).toLocaleDateString()
                      : '∞'
              }
              : null
        }
      />
    </PageShell>
    );
}
