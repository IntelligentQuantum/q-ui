import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import UserProfileModal from './UserProfileModal';
import { withTenant, type TenantSelection } from './FinancePage';

interface TopProduct { productId: number; name: string; sales: number; revenue: number; }
interface TopUser { userId: number; username: string; role: string; value: number; count: number; }
interface MethodStat { method: string; count: number; volume: number; bonus: number; pending: number; rejected: number; }

function useList<T>(key: string, url: string, tenantSel: TenantSelection)
{
    return useQuery({
        queryKey: ['finance', key, tenantSel],
        queryFn: async () =>
        {
            const m = await HttpUtil.get(withTenant(url, tenantSel), undefined, { silent: true });
            return m?.success ? ((m.obj as T[]) ?? []) : [];
        }
    });
}

export default function AnalyticsTab({ tenantSel }: { tenantSel: TenantSelection })
{
    const { t } = useTranslation();
    const { format: money } = useCurrency();
    const [profileId, setProfileId] = useState<number | null>(null);

    const products = useList<TopProduct>('top-products', '/panel/api/finance/top/products?limit=10', tenantSel);
    const customers = useList<TopUser>('top-customers', '/panel/api/finance/top/customers?limit=10', tenantSel);
    const resellers = useList<TopUser>('top-resellers', '/panel/api/finance/top/resellers?limit=10', tenantSel);
    const depositors = useList<TopUser>('top-depositors', '/panel/api/finance/top/depositors?limit=10', tenantSel);
    const breakdown = useList<MethodStat>('breakdown', '/panel/api/finance/payment-breakdown', tenantSel);

    const userTable = (title: string, rows: TopUser[], valueLabel: string) => (
    <Card>
      <CardHeader className="p-4 sm:p-5"><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2 text-start font-medium">{t('pages.finance.user')}</th>
              <th className="px-4 py-2 text-end font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={2} className="p-6 text-center text-muted-foreground">{t('noData')}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId} className="cursor-pointer border-b border-border last:border-0 hover:bg-foreground/[0.03]" onClick={() => setProfileId(r.userId)}>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{r.username || `#${ r.userId }`}</span>
                    {r.role && <Badge variant="neutral" className="capitalize">{r.role}</Badge>}
                  </span>
                </td>
                <td className="px-4 py-2 text-end font-medium tabular-nums">{money(r.value)} <span className="text-xs text-muted-foreground">· {r.count}×</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
    );

    return (
    <div className="flex flex-col gap-4">
      {/* Payment method breakdown */}
      <Card>
        <CardHeader className="p-4 sm:p-5"><CardTitle>{t('pages.finance.paymentBreakdown')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-start font-medium">{t('pages.finance.method')}</th>
                  <th className="px-4 py-2 text-end font-medium">{t('pages.finance.confirmed')}</th>
                  <th className="px-4 py-2 text-end font-medium">{t('pages.finance.volume')}</th>
                  <th className="hidden px-4 py-2 text-end font-medium sm:table-cell">{t('pages.finance.bonuses')}</th>
                  <th className="hidden px-4 py-2 text-end font-medium sm:table-cell">{t('pages.finance.pending')}</th>
                  <th className="hidden px-4 py-2 text-end font-medium sm:table-cell">{t('pages.finance.rejected')}</th>
                </tr>
              </thead>
              <tbody>
                {(breakdown.data ?? []).map((m) => (
                  <tr key={m.method} className="border-b border-border last:border-0">
                    <td className="px-4 py-2"><Badge variant="primary" className="capitalize">{m.method}</Badge></td>
                    <td className="px-4 py-2 text-end tabular-nums">{m.count}</td>
                    <td className="px-4 py-2 text-end font-medium tabular-nums">{money(m.volume)}</td>
                    <td className="hidden px-4 py-2 text-end tabular-nums text-success sm:table-cell">{money(m.bonus)}</td>
                    <td className="hidden px-4 py-2 text-end tabular-nums text-warning sm:table-cell">{m.pending}</td>
                    <td className="hidden px-4 py-2 text-end tabular-nums text-danger sm:table-cell">{m.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top products */}
      <Card>
        <CardHeader className="p-4 sm:p-5"><CardTitle>{t('pages.finance.topProducts')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{t('pages.tickets.subject')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('pages.finance.sales')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('pages.finance.revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {(products.data ?? []).length === 0 ? (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{t('noData')}</td></tr>
              ) : (products.data ?? []).map((p) => (
                <tr key={p.productId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{p.name || `#${ p.productId }`}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{p.sales}</td>
                  <td className="px-4 py-2 text-end font-medium tabular-nums">{money(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {userTable(t('pages.finance.topCustomers'), customers.data ?? [], t('pages.finance.spent'))}
        {userTable(t('pages.finance.topDepositors'), depositors.data ?? [], t('pages.finance.deposited'))}
        {userTable(t('pages.finance.topResellers'), resellers.data ?? [], t('pages.finance.commission'))}
      </div>

      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
    </div>
    );
}
