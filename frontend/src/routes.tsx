import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import PanelLayout from '@/layouts/PanelLayout';

const IndexPage = lazy(() => import('@/pages/index/IndexPage'));
const InboundsPage = lazy(() => import('@/pages/inbounds/InboundsPage'));
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const GroupsPage = lazy(() => import('@/pages/groups/GroupsPage'));
const UsersPage = lazy(() => import('@/pages/users/UsersPage'));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'));
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
const ThemePreviewPage = lazy(() => import('@/pages/theme-preview/ThemePreviewPage'));

function withSuspense(node: React.ReactNode)
{
    return <Suspense fallback={null}>{node}</Suspense>;
}

const routes: RouteObject[] = [
    {
        path: '/',
        element: <PanelLayout />,
        children: [
            { index: true, element: withSuspense(<IndexPage />) },
            { path: 'inbounds', element: withSuspense(<InboundsPage />) },
            { path: 'clients', element: withSuspense(<ClientsPage />) },
            { path: 'groups', element: withSuspense(<GroupsPage />) },
            { path: 'users', element: withSuspense(<UsersPage />) },
            { path: 'reports', element: withSuspense(<ReportsPage />) },
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
            { path: 'support', element: withSuspense(<SupportDashboardPage />) }
        ]
    },
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
