import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil, IntlUtil } from '@/utils';
import PageShell from '@/layouts/PageShell';
import { Badge, Card, CardContent, Table } from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

interface Customer {
  id: number;
  username: string;
  role: string;
  balance: number;
  createdAt: number;
}

const ROLE_BADGE: Record<string, BadgeVariant> = { reseller: 'neutral', member: 'success' };

// MyCustomersPage is the reseller's roster of the customers they referred. Read
// only; the data comes from /panel/api/customers (customer.view-gated, scoped to
// the caller's own referrals).
export default function MyCustomersPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { format: money } = useCurrency();

    const query = useQuery({
        queryKey: ['customers'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/customers', undefined, { silent: true });
            return msg?.success ? ((msg.obj as Customer[]) ?? []) : [];
        }
    });

    const columns: Column<Customer>[] = [
        { key: 'username', header: t('username'), cell: (r) => <span className="font-medium">{r.username}</span> },
        {
            key: 'role',
            header: t('pages.users.role'),
            cell: (r) => <Badge variant={ROLE_BADGE[r.role] ?? 'neutral'}>{t(`pages.users.role_${ r.role }`, { defaultValue: r.role })}</Badge>
        },
        { key: 'balance', header: t('pages.customers.balance'), cell: (r) => <span className="tabular-nums">{money(r.balance)}</span> },
        { key: 'createdAt', header: t('pages.customers.joined'), className: 'hidden sm:table-cell', cell: (r) => IntlUtil.formatDate(r.createdAt) }
    ];

    return (
    <PageShell title={t('pages.customers.title')} description={t('pages.customers.subtitle')}>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <Table<Customer>
            columns={columns}
            data={query.data ?? []}
            rowKey={(r) => String(r.id)}
            loading={query.isFetching}
            pageSize={25}
            empty={<div className="py-10 text-center text-muted-foreground">{t('pages.customers.empty')}</div>}
          />
        </CardContent>
      </Card>
    </PageShell>
    );
}
