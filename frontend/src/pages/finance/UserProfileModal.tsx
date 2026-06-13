import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { HttpUtil, IntlUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { Badge, Modal, Spinner } from '@/components/ui';

interface Ledger { id: number; type: string; amount: number; source: string; description: string; balanceAfter: number; createdAt: number; }
interface Purchase { id: number; productName: string; amount: number; status: string; createdAt: number; }
interface Profile {
  id: number; username: string; fullName: string; role: string; balance: number; createdAt: number;
  referredByUserId: number; referredByUsername: string; referralCode: string;
  totalDeposited: number; totalSpent: number; totalPurchased: number; totalOrders: number;
  activeServices: number; expiredServices: number; lastPaymentAt: number; ltv: number;
  ledger: Ledger[]; purchases: Purchase[];
}

export default function UserProfileModal({ userId, onClose }: { userId: number | null; onClose: () => void })
{
    const { t } = useTranslation();
    const { format: money } = useCurrency();

    const query = useQuery({
        queryKey: ['finance', 'user', userId],
        queryFn: async () =>
        {
            const m = await HttpUtil.get(`/panel/api/finance/users/${ userId }`, undefined, { silent: true });
            return m?.success ? (m.obj as Profile) : null;
        },
        enabled: !!userId
    });
    const p = query.data;

    const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
    );

    return (
    <Modal open={!!userId} onClose={onClose} title={p ? `${ p.username }` : t('pages.finance.userProfile')} size="xl">
      {query.isLoading || !p ? (
        <div className="flex min-h-40 items-center justify-center"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <h4 className="mb-2 text-sm font-semibold">{t('pages.finance.profile')}</h4>
              {row(t('pages.users.role'), <Badge variant="primary" className="capitalize">{p.role}</Badge>)}
              {row(t('balance'), money(p.balance))}
              {row(t('pages.finance.registered'), p.createdAt ? IntlUtil.formatDate(p.createdAt) : '—')}
              {row(t('pages.finance.referredBy'), p.referredByUsername || '—')}
              {row(t('pages.finance.referralCode'), p.referralCode || '—')}
            </div>
            <div className="rounded-lg border border-border p-3">
              <h4 className="mb-2 text-sm font-semibold">{t('pages.finance.financialSummary')}</h4>
              {row(t('pages.finance.totalDeposited'), money(p.totalDeposited))}
              {row(t('pages.finance.totalSpent'), money(p.totalSpent))}
              {row(t('pages.finance.ltv'), money(p.ltv))}
              {row(t('pages.finance.orders'), `${ p.totalPurchased } / ${ p.totalOrders }`)}
              {row(t('pages.finance.services'), `${ p.activeServices } ${ t('pages.finance.active') } · ${ p.expiredServices } ${ t('pages.finance.expired') }`)}
              {row(t('pages.finance.lastPayment'), p.lastPaymentAt ? IntlUtil.formatDate(p.lastPaymentAt) : '—')}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">{t('pages.finance.recentLedger')}</h4>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {p.ledger.length === 0 ? (
                    <tr><td className="p-4 text-center text-muted-foreground">{t('noData')}</td></tr>
                  ) : p.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Badge variant={l.type === 'credit' ? 'success' : 'neutral'}>{l.source || l.type}</Badge>
                      </td>
                      <td className={`px-3 py-2 text-end font-medium tabular-nums ${ l.type === 'credit' ? 'text-success' : 'text-danger' }`}>
                        {l.type === 'credit' ? '+' : '−'}{money(l.amount)}
                      </td>
                      <td className="hidden px-3 py-2 text-end text-muted-foreground tabular-nums sm:table-cell">{money(l.balanceAfter)}</td>
                      <td className="hidden px-3 py-2 text-end text-xs text-muted-foreground md:table-cell">{IntlUtil.formatDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
    );
}
