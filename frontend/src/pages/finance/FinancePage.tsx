import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, CreditCard, Globe, LineChart, Store, Wallet } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe } from '@/hooks/useMe';
import { HttpUtil } from '@/utils';
import PageShell from '@/layouts/PageShell';
import { Badge, Select, Tabs } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import OverviewTab from './OverviewTab';
import DepositsTab from './DepositsTab';
import AnalyticsTab from './AnalyticsTab';
import CashflowTab from './CashflowTab';
import WorkspacesTab from './WorkspacesTab';

type TabKey = 'overview' | 'deposits' | 'analytics' | 'cashflow' | 'workspaces';

interface TenantRow {
    tenantId: number;
    slug: string;
    name: string;
    status: string;
    managerName: string;
    userCount: number;
    grossRevenue: number;
    netRevenue: number;
}

// "all" is the sentinel meaning "whole platform view" (admin only); an integer
// tenantId pinches the dashboard to that workspace. value 0 is the manager's
// own workspace and is never rendered in the picker (the picker is admin-only).
type TenantSelection = 'all' | string;

// withTenant appends tenantId=<n> (or omits it for the 'all' / empty case) to a
// URL, used by every per-tab query so admin drill-down propagates without each
// tab having to repeat the string-format. Returns the URL unchanged when scope
// is 'all' so the cluster-wide view stays canonical.
function withTenant(base: string, sel: TenantSelection): string
{
    const sep = base.includes('?') ? '&' : '?';
    return sel === 'all' ? base : `${ base }${ sep }tenantId=${ sel }`;
}

export default function FinancePage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { me } = useMe();
    const [tab, setTab] = useState<TabKey>('overview');
    // 'all' = platform-wide for admin; a numeric id narrows to that workspace;
    // '' (unset) means "use my own tenant", which is what managers fall back to
    // since the picker only renders for admin.
    const [tenantSel, setTenantSel] = useState<TenantSelection>('all');

    // Admin-only: load the per-tenant rollup so the picker has live options.
    // Falls back to an empty list for non-admin (the picker is hidden anyway).
    const tenantList = useQuery({
        queryKey: ['finance', 'tenants'],
        queryFn: async () =>
        {
            const m = await HttpUtil.get('/panel/api/finance/tenants', undefined, { silent: true });
            return m?.success ? ((m.obj as TenantRow[]) ?? []) : [];
        },
        enabled: !!me?.isAdmin,
        staleTime: 30_000
    });

    // Reset the drilled tenant when the user switches accounts/logs out — keeps
    // a stale drill from "leaking" into a different session's finance view.
    useEffect(() =>
    {
        if (!me?.isAdmin)
        {
            setTenantSel('all');
        }
    }, [me?.isAdmin]);

    const tenantOptions = (tenantList.data ?? []).map((t) => ({
        value: String(t.tenantId),
        label: t.name ? `${ t.name } (#${ t.tenantId })` : `#${ t.tenantId }`
    }));
    tenantOptions.unshift({ value: 'all', label: t('pages.finance.scopeAll') });

    // The workspace an admin has drilled into (null = platform-wide / manager).
    const selectedTenant = me?.isAdmin && tenantSel !== 'all'
        ? (tenantList.data ?? []).find((row) => String(row.tenantId) === tenantSel)
        : undefined;

    const scopeBadge = me && (
      <div className="flex items-center gap-2">
        <Badge variant={selectedTenant ? 'primary' : 'neutral'} className="gap-1.5">
            {!me.isAdmin
                ? <><Store className="h-3.5 w-3.5" aria-hidden />{t('pages.finance.scopeOwn')}</>
                : selectedTenant
                    ? <><Store className="h-3.5 w-3.5" aria-hidden />{selectedTenant.name || `#${ selectedTenant.tenantId }`}</>
                    : <><Globe className="h-3.5 w-3.5" aria-hidden />{t('pages.finance.scopeAll')}</>}
        </Badge>
        {me.isAdmin && tenantOptions.length > 1 && (
            <div className="w-full min-w-56 sm:w-72">
                <Select
                    value={tenantSel}
                    onChange={setTenantSel}
                    options={tenantOptions}
                    placeholder={t('pages.finance.scopeAll')}
                />
            </div>
        )}
      </div>
    );

    const tabs: TabItem[] = [
        { key: 'overview', label: t('pages.finance.tabOverview'), icon: <LineChart className="h-4 w-4" aria-hidden /> },
        { key: 'deposits', label: t('pages.finance.tabDeposits'), icon: <CreditCard className="h-4 w-4" aria-hidden /> },
        { key: 'analytics', label: t('pages.finance.tabAnalytics'), icon: <BarChart3 className="h-4 w-4" aria-hidden /> },
        { key: 'cashflow', label: t('pages.finance.tabCashflow'), icon: <Wallet className="h-4 w-4" aria-hidden /> },
        // Admin-only: the whole-panel, per-workspace breakdown.
        ...(me?.isAdmin ? [{ key: 'workspaces', label: t('pages.finance.tabWorkspaces'), icon: <Building2 className="h-4 w-4" aria-hidden /> }] : [])
    ];

    return (
    <PageShell title={t('pages.finance.title')} description={t('pages.finance.subtitle')} actions={scopeBadge}>
      <div className="flex flex-col gap-4">
        <Tabs
          variant="segmented"
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
          tabs={tabs}
        />

        {tab === 'overview' && <OverviewTab tenantSel={tenantSel} />}
        {tab === 'deposits' && <DepositsTab tenantSel={tenantSel} />}
        {tab === 'analytics' && <AnalyticsTab tenantSel={tenantSel} />}
        {tab === 'cashflow' && <CashflowTab tenantSel={tenantSel} />}
        {tab === 'workspaces' && me?.isAdmin && (
          <WorkspacesTab onDrill={(id) =>
          {
              setTenantSel(String(id));
              setTab('overview');
          }}
          />
        )}
      </div>
    </PageShell>
    );
}

export { withTenant, type TenantSelection };
