import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, LogIn, LogOut, UserPlus } from 'lucide-react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useWebSocketBridge } from '@/api/websocketBridge';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBranding } from '@/hooks/useBranding';
import { useMe, type MeInfo } from '@/hooks/useMe';
import { clearImpersonation, getImpersonation } from '@/utils/impersonation';
import { HttpUtil } from '@/utils';
import { Button } from '@/components/ui';

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
            return has('client.manage'); // admin + manager + moderator
        case '/products':
            return has('product.manage'); // admin + manager
        case '/store':
            // Managers CAN reach the store when browsing the admin/another workspace's
            // storefront (to resell its products). The sidebar hides the item on their
            // OWN workspace; hard-blocking the route here stranded a manager on a blank
            // page after clicking "Original panel" (which lands on /store).
            return has('product.purchase');
        case '/billing':
        case '/manual-deposit':
            return has('product.purchase'); // admin, reseller, member
        case '/manual-deposits':
            return has('deposit.manage'); // admin only — review queue + cards
        case '/tickets':
            return has('ticket.view_own'); // every role with tickets
        case '/support':
            return has('ticket.manage'); // support staff — admin + manager
        case '/finance':
            return has('finance.view_all'); // admin + manager
        case '/orders':
            return has('order.view_own'); // everyone with order visibility
        case '/services':
            return has('product.purchase'); // admin, reseller, member — own configs
        case '/profile':
            return true; // every authenticated user
        case '/referral':
            return has('customer.view'); // reseller (+admin) — referral dashboard
        case '/customers':
            return has('customer.view'); // reseller — referred-customer roster
        case '/admin-referrals':
            return has('user.manage'); // admin only — manage reseller referral codes
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
    if (me.isModerator)
    {
        return '/clients'; // workspace staff — their one job is creating clients
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

    // Separate sites: a logged-in user who is NOT a member of the workspace in the
    // URL must not see its content — they get ITS OWN login/register instead. The
    // admin (oversight / impersonation) is exempt; not-logged-in visitors already
    // hit the ?ws login via the axios 401 redirect.
    const viewingForeignWorkspace = !!me && !me.isAdmin && !!urlSlug && (me.tenantSlug || '') !== urlSlug;

    useEffect(() =>
    {
        if (!me || viewingForeignWorkspace)
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
    }, [me, viewingForeignWorkspace, needWorkspaceLanding, ownSlug, restricted, home, navigate]);

    // Not a member of this workspace → show ITS login/register, not its content.
    // The buttons end the current (other-workspace) session first, so the
    // workspace's own auth page shows instead of bouncing back to /panel/.
    if (viewingForeignWorkspace && urlSlug)
    {
        const base = window.Q_UI_BASE_PATH || '/';
        const go = async (path: string) =>
        {
            await HttpUtil.post('/logout');
            window.location.href = path;
        };
        return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border border-border bg-surface p-8 text-center shadow-lg">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-subtle text-accent">
            <LogIn className="h-6 w-6" aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">{t('pages.login.foreignTitle', { name: urlSlug })}</h1>
            <p className="text-sm text-muted-foreground">{t('pages.login.foreignDesc')}</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <Button className="w-full" onClick={() => go(`${ base }?ws=${ encodeURIComponent(urlSlug) }`)}>
              <LogIn className="h-4 w-4" aria-hidden />
              {t('pages.login.foreignSignIn')}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => go(`${ base }register?ws=${ encodeURIComponent(urlSlug) }`)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              {t('pages.login.foreignRegister')}
            </Button>
          </div>
        </div>
      </div>
        );
    }

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
