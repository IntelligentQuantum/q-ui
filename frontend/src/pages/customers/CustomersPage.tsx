import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard, SearchInput } from '@/components/ui';

import { HttpUtil } from '@/utils';
import { useMe } from '@/hooks/useMe';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Card,
    Select,
    Table,
    TableSkeleton,
    ErrorState
} from '@/components/ui';
import type { Column } from '@/components/ui';

interface CustomerRow {
  email: string;
  enable: boolean;
  totalGB: number;
  expiryTime: number;
  ownerId: number;
  ownerName?: string;
  traffic?: { up: number; down: number };
}

const GB = 1024 * 1024 * 1024;

function fmtBytes(n: number): string
{
    if (!n)
    {
        return '0';
    }
    if (n >= GB)
    {
        return `${ (n / GB).toFixed(1) } GB`;
    }
    if (n >= 1024 * 1024)
    {
        return `${ (n / 1024 / 1024).toFixed(0) } MB`;
    }
    return `${ n } B`;
}

// CustomersPage is the role-scoped customer roster. Access is gated by the
// `customer.view` permission (PanelLayout + AppSidebar) and re-enforced on the
// backend, which also scopes the rows: admins/moderators see every customer,
// a reseller sees only the clients they own. Read-only — client management
// lives on the Clients page. The owner column is shown only to roles that see
// all customers (admin/moderator), so they can tell which reseller owns each.
export default function CustomersPage()
{
    const { t } = useTranslation();
    const { me } = useMe();
    const seesAll = !!(me?.isAdmin || me?.isModerator);

    const { data: customers, isLoading, isError, refetch } = useQuery({
        queryKey: ['customers', 'list'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/customers/list/paged?pageSize=200', undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || '');
            }
            const obj = msg.obj as { items?: CustomerRow[] } | null;
            return obj?.items ?? [];
        }
    });

    const list = customers ?? [];
    const activeCount = useMemo(() => list.filter((c) => c.enable).length, [list]);

    const [q, setQ] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | undefined>();
    const filtered = useMemo(() =>
    {
        const s = q.trim().toLowerCase();
        return list.filter((c) =>
        {
            if (statusFilter === 'active' && !c.enable)
            {
                return false;
            }
            if (statusFilter === 'disabled' && c.enable)
            {
                return false;
            }
            if (!s)
            {
                return true;
            }
            return c.email.toLowerCase().includes(s) || (c.ownerName || '').toLowerCase().includes(s);
        });
    }, [list, q, statusFilter]);

    const columns: Column<CustomerRow>[] = [
        { key: 'email', header: t('pages.customers.customer'), accessor: (c) => c.email },
        ...(seesAll
            ? [{
                key: 'owner',
                header: t('pages.customers.owner'),
                hideBelow: 'md',
                cell: (c: CustomerRow) => c.ownerName || (c.ownerId ? `#${ c.ownerId }` : '—')
            } as Column<CustomerRow>]
            : []),
        {
            key: 'enable',
            header: t('pages.customers.statusCol'),
            cell: (c) => (
        <Badge variant={c.enable ? 'success' : 'danger'}>
          {c.enable ? t('pages.customers.active') : t('pages.customers.disabled')}
        </Badge>
            )
        },
        {
            key: 'traffic',
            header: t('pages.customers.traffic'),
            cell: (c) =>
            {
                const used = (c.traffic?.up ?? 0) + (c.traffic?.down ?? 0);
                return `${ fmtBytes(used) } / ${ c.totalGB > 0 ? fmtBytes(c.totalGB) : '∞' }`;
            }
        },
        {
            key: 'expiry',
            header: t('pages.customers.expiry'),
            hideBelow: 'sm',
            cell: (c) => (c.expiryTime > 0 ? new Date(c.expiryTime).toLocaleDateString() : '∞')
        }
    ];

    return (
    <PageShell name="customers-page">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Users className="h-5 w-5" aria-hidden />} label={t('pages.customers.total')} value={list.length} />
          <StatCard icon={<CircleCheck className="h-5 w-5 text-success" aria-hidden />} label={t('pages.customers.active')} value={activeCount} />
        </div>

        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {list.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-[130px]"
                  placeholder={t('pages.customers.statusCol')}
                  value={statusFilter ?? ''}
                  onChange={(v) => setStatusFilter(v || undefined)}
                  options={[
                      { value: '', label: t('all') },
                      { value: 'active', label: t('pages.customers.active') },
                      { value: 'disabled', label: t('pages.customers.disabled') }
                  ]}
                />
                <SearchInput
                  className="w-full sm:w-52"
                  aria-label={t('search')}
                  placeholder={t('search')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : (
            <Table
              rowKey={(c) => c.email}
              columns={columns}
              data={filtered}
              empty={t('pages.customers.empty')}
            />
          )}
        </Card>
      </div>
    </PageShell>
    );
}
