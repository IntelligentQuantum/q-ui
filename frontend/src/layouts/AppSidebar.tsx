import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeftRight,
    Banknote,
    Building2,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    ClipboardCheck,
    Cloud,
    Code,
    CreditCard,
    Database,
    Home,
    IdCard,
    Import,
    Landmark,
    LayoutDashboard,
    LayoutGrid,
    LifeBuoy,
    LogOut,
    Mail,
    type LucideIcon,
    MessageSquare,
    Network,
    Palette,
    Plug,
    Server,
    Settings,
    Share2,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    Tags,
    Ticket,
    Upload,
    User,
    Users,
    Wallet,
    Wrench,
    X
} from 'lucide-react';

import { BrandManager, HttpUtil } from '@/utils';
import { getImpersonation } from '@/utils/impersonation';
import { useAllSettings } from '@/api/queries/useAllSettings';
import { useMe, type Permission } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/components/ui';

const SIDEBAR_COLLAPSED_KEY = 'isSidebarCollapsed';
const LOGOUT_KEY = '__logout__';
// Sentinel key for the "jump back to my own workspace" link shown while a user
// with a workspace is browsing a different storefront (e.g. a manager on /panel/).
const MY_WORKSPACE_KEY = '__my_workspace__';
// Sentinel key for a manager's "switch to the original panel" link, shown while
// the manager is on their own workspace (lets them resell the admin store).
const ADMIN_STORE_KEY = '__admin_store__';

// The manager role's permission set (mirrors RoleManager in model/rbac.go). When
// an admin VIEWS a workspace as admin (impersonation), the sidebar is gated by
// this instead of the admin's all-permissions, so it shows the workspace owner's
// nav (Products, Customers, Workspace settings/payments, Finance, Support…) and
// NOT admin-only tools (Managers, Users, Inbounds, Settings).
const MANAGER_PERMS: ReadonlySet<string> = new Set([
    'product.manage', 'product.view', 'product.purchase',
    'client.manage', 'customer.view', 'order.view_all', 'order.view_own',
    'balance.view_own', 'balance.manage', 'deposit.manage', 'finance.view_all',
    'ticket.create', 'ticket.view_own', 'ticket.manage', 'ticket.admin',
    'tenant.settings', 'tenant.payments', 'tenant.users'
]);

type IconName =
  | 'dashboard' | 'inbound' | 'team' | 'groups' | 'users' | 'profile'
  | 'billing' | 'setting' | 'tool' | 'cluster' | 'logout' | 'apidocs' | 'store'
  | 'orders' | 'products' | 'services' | 'referral' | 'manualDeposit' | 'manualDeposits'
  | 'tickets' | 'support' | 'finance' | 'managers' | 'workspace' | 'home';

const iconByName: Record<IconName, LucideIcon> = {
    dashboard: LayoutDashboard,
    inbound: Import,
    team: Users,
    groups: Tags,
    users: IdCard,
    profile: User,
    billing: Wallet,
    setting: Settings,
    tool: Wrench,
    cluster: Network,
    logout: LogOut,
    apidocs: Plug,
    store: ShoppingBag,
    orders: ShoppingCart,
    products: LayoutGrid,
    services: Server,
    referral: Share2,
    manualDeposit: Banknote,
    manualDeposits: ClipboardCheck,
    tickets: Ticket,
    support: LifeBuoy,
    finance: Landmark,
    managers: Building2,
    workspace: Palette,
    home: Home
};

interface NavTab {
  key: string;
  icon: IconName;
  title: string;
}

interface SubItem {
  key: string;
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
}

// Sidebar sections, in display order. Each nav item maps to one (sectionOf); the
// renderer groups items under a small labelled header so every role's menu reads
// as logical clusters (Manage / Commerce / Administration / Support / Account)
// instead of one long flat list. The "main" section (dashboard + cross-store
// shortcuts) has no header. Empty sections are skipped per role.
const SECTION_ORDER = ['main', 'manage', 'commerce', 'admin', 'support', 'account'] as const;
type SectionKey = (typeof SECTION_ORDER)[number];

function sectionOf(key: string): SectionKey
{
    switch (key)
    {
        case '/inbounds': case '/clients': case '/groups': case '/nodes': case '/products':
            return 'manage';
        case '/store': case '/services': case '/orders': case '/customers': case '/referral': case '/admin-referrals': case '/manual-deposits':
            return 'commerce';
        case '/users': case '/managers': case '/tenant-users': case '/workspace-settings': case '/workspace-payments': case '/finance': case '/settings': case '/xray': case '/api-docs':
            return 'admin';
        case '/support': case '/tickets':
            return 'support';
        case '/billing': case '/manual-deposit': case '/profile':
            return 'account';
        default:
            return 'main';
    }
}

function readCollapsed(): boolean
{
    try
    {
        return JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || 'false');
    }
    catch
    {
        return false;
    }
}

interface AppSidebarProps {
  /** Controlled mobile-drawer open state (lifted to PageShell so the top navbar's
   *  hamburger can open it). */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

export default function AppSidebar({ drawerOpen, setDrawerOpen }: AppSidebarProps)
{
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { pathname, hash } = useLocation();
    const { allSetting } = useAllSettings();
    const { me } = useMe();
    const { format: formatMoney } = useCurrency();
    const showBilling = !!me?.zarinpalEnable;
    const showSubFormats = !!(allSetting.subJsonEnable || allSetting.subClashEnable);

    // Storefront context (mirrors PanelLayout). The URL decides which store we're
    // viewing: /panel/ is the admin store, /manager/<slug> is that manager's
    // store. Management nav (catalog, customers, workspace settings/payments,
    // finance, admin tools) only appears on the caller's OWN store; on any other
    // storefront only the browse-&-buy subset shows. An admin impersonating a
    // workspace operates under that workspace's prefix (so it counts as "own").
    const imp = me?.isAdmin ? getImpersonation() : null;
    const urlSlug = pathname.match(/^\/manager\/([^/]+)/)?.[1] ?? '';
    const homeSlug = imp ? imp.slug : (me && !me.isAdmin ? (me.tenantSlug || '') : '');
    const onOwnStore = homeSlug ? (urlSlug === homeSlug) : !urlSlug;
    // The real admin on the global panel (NOT impersonating a workspace). They
    // MANAGE the catalog/clients, so the personal buyer items (Store, Services,
    // own top-up/manual deposit) are redundant noise and are hidden for them.
    // While impersonating, the admin sees the workspace exactly as its owner would.
    const realAdmin = !!me?.isAdmin && !imp;
    const impersonating = !!imp;
    // A customer's wallet is per-workspace: on a storefront that is NOT their own
    // (e.g. a tenant-0 customer on a manager's store), their balance is neither
    // shown nor usable. Managers/admins are exempt (they transact cross-workspace).
    const onForeignStore = !!me && !me.isAdmin && !me.isManager && !onOwnStore;
    // Navigation stays inside whichever storefront the URL is on.
    const navPrefix = urlSlug ? `/manager/${ urlSlug }` : '';

    // Configurable brand/title. Prefer the freshly-loaded value from /me; fall
    // back to the cached one (so it renders before /me resolves). Cache it so the
    // pre-auth login/register screens show the same brand on next visit.
    const brandTitle = me?.panelTitle?.trim() || BrandManager.getTitle();
    useEffect(() =>
    {
        if (me?.panelTitle)
        {
            BrandManager.setTitle(me.panelTitle);
        }
    }, [me?.panelTitle]);

    const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());

    const tabs = useMemo<NavTab[]>(() =>
    {
    // The menu is built from the caller's permission set (mirrors the backend
    // matrix in database/model/rbac.go). The backend independently enforces the
    // same gating on every route/API — this only decides what to render.
        // While impersonating, render the workspace owner's (manager's) menu, not
        // the admin's — the admin is viewing the panel AS that manager.
        const has = (p: Permission): boolean =>
        {
            if (!me)
            {
                return false;
            }
            if (impersonating)
            {
                return MANAGER_PERMS.has(p);
            }
            return me.isAdmin || me.permissions.includes(p);
        };
        const items: NavTab[] = [];
        const push = (cond: boolean, key: string, icon: IconName, titleKey: string) =>
        {
            if (cond)
            {
                items.push({ key, icon, title: t(titleKey) });
            }
        };

        // The list is ordered by domain so each role reads top-to-bottom naturally,
        // and every role's landing page (homeFor in PanelLayout) is its first
        // visible item: admin -> Overview, moderator -> Products, reseller ->
        // Clients, member -> Store.

        // Management items only appear on the caller's OWN storefront — browsing
        // another store (a manager on /panel/, a customer on a foreign store) hides
        // them, leaving only the browse-&-buy subset below.
        const mng = (p: Permission): boolean => has(p) && onOwnStore;

        // 0) Cross-store shortcuts (top of the menu, mutually exclusive):
        //   - browsing a different store -> jump back to your own workspace;
        //   - a manager on their own workspace -> switch to the original panel
        //     (to resell the admin store's products with their own balance).
        push(!!homeSlug && !onOwnStore, MY_WORKSPACE_KEY, 'workspace', 'menu.myWorkspace');
        push(!!me?.isManager && onOwnStore, ADMIN_STORE_KEY, 'home', 'menu.originalPanel');

        // 1) Overview (admin).
        push(mng('stats.view_all'), '/', 'dashboard', 'menu.dashboard');

        // 2) Infrastructure (admin): inbounds, clients, groups, nodes.
        push(mng('infra.manage'), '/inbounds', 'inbound', 'menu.inbounds');
        push(mng('client.manage'), '/clients', 'team', 'menu.clients'); // admin + moderator
        push(mng('infra.manage'), '/groups', 'groups', 'menu.groups');
        push(mng('infra.manage'), '/nodes', 'cluster', 'menu.nodes');

        // 3) Commerce: catalog -> store -> my services -> orders -> customers.
        push(mng('product.manage'), '/products', 'products', 'menu.products');   // admin, moderator — own catalog
        // Personal buyer items: useful to resellers/members/managers, redundant for
        // the real admin (who manages the catalog + clients directly).
        // Managers manage their catalog via the Products page; the storefront /store
        // (which lists all of a workspace's products for buying) is for customers, so
        // it's hidden from the workspace owner.
        // Hide the storefront from a manager only on their OWN workspace (their own
        // products live on the Products page). When browsing the admin/another store
        // they DO see it, so they can resell those products with their own balance.
        // Store is visible to EVERY role (browse + buy). Managers/admins see it on
        // their own storefront too; buyers browsing a foreign store still see it.
        push(has('product.view'), '/store', 'store', 'menu.store');
        push(has('product.purchase') && !realAdmin, '/services', 'services', 'menu.services');
        push(has('order.view_own'), '/orders', 'orders', 'menu.orders');         // own orders / oversight
        push(Boolean(me?.isReseller) && onOwnStore, '/customers', 'team', 'menu.customers'); // reseller — referred customers
        // Referral dashboard: a reseller's own link/stats (members/managers don't
        // get a code, so it's reseller-only — admins use the management page below).
        push(Boolean(me?.isReseller) && onOwnStore, '/referral', 'referral', 'menu.referral');
        // Admin referral management: set/enable reseller codes + view stats.
        push(Boolean(me?.isAdmin), '/admin-referrals', 'referral', 'menu.adminReferrals');
        // Manual card-to-card deposit review queue (admin).
        push(mng('deposit.manage'), '/manual-deposits', 'manualDeposits', 'menu.manualDeposits');

        // 4) Administration (admin): users, reports, settings, xray, API docs.
        push(mng('user.manage'), '/users', 'users', 'menu.users');
        push(mng('manager.admin'), '/managers', 'managers', 'menu.managers'); // admin — manager workspaces
        push(mng('tenant.users'), '/tenant-users', 'users', 'menu.tenantUsers'); // manager — own customers
        push(mng('tenant.settings'), '/workspace-settings', 'workspace', 'menu.workspaceSettings'); // manager — own workspace
        push(mng('tenant.payments'), '/workspace-payments', 'billing', 'menu.workspacePayments'); // manager — own gateways
        push(mng('finance.view_all'), '/finance', 'finance', 'menu.finance'); // admin + moderator
        push(mng('infra.manage'), '/settings', 'setting', 'menu.settings');
        push(mng('infra.manage'), '/xray', 'tool', 'menu.xray');
        push(mng('infra.manage'), '/api-docs', 'apidocs', 'menu.apiDocs');

        // 5) Account: top-up (when a gateway is on and the caller can purchase),
        // manual deposit (any buyer), profile, logout — always at the bottom.
        push(showBilling && has('product.purchase') && !realAdmin, '/billing', 'billing', 'menu.billing');
        push(has('product.purchase') && !realAdmin, '/manual-deposit', 'manualDeposit', 'menu.manualDeposit');
        // Support / helpdesk: the staff dashboard, then tickets (every role).
        push(mng('ticket.manage'), '/support', 'support', 'menu.support');
        push(has('ticket.view_own'), '/tickets', 'tickets', 'menu.tickets');
        items.push({ key: '/profile', icon: 'profile', title: t('menu.profile') });
        items.push({ key: LOGOUT_KEY, icon: 'logout', title: t('logout') });
        return items;
    }, [t, me, showBilling, onOwnStore, homeSlug, realAdmin, impersonating]);

    const navItems = useMemo(() => tabs.filter((tab) => tab.icon !== 'logout'), [tabs]);
    const utilItems = useMemo(() => tabs.filter((tab) => tab.icon === 'logout'), [tabs]);

    const settingsChildren = useMemo<SubItem[]>(() =>
    {
        const children: SubItem[] = [
            { key: '/settings#general', icon: Settings, label: t('pages.settings.panelSettings') },
            { key: '/settings#security', icon: ShieldCheck, label: t('pages.settings.securitySettings') },
            { key: '/settings#manager', icon: Wallet, label: t('pages.settings.managerSettings') },
            { key: '/settings#payments', icon: CreditCard, label: t('pages.settings.paymentsSettings') },
            { key: '/settings#manual-deposit', icon: Banknote, label: t('pages.settings.manualDepositSettings') },
            { key: '/settings#ticket-categories', icon: Ticket, label: t('pages.settings.ticketCategoriesSettings') },
            { key: '/settings#telegram', icon: MessageSquare, label: t('pages.settings.TGBotSettings') },
            { key: '/settings#email', icon: Mail, label: t('pages.settings.emailSettings') },
            { key: '/settings#subscription', icon: Cloud, label: t('pages.settings.subSettings') }
        ];
        if (showSubFormats)
        {
            children.push({ key: '/settings#subscription-formats', icon: Code, label: 'Sub Formats' });
        }
        return children;
    }, [t, showSubFormats]);

    const xrayChildren = useMemo<SubItem[]>(() => [
        { key: '/xray#basic', icon: Settings, label: t('pages.xray.basicTemplate') },
        { key: '/xray#routing', icon: ArrowLeftRight, label: t('pages.xray.Routings') },
        { key: '/xray#outbound', icon: Upload, label: t('pages.xray.Outbounds') },
        { key: '/xray#balancer', icon: Network, label: t('pages.xray.Balancers') },
        { key: '/xray#dns', icon: Database, label: 'DNS' },
        { key: '/xray#advanced', icon: Code, label: t('pages.xray.advancedTemplate') }
    ], [t]);

    // The nav item keys are logical (/products, …) while the URL may carry a
    // /manager/<slug> prefix; strip it so active-state matching works (navPrefix
    // is computed above from the current storefront URL).
    const logicalPath = navPrefix && pathname.startsWith(navPrefix)
        ? (pathname.slice(navPrefix.length) || '/')
        : pathname;

    const settingsActive = logicalPath === '/settings';
    const xrayActive = logicalPath === '/xray';
    const selectedKey = settingsActive
        ? `/settings${ hash || '#general' }`
        : xrayActive
            ? `/xray${ hash || '#basic' }`
            : (logicalPath === '' ? '/' : logicalPath);

    const openSubmenu = settingsActive ? '/settings' : xrayActive ? '/xray' : null;
    const [openKeys, setOpenKeys] = useState<string[]>(() => (openSubmenu ? [openSubmenu] : []));
    useEffect(() =>
    {
        if (openSubmenu)
        {
            setOpenKeys((keys) => (keys.includes(openSubmenu) ? keys : [...keys, openSubmenu]));
        }
    }, [openSubmenu]);

    const toggleSubmenu = useCallback((key: string) =>
    {
        setOpenKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
    }, []);

    const openLink = useCallback(async (key: string) =>
    {
        if (key === LOGOUT_KEY)
        {
            await HttpUtil.post('/logout');
            window.location.href = window.Q_UI_BASE_PATH || '/';
            return;
        }
        if (key === MY_WORKSPACE_KEY)
        {
            // Jump out of the current store back into the user's own workspace;
            // PanelLayout then lands them on their workspace home page.
            navigate(`/manager/${ homeSlug }`);
            return;
        }
        if (key === ADMIN_STORE_KEY)
        {
            // Leave the workspace prefix entirely: the bare panel root is the
            // original admin store; PanelLayout lands the manager on /panel/store.
            navigate('/');
            return;
        }
        // Keep navigation inside the current storefront's /<slug> context.
        navigate(`${ navPrefix }${ key }`);
    }, [navigate, navPrefix, homeSlug]);

    const toggleCollapsed = useCallback(() =>
    {
        setCollapsed((prev) =>
        {
            const next = !prev;
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
            return next;
        });
    }, []);

    // Close the mobile drawer on Escape.
    useEffect(() =>
    {
        if (!drawerOpen)
        {
            return;
        }
        const onKey = (e: KeyboardEvent) =>
        {
            if (e.key === 'Escape')
            {
                setDrawerOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [drawerOpen, setDrawerOpen]);

    const childOf = useCallback((key: string): SubItem[] | null =>
    {
        if (key === '/settings')
        {
            return settingsChildren;
        }
        if (key === '/xray')
        {
            return xrayChildren;
        }
        return null;
    }, [settingsChildren, xrayChildren]);

    // Renders the icon+label nav rows for a list of tabs. `expandable` controls
    // whether settings/xray show their collapsible sub-rows (collapsed sider in
    // icon-only mode hides them; the drawer always expands).
    const renderItems = useCallback((
        items: NavTab[],
        { expandable, iconOnly, onNavigate }: { expandable: boolean; iconOnly: boolean; onNavigate?: () => void }
    ) => items.map((tab) =>
    {
        const Icon = iconByName[tab.icon];
        const children = expandable ? childOf(tab.key) : null;
        const isActive = selectedKey === tab.key || (children ? logicalPath === tab.key : false);
        const isOpen = openKeys.includes(tab.key);

        const rowClasses = cn(
            'group flex w-full items-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            iconOnly ? 'h-10 justify-center px-0' : 'h-10 gap-3 px-3',
            isActive
                ? 'bg-accent-subtle text-accent'
                : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
        );

        const handleClick = () =>
        {
            if (children && !iconOnly)
            {
                toggleSubmenu(tab.key);
                return;
            }
            openLink(tab.key);
            onNavigate?.();
        };

        return (
      <li key={tab.key}>
        <button
          type="button"
          className={rowClasses}
          aria-current={isActive ? 'page' : undefined}
          aria-expanded={children && !iconOnly ? isOpen : undefined}
          title={iconOnly ? tab.title : undefined}
          onClick={handleClick}
        >
          <Icon className="h-[18px] w-[18px] flex-shrink-0" />
          {!iconOnly && <span className="min-w-0 flex-1 truncate text-start">{tab.title}</span>}
          {children && !iconOnly && (
            <ChevronDown className={cn('h-4 w-4 flex-shrink-0 transition-transform', isOpen && 'rotate-180')} />
          )}
        </button>

        {children && !iconOnly && isOpen && (
          <ul className="mt-0.5 space-y-0.5 ps-3">
            {children.map((child) =>
            {
                const ChildIcon = child.icon;
                const childActive = selectedKey === child.key;
                return (
                <li key={child.key}>
                  <button
                    type="button"
                    className={cn(
                        'flex h-9 w-full items-center gap-3 rounded-md ps-6 pe-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        childActive
                            ? 'bg-accent-subtle text-accent'
                            : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
                    )}
                    aria-current={childActive ? 'page' : undefined}
                    onClick={() =>
                    {
                        openLink(child.key); onNavigate?.();
                    }}
                  >
                    <ChildIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-start">{child.label}</span>
                  </button>
                </li>
                );
            })}
          </ul>
        )}
      </li>
        );
    }), [childOf, selectedKey, logicalPath, openKeys, toggleSubmenu, openLink]);

    // Renders nav items grouped into labelled sections (see SECTION_ORDER). When
    // collapsed (iconOnly) a thin divider stands in for the text header so the icon
    // rail still reads as clusters. Empty sections produce nothing.
    const renderGrouped = useCallback((
        items: NavTab[],
        opts: { expandable: boolean; iconOnly: boolean; onNavigate?: () => void }
    ): ReactNode[] => SECTION_ORDER.flatMap((sec) =>
    {
        const secItems = items.filter((it) => sectionOf(it.key) === sec);
        if (secItems.length === 0)
        {
            return [] as ReactNode[];
        }
        const out: ReactNode[] = [];
        if (sec !== 'main')
        {
            out.push(
                opts.iconOnly
                    ? <li key={`sec-${ sec }`} aria-hidden="true" className="mx-2 my-2 border-t border-border/60" />
                    : <li key={`sec-${ sec }`} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t(`menu.sections.${ sec }`)}</li>
            );
        }
        out.push(...renderItems(secItems, opts));
        return out;
    }), [renderItems, t]);

    // Buyers (admin/reseller/member) can top up; for them the balance chip is a
    // button that jumps straight to the deposit page — the primary money action,
    // one click from anywhere. Non-buyers (moderator) get the static chip.
    const canTopUp = !!me && (me.isAdmin || me.permissions.includes('product.purchase'));

    const balanceChip = (iconOnly: boolean) =>
    {
        if (!me || onForeignStore)
        {
            return null;
        }
        const base = cn(
            'flex items-center gap-2 rounded-md border border-accent-subtle bg-accent-subtle/60 text-[13px] font-medium text-muted-foreground',
            iconOnly ? 'justify-center px-0 py-2' : 'px-3 py-2'
        );
        // Managers see TWO balances: the workspace pool (prepaid bandwidth the admin
        // funds, depleted by cost-of-goods) and their personal wallet (sales revenue
        // / profit). Both are read-only here.
        if (me.isManager)
        {
            const rows = [
                { label: t('pages.managers.workspaceBalance'), val: formatMoney(me.workspaceBalance) },
                { label: t('balance'), val: formatMoney(me.balance) }
            ];
            if (iconOnly)
            {
                return (
            <div className={base} title={rows.map((r) => `${ r.label }: ${ r.val }`).join(' · ')}>
              <Wallet className="h-4 w-4 flex-shrink-0 text-accent" />
            </div>
                );
            }
            return (
          <div className={cn(base, 'flex-col items-start gap-1')}>
            {rows.map((r) => (
              <span key={r.label} className="flex w-full min-w-0 items-center gap-2 truncate">
                <Wallet className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                <span className="truncate">{r.label}: <strong className="font-semibold text-foreground">{r.val}</strong></span>
              </span>
            ))}
          </div>
            );
        }
        const inner = (
        <>
          <Wallet className="h-4 w-4 flex-shrink-0 text-accent" />
          {!iconOnly && (
            <span className="min-w-0 truncate">
              {t('balance')}: <strong className="font-semibold text-foreground">{formatMoney(me.balance)}</strong>
            </span>
          )}
        </>
        );
        if (!canTopUp)
        {
            return (
        <div className={base} title={`${ t('balance') }: ${ formatMoney(me.balance) }`}>
          {inner}
        </div>
            );
        }
        return (
      <button
        type="button"
        className={cn(
            base,
            'w-full cursor-pointer transition-colors hover:bg-accent-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        title={`${ t('balance') }: ${ formatMoney(me.balance) } — ${ t('menu.manualDeposit') }`}
        aria-label={`${ t('balance') }: ${ formatMoney(me.balance) }. ${ t('menu.manualDeposit') }`}
        onClick={() =>
        {
            setDrawerOpen(false);
            navigate('/manual-deposit');
        }}
      >
        {inner}
      </button>
        );
    };

    return (
    <>
      {/* Desktop / tablet sticky sidebar (md+). */}
      <aside
        className={cn(
            'sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-surface md:flex',
            collapsed ? 'w-16' : 'w-56'
        )}
      >
        <div className={cn('flex h-14 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'ps-4 pe-2')}>
          {me?.brandLogo ? (
            <img
              src={me.brandLogo}
              alt={brandTitle}
              className={cn('object-contain', collapsed ? 'h-8 w-8' : 'h-8 max-w-[150px]')}
            />
          ) : (
            <span className="select-none text-lg font-semibold tracking-wide text-foreground">
              {collapsed ? (brandTitle.slice(0, 1) || 'Q') : brandTitle}
            </span>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          <ul className="space-y-0.5">
            {renderGrouped(navItems, { expandable: true, iconOnly: collapsed })}
          </ul>
        </nav>

        {utilItems.length > 0 && (
          <div className="border-t border-border p-2">
            <ul className="space-y-0.5">
              {renderItems(utilItems, { expandable: false, iconOnly: collapsed })}
            </ul>
          </div>
        )}

        {me && (
          <div className="px-2 pb-2">
            {balanceChip(collapsed)}
          </div>
        )}

        <button
          type="button"
          className="flex h-10 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-label={t('menu.operate')}
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
        >
          {/* rtl:rotate-180 — in RTL the sidebar is on the right, so the collapse/
              expand arrow must point the opposite physical direction. */}
          {collapsed ? <ChevronsRight className="h-4 w-4 rtl:rotate-180" /> : <ChevronsLeft className="h-4 w-4 rtl:rotate-180" />}
        </button>
      </aside>

      {/* Mobile slide-in drawer (opened from the top navbar's hamburger). */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[1200] md:hidden">
          <div
            className="absolute inset-0 bg-black/50 motion-safe:animate-[fade-in_150ms_ease-out]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 start-0 flex w-[min(82vw,320px)] flex-col border-e border-border bg-surface shadow-lg motion-safe:animate-[drawer-in_220ms_var(--ease-out)]"
          >
            <div className="flex h-14 items-center justify-between border-b border-border ps-4 pe-2">
              <span className="select-none text-lg font-semibold tracking-wide text-foreground">{brandTitle}</span>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('close')}
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
              <ul className="space-y-0.5">
                {renderGrouped(navItems, { expandable: true, iconOnly: false, onNavigate: () => setDrawerOpen(false) })}
              </ul>
            </nav>

            {utilItems.length > 0 && (
              <div className="border-t border-border p-2">
                <ul className="space-y-0.5">
                  {renderItems(utilItems, { expandable: false, iconOnly: false, onNavigate: () => setDrawerOpen(false) })}
                </ul>
              </div>
            )}

            {me && (
              <div className="px-2 pb-3">
                {balanceChip(false)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
    );
}
