import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, CreditCard, LineChart, Wallet } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import PageShell from '@/layouts/PageShell';
import { Tabs } from '@/components/ui';
import OverviewTab from './OverviewTab';
import DepositsTab from './DepositsTab';
import AnalyticsTab from './AnalyticsTab';
import CashflowTab from './CashflowTab';

type TabKey = 'overview' | 'deposits' | 'analytics' | 'cashflow';

// FinancePage is the single financial control center (Admin → Finance). Read-only
// dashboards/analytics/cashflow/exports; moderators get the same view (RBAC
// finance.view_all). Money never moves here — only through the ledger.
export default function FinancePage()
{
    usePageTitle();
    const { t } = useTranslation();
    const [tab, setTab] = useState<TabKey>('overview');

    return (
    <PageShell title={t('pages.finance.title')} description={t('pages.finance.subtitle')}>
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
