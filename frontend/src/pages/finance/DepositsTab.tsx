import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

import { HttpUtil, IntlUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { Badge, Button, Card, CardContent, SearchInput, Select, Table } from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';
import { withTenant, type TenantSelection } from './FinancePage';

const PAGE_SIZE = 25;

interface Deposit {
  method: string; refId: number; userId: number; username: string; role: string;
  amount: number; bonus: number; currency: string; status: string; createdAt: number;
}
interface Feed { items: Deposit[]; total: number; }

const STATUS_VARIANT: Record<string, BadgeVariant> = { approved: 'success', pending: 'warning', rejected: 'danger' };

function exportUrl(method: string, status: string, search: string, sel: TenantSelection): string
{
    const base = `${ window.Q_UI_BASE_PATH || '/' }panel/api/finance/export/deposits`.replace(/\/{2,}/g, '/');
    const params = new URLSearchParams();
    if (method)
    {
        params.set('method', method);
    }
    if (status)
    {
        params.set('status', status);
    }
    if (search.trim())
    {
        params.set('search', search.trim());
    }
    const qs = params.toString();
    const withQs = qs ? `${ base }?${ qs }` : base;
    return withTenant(withQs, sel);
}

export default function DepositsTab({ tenantSel }: { tenantSel: TenantSelection })
{
    const { t } = useTranslation();
    const { format: money } = useCurrency();
    const [method, setMethod] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);

    useEffect(() =>
    {
        setPage(0);
    }, [method, status, search, tenantSel]);

    const query = useQuery({
        queryKey: ['finance', 'deposits', method, status, search, page, tenantSel],
        queryFn: async () =>
        {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
            if (method)
            {
                params.set('method', method);
            }
            if (status)
            {
                params.set('status', status);
            }
            if (search.trim())
            {
                params.set('search', search.trim());
            }
            const m = await HttpUtil.get(withTenant(`/panel/api/finance/deposits?${ params.toString() }`, tenantSel), undefined, { silent: true });
            return m?.success ? (m.obj as Feed) : { items: [], total: 0 };
        }
    });
    const feed = query.data ?? { items: [], total: 0 };
    const pageCount = Math.max(1, Math.ceil(feed.total / PAGE_SIZE));

    const columns: Column<Deposit>[] = [
        { key: 'method', header: t('pages.finance.method'), cell: (r) => <Badge variant="primary" className="capitalize">{r.method === 'manual' ? t('pages.finance.method_manual') : r.method}</Badge> },
        {
            key: 'user', header: t('pages.finance.user'),
            cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.username || `#${ r.userId }`}</span>
          <span className="text-xs capitalize text-muted-foreground">{r.role}</span>
        </div>
            )
        },
        { key: 'amount', header: t('pages.finance.amount'), cell: (r) => <strong className="tabular-nums">{money(r.amount)}</strong> },
        {
            key: 'status', header: t('pages.finance.statusLabel'),
            cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{t(`pages.finance.dstatus_${ r.status }`, { defaultValue: r.status })}</Badge>
        },
        { key: 'createdAt', header: t('pages.finance.date'), className: 'hidden sm:table-cell', cell: (r) => IntlUtil.formatDate(r.createdAt) }
    ];

    return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="w-full sm:w-40">
              <Select value={method} onChange={setMethod} placeholder={t('pages.finance.allMethods')}
                options={[{ value: '', label: t('pages.finance.allMethods') }, { value: 'manual', label: t('pages.finance.method_manual') }, { value: 'zarinpal', label: 'ZarinPal' }, { value: 'plisio', label: 'Plisio' }]} />
            </div>
            <div className="w-full sm:w-40">
              <Select value={status} onChange={setStatus} placeholder={t('pages.finance.allStatuses')}
                options={[{ value: '', label: t('pages.finance.allStatuses') }, { value: 'approved', label: t('pages.finance.dstatus_approved') }, { value: 'pending', label: t('pages.finance.dstatus_pending') }, { value: 'rejected', label: t('pages.finance.dstatus_rejected') }]} />
            </div>
            <div className="w-full sm:w-56">
              <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('pages.finance.searchUser')} />
            </div>
          </div>
          <a href={exportUrl(method, status, search, tenantSel)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.04]">
            <Download className="h-4 w-4" aria-hidden /> {t('pages.finance.exportCsv')}
          </a>
        </div>

        <Table<Deposit>
          columns={columns}
          data={feed.items ?? []}
          rowKey={(r) => `${ r.method }-${ r.refId }`}
          loading={query.isFetching}
          pageSize={0}
          empty={<div className="py-10 text-center text-muted-foreground">{t('noData')}</div>}
        />

        {feed.total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{t('pages.finance.totalRows', { count: feed.total })}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" disabled={page === 0} aria-label="prev" onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Button>
              <span className="px-1 text-xs tabular-nums text-muted-foreground">{page + 1} / {pageCount}</span>
              <Button variant="ghost" size="icon" disabled={page >= pageCount - 1} aria-label="next" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    );
}
