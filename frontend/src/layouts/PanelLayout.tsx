import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, LogOut } from 'lucide-react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useWebSocketBridge } from '@/api/websocketBridge';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBranding } from '@/hooks/useBranding';
import { useMe, type MeInfo } from '@/hooks/useMe';
import { clearImpersonation, getImpersonation } from '@/utils/impersonation';

// canAccess mirrors the backend permission matrix (database/model/rbac.go).
// This is a UX guard ONLY — the backend independently enforces RBAC on every
// API, so a user who hand-types a URL or hits the API directly still gets
// nothing they are not entitled to. Keep it in sync with AppSidebar.
function canAccess(me: MeInfo, path: string): boolean
{
    const has = (p: string) => me.isAdmin || me.permissions.includes(p as MeInfo['permissions'][number]);
    switch (path)
    {
        case '/':
            return has('stats.view_all'); // admin only
        case '/inbounds':
        case '/groups':
        case '/nodes':
        case '/settings':
        case '/xray':
        case '/api-docs':
            return has('infra.manage'); // admin only
        case '/users':
            return has('user.manage'); // admin only
        case '/managers':
            return has('manager.admin'); // admin only — manager workspaces
        case '/workspace-settings':
            return has('tenant.settings'); // manager — own workspace branding/settings
        case '/tenant-users':
            return has('tenant.users'); // manager — own customers
        case '/workspace-payments':
            return has('tenant.payments'); // manager — own gateways
        case '/clients':
            return has('client.manage'); // admin, moderator
        case '/products':
            return has('product.manage'); // admin, moderator
        case '/store':
        case '/billing':
        case '/manual-deposit':
            return has('product.purchase'); // admin, reseller, member
        case '/manual-deposits':
            return has('deposit.manage'); // admin only — review queue + cards
        case '/tickets':
            return has('ticket.view_own'); // every role with tickets
        case '/support':
            return has('ticket.manage'); // support staff — moderator/admin
        case '/finance':
            return has('finance.view_all'); // admin + read-only moderator
        case '/orders':
            return has('order.view_own'); // everyone with order visibility
        case '/services':
            return has('product.purchase'); // admin, reseller, member — own configs
        case '/profile':
            return true; // every authenticated user
        default:
            return true; // unknown path: let the router handle it
    }
}

// homeFor returns the landing route each role is redirected to when it hits a
// page it may not access.
function homeFor(me: MeInfo): string
{
    if (me.isAdmin)
    {
        return '/';
    }
    // A manager runs a full workspace; land them on their products catalog
    // (their workspace dashboard arrives in a later phase).
    if (me.isManager)
    {
        return '/products';
    }
    if (me.isReseller)
    {
        return '/store'; // reseller no longer manages the Clients page; land on the store
    }
    return '/store'; // member
}

export default function PanelLayout()
{
    useWebSocketBridge();
    usePageTitle();
    useBranding();

    const { t } = useTranslation();
    const { me } = useMe();
    const { pathname } = useLocation();
    const { tenantSlug: urlSlug } = useParams();
    const navigate = useNavigate();

    // Admin "view as workspace": while impersonating, the admin operates under the
    // impersonated /manager/<slug> just like its owner would (data is scoped by
    // the X-Tenant header the axios layer sends). Only honored for admins.
    const imp = me?.isAdmin ? getImpersonation() : null;

    // "Separate websites" model: the URL decides which storefront you're viewing.
    // /panel/ is the admin store; /panel/manager/<slug> is that manager's store.
    // Any logged-in user may browse ANY storefront (browse & buy), so there is no
    // forced slug redirect — management stays scoped to the user's own workspace
    // server-side regardless of which store URL they're on.
    const urlPrefix = urlSlug ? `/manager/${ urlSlug }` : '';

    // The user's OWN workspace (their home site): the impersonated slug for an
    // admin viewing-as, otherwise their tenant slug. Empty for admins/tenant-0.
    const ownSlug = imp ? imp.slug : (me && !me.isAdmin ? (me.tenantSlug || '') : '');

    // Strip any /manager/<slug> prefix so the RBAC gate sees the logical page path.
    const logicalPath = urlSlug ? (pathname.slice(`/manager/${ urlSlug }`.length) || '/') : pathname;

    const restricted = !!me && !canAccess(me, logicalPath);

    // Are we viewing our OWN storefront? Users with a workspace slug own
    // /manager/<slug>; admins and legacy tenant-0 users own the bare /panel/ store.
    const onOwnStore = ownSlug ? (urlSlug === ownSlug) : !urlSlug;
    // RBAC fallback stays in the storefront currently being viewed: land on the
    // store when browsing someone else's (incl. a manager reselling the admin
    // store), and on the role's normal home page on our own storefront.
    const landing = me ? (onOwnStore ? homeFor(me) : '/store') : '/';
    const home = `${ urlPrefix }${ landing }`;

    // First landing only: a customer (member/reseller) arriving at the bare panel
    // root is sent to their OWN workspace store. Managers are NOT force-landed —
    // they may sit on /panel/ to resell the original panel's products with their
    // own balance, and reach their workspace via the sidebar.
    const needWorkspaceLanding = !!me && !!ownSlug && !urlSlug && logicalPath === '/' && !me.isManager;

    useEffect(() =>
    {
        if (!me)
        {
            return;
        }
        if (needWorkspaceLanding)
        {
            navigate(`/manager/${ ownSlug }${ homeFor(me) }`, { replace: true });
            return;
        }
        if (restricted)
        {
            navigate(home, { replace: true });
        }
    }, [me, needWorkspaceLanding, ownSlug, restricted, home, navigate]);

    // Avoid flashing the wrong page for the frame before a redirect lands.
    if (needWorkspaceLanding || restricted)
    {
        return null;
    }

    if (imp)
    {
        const exit = () =>
        {
            clearImpersonation();
            const base = window.Q_UI_BASE_PATH || '/';
            window.location.href = `${ base }panel/managers`;
        };
        return (
      <>
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground backdrop-blur">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Eye className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            {t('pages.managers.impersonating', { name: imp.slug })}
          </span>
          <button
            type="button"
            onClick={exit}
            className="inline-flex items-center gap-1 rounded-md border border-warning/40 px-2.5 py-1 text-xs font-semibold text-warning transition-colors hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            {t('pages.managers.exitImpersonation')}
          </button>
        </div>
        <Outlet />
      </>
        );
    }

    return <Outlet />;
}
