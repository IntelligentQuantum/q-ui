import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { Badge, Card, CardContent, Table } from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

// Mirrors service.TenantRollupItem — one workspace's headline finance row.
interface WorkspaceRollup {
  tenantId: number;
  slug: string;
  name: string;
  status: string;
  managerName: string;
  managerEmail: string;
  userCount: number;
  orderCount: number;
  pendingCount: number;
  grossRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  walletBalance: number;
  treasury: number;
  createdAt: number;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
    active: 'success',
    suspended: 'danger',
    pending: 'warning'
};

// WorkspacesTab is the admin-only per-workspace finance breakdown: every tenant's
// gross/net revenue, treasury, users, orders and pending deposits side by side,
// so the admin sees the WHOLE panel at a glance. Clicking a row drills the rest
// of the finance page into that one workspace (onDrill sets the tenant selector).
export default function WorkspacesTab({ onDrill }: { onDrill: (tenantId: number) => void })
{
    const { t } = useTranslation();
    const { format: money, formatNumber } = useCurrency();

    const query = useQuery({
        queryKey: ['finance', 'tenants'],
        queryFn: async () =>
        {
            const m = await HttpUtil.get('/panel/api/finance/tenants', undefined, { silent: true });
            return m?.success ? ((m.obj as WorkspaceRollup[]) ?? []) : [];
        },
        staleTime: 30_000
    });

    const columns: Column<WorkspaceRollup>[] = [
        {
            key: 'name',
            header: t('pages.finance.wsWorkspace'),
            cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.name || `#${ r.tenantId }`}</span>
          {r.slug && <span className="text-xs text-muted-foreground">/{r.slug}</span>}
        </div>
            )
        },
        {
            key: 'manager',
            header: t('pages.finance.wsManager'),
            hideBelow: 'md',
            cell: (r) => r.managerName
                ? <span className="text-foreground">{r.managerName}</span>
                : <span className="text-muted-foreground">—</span>
        },
        { key: 'users', header: t('pages.finance.wsUsers'), align: 'end', hideBelow: 'sm', cell: (r) => <span className="tabular-nums">{formatNumber(r.userCount)}</span> },
        { key: 'orders', header: t('pages.finance.wsOrders'), align: 'end', hideBelow: 'lg', cell: (r) => <span className="tabular-nums">{formatNumber(r.orderCount)}</span> },
        {
            key: 'pending',
            header: t('pages.finance.wsPending'),
            align: 'end',
            hideBelow: 'lg',
            cell: (r) => r.pendingCount > 0
                ? <Badge variant="warning" className="tabular-nums">{formatNumber(r.pendingCount)}</Badge>
                : <span className="tabular-nums text-muted-foreground">0</span>
        },
        { key: 'gross', header: t('pages.finance.wsGross'), align: 'end', accessor: (r) => r.grossRevenue, sortable: true, cell: (r) => <span className="tabular-nums">{money(r.grossRevenue)}</span> },
        { key: 'net', header: t('pages.finance.wsNet'), align: 'end', accessor: (r) => r.netRevenue, sortable: true, cell: (r) => <span className="tabular-nums font-medium text-foreground">{money(r.netRevenue)}</span> },
        { key: 'treasury', header: t('pages.finance.wsTreasury'), align: 'end', hideBelow: 'md', cell: (r) => <span className="tabular-nums">{money(r.treasury)}</span> },
        {
            key: 'status',
            header: t('pages.finance.wsStatus'),
            align: 'center',
            cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{t(`pages.managers.status_${ r.status }`, { defaultValue: r.status })}</Badge>
        }
    ];

    return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <Table<WorkspaceRollup>
          columns={columns}
          data={query.data ?? []}
          rowKey={(r) => String(r.tenantId)}
          loading={query.isFetching}
          pageSize={10}
          onRowClick={(r) => onDrill(r.tenantId)}
          empty={
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Store className="h-8 w-8 opacity-50" aria-hidden />
              <div>{t('pages.finance.wsEmpty')}</div>
            </div>
          }
        />
      </CardContent>
    </Card>
    );
}
