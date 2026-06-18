import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import PanelLayout from '@/layouts/PanelLayout';

const IndexPage = lazy(() => import('@/pages/index/IndexPage'));
const InboundsPage = lazy(() => import('@/pages/inbounds/InboundsPage'));
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const GroupsPage = lazy(() => import('@/pages/groups/GroupsPage'));
const UsersPage = lazy(() => import('@/pages/users/UsersPage'));
const ManagersPage = lazy(() => import('@/pages/managers/ManagersPage'));
const WorkspaceSettingsPage = lazy(() => import('@/pages/workspace/WorkspaceSettingsPage'));
const TenantUsersPage = lazy(() => import('@/pages/tenant-users/TenantUsersPage'));
const WorkspacePaymentsPage = lazy(() => import('@/pages/workspace/WorkspacePaymentsPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'));
const NodesPage = lazy(() => import('@/pages/nodes/NodesPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const XrayPage = lazy(() => import('@/pages/xray/XrayPage'));
const ApiDocsPage = lazy(() => import('@/pages/api-docs/ApiDocsPage'));
const StorePage = lazy(() => import('@/pages/store/StorePage'));
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'));
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'));
const ServicesPage = lazy(() => import('@/pages/services/ServicesPage'));
const ReferralPage = lazy(() => import('@/pages/referral/ReferralPage'));
const ManualDepositPage = lazy(() => import('@/pages/wallet/ManualDepositPage'));
const AdminManualDepositsPage = lazy(() => import('@/pages/admin/ManualDepositsPage'));
const TicketsPage = lazy(() => import('@/pages/tickets/TicketsPage'));
const TicketDetailPage = lazy(() => import('@/pages/tickets/TicketDetailPage'));
const SupportDashboardPage = lazy(() => import('@/pages/tickets/SupportDashboardPage'));
const FinancePage = lazy(() => import('@/pages/finance/FinancePage'));
const ThemePreviewPage = lazy(() => import('@/pages/theme-preview/ThemePreviewPage'));

function withSuspense(node: React.ReactNode)
{
    return <Suspense fallback={null}>{node}</Suspense>;
}

// Shared page set, mounted both at the admin root (`/`) and under a Manager's
// workspace prefix (`/:tenantSlug`). React Router ranks static segments above
// the dynamic one, so `/clients` matches the admin pages while `/ApiMehdi` (an
// unknown first segment = a workspace slug) falls through to the tenant route.
const panelChildren: RouteObject[] = [
    { index: true, element: withSuspense(<IndexPage />) },
    { path: 'inbounds', element: withSuspense(<InboundsPage />) },
    { path: 'clients', element: withSuspense(<ClientsPage />) },
    { path: 'groups', element: withSuspense(<GroupsPage />) },
    { path: 'users', element: withSuspense(<UsersPage />) },
    { path: 'managers', element: withSuspense(<ManagersPage />) },
    { path: 'workspace-settings', element: withSuspense(<WorkspaceSettingsPage />) },
    { path: 'tenant-users', element: withSuspense(<TenantUsersPage />) },
    { path: 'workspace-payments', element: withSuspense(<WorkspacePaymentsPage />) },
    { path: 'profile', element: withSuspense(<ProfilePage />) },
    { path: 'billing', element: withSuspense(<BillingPage />) },
    { path: 'nodes', element: withSuspense(<NodesPage />) },
    { path: 'settings', element: withSuspense(<SettingsPage />) },
    { path: 'xray', element: withSuspense(<XrayPage />) },
    { path: 'api-docs', element: withSuspense(<ApiDocsPage />) },
    { path: 'store', element: withSuspense(<StorePage />) },
    { path: 'orders', element: withSuspense(<OrdersPage />) },
    { path: 'products', element: withSuspense(<ProductsPage />) },
    { path: 'services', element: withSuspense(<ServicesPage />) },
    { path: 'referral', element: withSuspense(<ReferralPage />) },
    { path: 'manual-deposit', element: withSuspense(<ManualDepositPage />) },
    { path: 'manual-deposits', element: withSuspense(<AdminManualDepositsPage />) },
    { path: 'tickets', element: withSuspense(<TicketsPage />) },
    { path: 'tickets/:id', element: withSuspense(<TicketDetailPage />) },
    { path: 'support', element: withSuspense(<SupportDashboardPage />) },
    { path: 'finance', element: withSuspense(<FinancePage />) }
];

const routes: RouteObject[] = [
    { path: '/', element: <PanelLayout />, children: panelChildren },
    // Manager workspace: every page also lives under /manager/:tenantSlug
    // (i.e. /panel/manager/<slug>/...). The dedicated `manager/` namespace keeps
    // workspace slugs from ever colliding with admin page names. PanelLayout reads
    // the slug, validates it against the session (a manager may only use their own
    // slug), and strips it for the RBAC gate.
    { path: 'manager/:tenantSlug', element: <PanelLayout />, children: panelChildren },
    // Standalone design-system gallery — intentionally OUTSIDE PanelLayout so it
    // renders without the auth/RBAC gate. Dev/review aid for the theme rebuild.
    { path: 'theme-preview', element: withSuspense(<ThemePreviewPage />) }
];

function computeBasename()
{
    const raw = (typeof window !== 'undefined' && window.Q_UI_BASE_PATH) || '/';
    const trimmed = raw.replace(/\/+$/, '');
    return `${ trimmed }/panel`;
}

export const router = createBrowserRouter(routes, {
    basename: computeBasename()
});
