import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Drawer, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  CloseOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  CodeOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FundOutlined,
  GithubOutlined,
  IdcardOutlined,
  ImportOutlined,
  LogoutOutlined,
  MenuOutlined,
  MessageOutlined,
  WalletOutlined,
  MoonFilled,
  MoonOutlined,
  SafetyOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SunOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';

import { HttpUtil } from '@/utils';
import { pauseAnimationsUntilLeave, useTheme } from '@/hooks/useTheme';
import { useAllSettings } from '@/api/queries/useAllSettings';
import { useMe, type Permission } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import './AppSidebar.css';

const SIDEBAR_COLLAPSED_KEY = 'isSidebarCollapsed';
const REPO_URL = 'https://github.com/IntelligentQuantum/q-ui';
const LOGOUT_KEY = '__logout__';

type IconName = 'dashboard' | 'inbound' | 'team' | 'groups' | 'users' | 'reports' | 'profile' | 'billing' | 'setting' | 'tool' | 'cluster' | 'logout' | 'apidocs' | 'store' | 'orders' | 'products' | 'services' | 'customers';

const iconByName: Record<IconName, ComponentType> = {
  dashboard: DashboardOutlined,
  inbound: ImportOutlined,
  team: TeamOutlined,
  groups: TagsOutlined,
  users: IdcardOutlined,
  reports: FundOutlined,
  profile: UserOutlined,
  billing: WalletOutlined,
  setting: SettingOutlined,
  tool: ToolOutlined,
  cluster: ClusterOutlined,
  logout: LogoutOutlined,
  apidocs: ApiOutlined,
  store: ShoppingOutlined,
  orders: ShoppingCartOutlined,
  products: AppstoreOutlined,
  services: CloudServerOutlined,
  customers: TeamOutlined,
};

function readCollapsed(): boolean {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || 'false');
  } catch {
    return false;
  }
}

function VersionBadge({ version, collapsed }: { version: string; collapsed?: boolean }) {
  if (!version) return null;
  const label = `v${version}`;
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`sider-version${collapsed ? ' is-collapsed' : ''}`}
      aria-label={`GitHub ${label}`}
      title={label}
    >
      <GithubOutlined />
      {!collapsed && <span className="sider-version-text">{label}</span>}
    </a>
  );
}

function ThemeCycleButton({ id, isDark, isUltra, onCycle, ariaLabel }: {
  id: string;
  isDark: boolean;
  isUltra: boolean;
  onCycle: () => void;
  ariaLabel: string;
}) {
  const icon = !isDark ? <SunOutlined /> : !isUltra ? <MoonOutlined /> : <MoonFilled />;
  return (
    <button
      id={id}
      type="button"
      className="sidebar-theme-cycle"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onCycle}
    >
      {icon}
    </button>
  );
}

export default function AppSidebar() {
  const { t } = useTranslation();
  const { isDark, isUltra, toggleTheme, toggleUltra } = useTheme();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const { allSetting } = useAllSettings();
  const { me } = useMe();
  const { format: formatMoney } = useCurrency();
  const showBilling = !!me?.zarinpalEnable;
  const showSubFormats = !!(allSetting.subJsonEnable || allSetting.subClashEnable);

  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentTheme: 'light' | 'dark' = isDark ? 'dark' : 'light';
  const panelVersion = window.X_UI_CUR_VER || '';

  const tabs = useMemo<{ key: string; icon: IconName; title: string }[]>(() => {
    // The menu is built from the caller's permission set (mirrors the backend
    // matrix in database/model/rbac.go). The backend independently enforces the
    // same gating on every route/API — this only decides what to render.
    const has = (p: Permission): boolean => !!me && (me.isAdmin || me.permissions.includes(p));
    const items: { key: string; icon: IconName; title: string }[] = [];
    const push = (cond: boolean, key: string, icon: IconName, titleKey: string) => {
      if (cond) items.push({ key, icon, title: t(titleKey) });
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
    push(me?.isMember === true, '/services', 'services', 'menu.services');    // member's own configs
    push(has('order.view_own'), '/orders', 'orders', 'menu.orders');         // anyone with order visibility
    push(has('customer.view') && !me?.isAdmin, '/customers', 'customers', 'menu.customers'); // mod, reseller

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

  const settingsChildren = useMemo<NonNullable<MenuProps['items']>>(() => {
    const children: NonNullable<MenuProps['items']> = [
      { key: '/settings#general', icon: <SettingOutlined />, label: t('pages.settings.panelSettings') },
      { key: '/settings#security', icon: <SafetyOutlined />, label: t('pages.settings.securitySettings') },
      { key: '/settings#reseller', icon: <WalletOutlined />, label: t('pages.settings.resellerSettings') },
      { key: '/settings#telegram', icon: <MessageOutlined />, label: t('pages.settings.TGBotSettings') },
      { key: '/settings#subscription', icon: <CloudServerOutlined />, label: t('pages.settings.subSettings') },
    ];
    if (showSubFormats) {
      children.push({ key: '/settings#subscription-formats', icon: <CodeOutlined />, label: 'Sub Formats' });
    }
    return children;
  }, [t, showSubFormats]);

  const xrayChildren = useMemo<NonNullable<MenuProps['items']>>(() => [
    { key: '/xray#basic', icon: <SettingOutlined />, label: t('pages.xray.basicTemplate') },
    { key: '/xray#routing', icon: <SwapOutlined />, label: t('pages.xray.Routings') },
    { key: '/xray#outbound', icon: <UploadOutlined />, label: t('pages.xray.Outbounds') },
    { key: '/xray#balancer', icon: <ClusterOutlined />, label: t('pages.xray.Balancers') },
    { key: '/xray#dns', icon: <DatabaseOutlined />, label: 'DNS' },
    { key: '/xray#advanced', icon: <CodeOutlined />, label: t('pages.xray.advancedTemplate') },
  ], [t]);

  const settingsActive = pathname === '/settings';
  const xrayActive = pathname === '/xray';
  const selectedKey = settingsActive
    ? `/settings${hash || '#general'}`
    : xrayActive
      ? `/xray${hash || '#basic'}`
      : (pathname === '' ? '/' : pathname);

  const openSubmenu = settingsActive ? '/settings' : xrayActive ? '/xray' : null;
  const [openKeys, setOpenKeys] = useState<string[]>(() => (openSubmenu ? [openSubmenu] : []));
  useEffect(() => {
    if (openSubmenu) {
      setOpenKeys((keys) => (keys.includes(openSubmenu) ? keys : [...keys, openSubmenu]));
    }
  }, [openSubmenu]);

  const toMenuItems = useCallback((items: typeof tabs): MenuProps['items'] =>
    items.map((tab) => {
      const Icon = iconByName[tab.icon];
      if (tab.key === '/settings') {
        return { key: tab.key, icon: <Icon />, label: tab.title, children: settingsChildren };
      }
      if (tab.key === '/xray') {
        return { key: tab.key, icon: <Icon />, label: tab.title, children: xrayChildren };
      }
      return { key: tab.key, icon: <Icon />, label: tab.title };
    }),
  [settingsChildren, xrayChildren]);

  const openLink = useCallback(async (key: string) => {
    if (key === LOGOUT_KEY) {
      await HttpUtil.post('/logout');
      window.location.href = window.X_UI_BASE_PATH || '/';
      return;
    }
    navigate(key);
  }, [navigate]);

  const onMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(({ key }) => {
    openLink(String(key));
  }, [openLink]);

  const onSiderCollapse = useCallback((isCollapsed: boolean, type: 'clickTrigger' | 'responsive') => {
    if (type === 'clickTrigger') {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
      setCollapsed(isCollapsed);
    }
  }, []);

  const cycleTheme = useCallback((id: string) => {
    pauseAnimationsUntilLeave(id);
    if (!isDark) {
      toggleTheme();
      if (isUltra) toggleUltra();
    } else if (!isUltra) {
      toggleUltra();
    } else {
      toggleUltra();
      toggleTheme();
    }
  }, [isDark, isUltra, toggleTheme, toggleUltra]);

  return (
    <div className="ant-sidebar">
      <Layout.Sider
        theme={currentTheme}
        width={220}
        collapsible
        collapsed={collapsed}
        breakpoint="md"
        onCollapse={onSiderCollapse}
      >
        <div className={`sider-brand${collapsed ? ' sider-brand-collapsed' : ''}`}>
          <div className="brand-block">
            <span className="brand-text">{collapsed ? 'Q' : 'Q-UI'}</span>
          </div>
          {!collapsed && (
            <div className="brand-actions">
              <ThemeCycleButton
                id="theme-cycle"
                isDark={isDark}
                isUltra={isUltra}
                onCycle={() => cycleTheme('theme-cycle')}
                ariaLabel={t('menu.theme')}
              />
            </div>
          )}
        </div>
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={collapsed ? undefined : openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          className="sider-nav"
          items={toMenuItems(navItems)}
          onClick={onMenuClick}
        />
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          className="sider-utility"
          items={toMenuItems(utilItems)}
          onClick={onMenuClick}
        />
        <div className="sider-footer">
          {me && (
            <div className={`sider-balance${collapsed ? ' is-collapsed' : ''}`} title={`${t('balance')}: ${formatMoney(me.balance)}`}>
              <WalletOutlined />
              {!collapsed && <span className="sider-balance-text">{t('balance')}: <strong>{formatMoney(me.balance)}</strong></span>}
            </div>
          )}
        </div>
      </Layout.Sider>

      <Drawer
        placement="left"
        closable={false}
        open={drawerOpen}
        rootClassName={currentTheme}
        size="min(82vw, 320px)"
        styles={{
          wrapper: { padding: 0 },
          body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
          header: { display: 'none' },
        }}
        onClose={() => setDrawerOpen(false)}
      >
        <div className="drawer-header">
          <div className="brand-block">
            <span className="drawer-brand">Q-UI</span>
          </div>
          <div className="drawer-header-actions">
            <ThemeCycleButton
              id="theme-cycle-drawer"
              isDark={isDark}
              isUltra={isUltra}
              onCycle={() => cycleTheme('theme-cycle-drawer')}
              ariaLabel={t('menu.theme')}
            />
            <button
              className="drawer-close"
              type="button"
              aria-label={t('close')}
              onClick={() => setDrawerOpen(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        </div>
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          className="drawer-menu drawer-nav"
          items={toMenuItems(navItems)}
          onClick={(info) => { onMenuClick(info); setDrawerOpen(false); }}
        />
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          className="drawer-menu drawer-utility"
          items={toMenuItems(utilItems)}
          onClick={(info) => { onMenuClick(info); setDrawerOpen(false); }}
        />
        <div className="drawer-footer">
          {me && (
            <div className="sider-balance" title={`${t('balance')}: ${formatMoney(me.balance)}`}>
              <WalletOutlined />
              <span className="sider-balance-text">{t('balance')}: <strong>{formatMoney(me.balance)}</strong></span>
            </div>
          )}
        </div>
      </Drawer>

      {!drawerOpen && (
        <button
          className="drawer-handle"
          type="button"
          aria-label={t('menu.dashboard')}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuOutlined />
        </button>
      )}
    </div>
  );
}
