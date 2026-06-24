import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, CreditCard, Globe, LineChart, Store, Wallet } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe } from '@/hooks/useMe';
import PageShell from '@/layouts/PageShell';
import { Badge, Tabs } from '@/components/ui';
import OverviewTab from './OverviewTab';
import DepositsTab from './DepositsTab';
import AnalyticsTab from './AnalyticsTab';
import CashflowTab from './CashflowTab';

type TabKey = 'overview' | 'deposits' | 'analytics' | 'cashflow';

// FinancePage is the single financial control center. The admin sees the WHOLE
// panel (every workspace, aggregated); a manager sees only their own workspace —
// the backend (FinanceController via tenant.ScopeFrom) decides which. Read-only
// dashboards/analytics/cashflow/exports. Money never moves here — only through
// the ledger.
export default function FinancePage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { me } = useMe();
    const [tab, setTab] = useState<TabKey>('overview');

    // Make the scope explicit: admins are looking at the whole panel, managers at
    // their own workspace.
    const scopeBadge = me && (
      <Badge variant="neutral" className="gap-1.5">
        {me.isAdmin
            ? <><Globe className="h-3.5 w-3.5" aria-hidden />{t('pages.finance.scopeAll')}</>
            : <><Store className="h-3.5 w-3.5" aria-hidden />{t('pages.finance.scopeOwn')}</>}
      </Badge>
    );

    return (
    <PageShell title={t('pages.finance.title')} description={t('pages.finance.subtitle')} actions={scopeBadge}>
      <div className="flex flex-col gap-4">
        <Tabs
          variant="segmented"
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
          tabs={[
              { key: 'overview', label: t('pages.finance.tabOverview'), icon: <LineChart className="h-4 w-4" aria-hidden /> },
              { key: 'deposits', label: t('pages.finance.tabDeposits'), icon: <CreditCard className="h-4 w-4" aria-hidden /> },
              { key: 'analytics', label: t('pages.finance.tabAnalytics'), icon: <BarChart3 className="h-4 w-4" aria-hidden /> },
              { key: 'cashflow', label: t('pages.finance.tabCashflow'), icon: <Wallet className="h-4 w-4" aria-hidden /> }
          ]}
        />

        {tab === 'overview' && <OverviewTab />}
        {tab === 'deposits' && <DepositsTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'cashflow' && <CashflowTab />}
      </div>
    </PageShell>
    );
}
