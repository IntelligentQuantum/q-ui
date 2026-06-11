import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeftRight,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    Cloud,
    Code,
    CreditCard,
    Database,
    IdCard,
    Import,
    Languages,
    LayoutDashboard,
    LayoutGrid,
    LogOut,
    type LucideIcon,
    Menu as MenuIcon,
    MessageSquare,
    Moon,
    Network,
    Plug,
    Server,
    Settings,
    Share2,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    Sun,
    Tags,
    TrendingUp,
    Upload,
    User,
    Users,
    Wallet,
    Wrench,
    X
} from 'lucide-react';

import { HttpUtil, LanguageManager } from '@/utils';
import { pauseAnimationsUntilLeave, useTheme, type ThemeMode } from '@/hooks/useTheme';
import { useAllSettings } from '@/api/queries/useAllSettings';
import { useMe, type Permission } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { cn, DropdownMenu } from '@/components/ui';
import type { DropdownItem } from '@/components/ui';

const SIDEBAR_COLLAPSED_KEY = 'isSidebarCollapsed';
const LOGOUT_KEY = '__logout__';

type IconName =
  | 'dashboard' | 'inbound' | 'team' | 'groups' | 'users' | 'reports' | 'profile'
  | 'billing' | 'setting' | 'tool' | 'cluster' | 'logout' | 'apidocs' | 'store'
  | 'orders' | 'products' | 'services' | 'customers' | 'referral';

const iconByName: Record<IconName, LucideIcon> = {
    dashboard: LayoutDashboard,
    inbound: Import,
    team: Users,
    groups: Tags,
    users: IdCard,
    reports: TrendingUp,
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
    customers: Users,
    referral: Share2
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

const THEME_ICON: Record<ThemeMode, ReactNode> = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />
};

function ThemeCycleButton({ id, mode, onCycle, ariaLabel }: {
  id: string;
  mode: ThemeMode;
  onCycle: () => void;
  ariaLabel: string;
})
{
    const label = `${ ariaLabel }: ${ mode }`;
    return (
    <button
      id={id}
      type="button"
      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
      title={label}
      onClick={onCycle}
    >
      {THEME_ICON[mode]}
    </button>
    );
}

export default function AppSidebar()
{
    const { t } = useTranslation();
    const { mode, cycleMode } = useTheme();
    const navigate = useNavigate();
    const { pathname, hash } = useLocation();
    const { allSetting } = useAllSettings();
    const { me } = useMe();
    const { format: formatMoney } = useCurrency();
    const showBilling = !!me?.zarinpalEnable;
    const showSubFormats = !!(allSetting.subJsonEnable || allSetting.subClashEnable);

    const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage());

    // Panel language switcher (mirrors the one on the login page) so the UI
    // language can be changed from inside the dashboard, not only at login.
    const onLangChange = useCallback((next: string) =>
    {
        setLang(next);
        LanguageManager.setLanguage(next);
    }, []);
    const langItems = useMemo<DropdownItem[]>(
        () => (LanguageManager.supportedLanguages as { value: string; name: string; icon: string }[]).map((l) => ({
            key: l.value,
            label: (
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{l.icon}</span>
          <span>{l.name}</span>
          {l.value === lang ? <span className="ms-auto text-accent">•</span> : null}
        </span>
            ),
            onSelect: () => onLangChange(l.value)
        })),
        [lang, onLangChange]
    );

    const tabs = useMemo<NavTab[]>(() =>
    {
    // The menu is built from the caller's permission set (mirrors the backend
    // matrix in database/model/rbac.go). The backend independently enforces the
    // same gating on every route/API — this only decides what to render.
        const has = (p: Permission): boolean => !!me && (me.isAdmin || me.permissions.includes(p));
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

        // 1) Overview (admin).
        push(has('stats.view_all'), '/', 'dashboard', 'menu.dashboard');

        // 2) Infrastructure (admin): inbounds, clients, groups, nodes.
        push(has('infra.manage'), '/inbounds', 'inbound', 'menu.inbounds');
        push(has('client.manage'), '/clients', 'team', 'menu.clients'); // admin + reseller
        push(has('infra.manage'), '/groups', 'groups', 'menu.groups');
        push(has('infra.manage'), '/nodes', 'cluster', 'menu.nodes');

        // 3) Commerce: catalog -> store -> my services -> orders -> customers.
        push(has('product.manage'), '/products', 'products', 'menu.products');   // admin, moderator
        push(has('product.purchase'), '/store', 'store', 'menu.store');           // admin, reseller, member
        push(has('product.purchase'), '/services', 'services', 'menu.services');  // own configs — admin, reseller, member
        push(has('order.view_own'), '/orders', 'orders', 'menu.orders');         // anyone with order visibility
        push(has('customer.view') && !me?.isAdmin, '/customers', 'customers', 'menu.customers'); // mod, reseller
        // Referral dashboard: resellers (own link/stats) and admins (manage).
        push(Boolean(me?.isReseller || me?.isAdmin), '/referral', 'referral', 'menu.referral');

        // 4) Administration (admin): users, reports, settings, xray, API docs.
        push(has('user.manage'), '/users', 'users', 'menu.users');
        push(has('stats.view_all'), '/reports', 'reports', 'menu.reports');
        push(has('infra.manage'), '/settings', 'setting', 'menu.settings');
        push(has('infra.manage'), '/xray', 'tool', 'menu.xray');
        push(has('infra.manage'), '/api-docs', 'apidocs', 'menu.apiDocs');

        // 5) Account: top-up (when a gateway is on and the caller can purchase),
        // profile, logout — always at the bottom.
        push(showBilling && has('product.purchase'), '/billing', 'billing', 'menu.billing');
        items.push({ key: '/profile', icon: 'profile', title: t('menu.profile') });
        items.push({ key: LOGOUT_KEY, icon: 'logout', title: t('logout') });
        return items;
    }, [t, me, showBilling]);

    const navItems = useMemo(() => tabs.filter((tab) => tab.icon !== 'logout'), [tabs]);
    const utilItems = useMemo(() => tabs.filter((tab) => tab.icon === 'logout'), [tabs]);

    const settingsChildren = useMemo<SubItem[]>(() =>
    {
        const children: SubItem[] = [
            { key: '/settings#general', icon: Settings, label: t('pages.settings.panelSettings') },
            { key: '/settings#security', icon: ShieldCheck, label: t('pages.settings.securitySettings') },
            { key: '/settings#reseller', icon: Wallet, label: t('pages.settings.resellerSettings') },
            { key: '/settings#payments', icon: CreditCard, label: t('pages.settings.paymentsSettings') },
            { key: '/settings#telegram', icon: MessageSquare, label: t('pages.settings.TGBotSettings') },
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

    const settingsActive = pathname === '/settings';
    const xrayActive = pathname === '/xray';
    const selectedKey = settingsActive
        ? `/settings${ hash || '#general' }`
        : xrayActive
            ? `/xray${ hash || '#basic' }`
            : (pathname === '' ? '/' : pathname);

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
        navigate(key);
    }, [navigate]);

    const toggleCollapsed = useCallback(() =>
    {
        setCollapsed((prev) =>
        {
            const next = !prev;
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
            return next;
        });
    }, []);

    const cycleTheme = useCallback((id: string) =>
    {
        pauseAnimationsUntilLeave(id);
        cycleMode();
    }, [cycleMode]);

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
    }, [drawerOpen]);

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
        const isActive = selectedKey === tab.key || (children ? pathname === tab.key : false);
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
    }), [childOf, selectedKey, pathname, openKeys, toggleSubmenu, openLink]);

    const balanceChip = (iconOnly: boolean) => me && (
    <div
      className={cn(
          'flex items-center gap-2 rounded-md border border-accent-subtle bg-accent-subtle/60 text-[13px] font-medium text-muted-foreground',
          iconOnly ? 'justify-center px-0 py-2' : 'px-3 py-2'
      )}
      title={`${ t('balance') }: ${ formatMoney(me.balance) }`}
    >
      <Wallet className="h-4 w-4 flex-shrink-0 text-accent" />
      {!iconOnly && (
        <span className="min-w-0 truncate">
          {t('balance')}: <strong className="font-semibold text-foreground">{formatMoney(me.balance)}</strong>
        </span>
      )}
    </div>
    );

    return (
    <>
      {/* Desktop / tablet sticky sidebar (md+). */}
      <aside
        className={cn(
            'sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-surface md:flex',
            collapsed ? 'w-16' : 'w-56'
        )}
      >
        <div className={cn('flex h-14 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'justify-between ps-4 pe-2')}>
          <span className="select-none text-lg font-semibold tracking-wide text-foreground">
            {collapsed ? 'Q' : 'Q-UI'}
          </span>
          {!collapsed && (
            <div className="flex items-center gap-1">
              <DropdownMenu
                align="end"
                label={t('pages.settings.language')}
                items={langItems}
                trigger={<Languages className="h-[18px] w-[18px]" aria-hidden />}
              />
              <ThemeCycleButton
                id="theme-cycle"
                mode={mode}
                onCycle={() => cycleTheme('theme-cycle')}
                ariaLabel={t('menu.theme')}
              />
            </div>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          <ul className="space-y-0.5">
            {renderItems(navItems, { expandable: true, iconOnly: collapsed })}
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
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </aside>

      {/* Mobile hamburger handle. */}
      {!drawerOpen && (
        <button
          type="button"
          className="fixed top-3 left-3 z-[1100] inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-md transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label={t('menu.dashboard')}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      )}

      {/* Mobile slide-in drawer. */}
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
            className="absolute inset-y-0 left-0 flex w-[min(82vw,320px)] flex-col border-r border-border bg-surface shadow-lg motion-safe:animate-[drawer-in_220ms_var(--ease-out)]"
          >
            <div className="flex h-14 items-center justify-between border-b border-border ps-4 pe-2">
              <span className="select-none text-lg font-semibold tracking-wide text-foreground">Q-UI</span>
              <div className="inline-flex items-center gap-1">
                <DropdownMenu
                  align="end"
                  label={t('pages.settings.language')}
                  items={langItems}
                  trigger={<Languages className="h-[18px] w-[18px]" aria-hidden />}
                />
                <ThemeCycleButton
                  id="theme-cycle-drawer"
                  mode={mode}
                  onCycle={() => cycleTheme('theme-cycle-drawer')}
                  ariaLabel={t('menu.theme')}
                />
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('close')}
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
              <ul className="space-y-0.5">
                {renderItems(navItems, { expandable: true, iconOnly: false, onNavigate: () => setDrawerOpen(false) })}
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
