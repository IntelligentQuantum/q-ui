import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    CircleCheck,
    ShoppingCart,
    Wallet
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorState, SearchInput, StatCard } from '@/components/ui';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Card,
    Select,
    Table
} from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

interface Order {
  id: number;
  userId: number;
  productId: number;
  productName: string;
  clientEmail: string;
  amount: number;
  status: string;
  createdAt: number;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
    pending: 'warning',
    paid: 'primary',
    completed: 'success',
    cancelled: 'danger'
};

const STATUSES = ['pending', 'paid', 'completed', 'cancelled'];

// OrdersPage lists orders. The backend scopes the result: admin/moderator see
// every order (order.view_all); resellers/members see only their own
// (order.view_own + user_id filter). The SPA does not need to filter.
export default function OrdersPage()
{
    const { t } = useTranslation();
    const { format, formatNumber, unit } = useCurrency();

    const { data: orders, isLoading, isError, refetch } = useQuery({
        queryKey: ['orders'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/orders', undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || '');
            }
            return (msg.obj as Order[] | null) ?? [];
        }
    });

    const list = orders ?? [];
    const [q, setQ] = useState('');
    const [status, setStatus] = useState<string>('');

    // Stats reflect ALL orders (not the filtered view), so the cards stay stable
    // while searching/filtering.
    const stats = useMemo(() =>
    {
        const completed = list.filter((o) => o.status === 'completed' || o.status === 'paid');
        const spent = completed.reduce((sum, o) => sum + (o.amount || 0), 0);
        return { total: list.length, completed: completed.length, spent };
    }, [list]);

    const filtered = useMemo(() =>
    {
        const s = q.trim().toLowerCase();
        return list.filter((o) =>
        {
            if (status && o.status !== status)
            {
                return false;
            }
            if (!s)
            {
                return true;
            }
            return (o.productName || '').toLowerCase().includes(s) || String(o.id).includes(s);
        });
    }, [list, q, status]);

    const columns: Column<Order>[] = [
        { key: 'id', header: '#', width: 80, hideBelow: 'sm', accessor: (o) => o.id, cell: (o) => o.id },
        {
            key: 'product',
            header: t('pages.orders.product'),
            cell: (o) => o.productName || `#${ o.productId }`
        },
        {
            key: 'config',
            header: t('pages.orders.config'),
            hideBelow: 'md',
            cell: (o) => o.clientEmail || '—'
        },
        {
            key: 'amount',
            header: t('pages.orders.amount'),
            cell: (o) => format(o.amount)
        },
        {
            key: 'status',
            header: t('pages.orders.status'),
            cell: (o) => <Badge variant={STATUS_VARIANT[o.status] ?? 'neutral'}>{o.status}</Badge>
        },
        {
            key: 'date',
            header: t('pages.orders.date'),
            hideBelow: 'sm',
            cell: (o) => (o.createdAt ? new Date(o.createdAt).toLocaleString() : '-')
        }
    ];

    return (
    <PageShell name="orders-page">
      <div className="flex w-full flex-col gap-4">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<ShoppingCart className="h-5 w-5" aria-hidden />}
            label={t('pages.orders.total')}
            value={stats.total}
          />
          <StatCard
            icon={<CircleCheck className="h-5 w-5" aria-hidden />}
            label={t('pages.orders.completed')}
            value={stats.completed}
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            label={t('pages.orders.spent')}
            value={
              <>
                {formatNumber(stats.spent)}{' '}
                <span className="text-base font-medium text-muted-foreground">{unit}</span>
              </>
            }
          />
        </div>

        {/* List */}
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={status || null}
                onChange={setStatus}
                placeholder={t('pages.orders.status')}
                className="w-full min-w-36 sm:w-auto"
                options={[
                    { value: '', label: t('pages.orders.status') },
                    ...STATUSES.map((s) => ({ value: s, label: s }))
                ]}
              />
              <SearchInput
                className="w-full sm:w-56"
                aria-label={t('search')}
                placeholder={t('search')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : (
            <Table
              columns={columns}
              data={filtered}
              rowKey={(o) => String(o.id)}
              loading={isLoading}
              pageSize={10}
              empty={t('noData')}
            />
          )}
        </Card>
      </div>
    </PageShell>
    );
}
