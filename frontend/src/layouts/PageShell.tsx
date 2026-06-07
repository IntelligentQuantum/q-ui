import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ConfigProvider, Layout, message } from 'antd';

import { useTheme } from '@/hooks/useTheme';
import { usePageTitle } from '@/hooks/usePageTitle';
import { setMessageInstance } from '@/utils/messageBus';
import AppSidebar from '@/layouts/AppSidebar';

// PageShell is the standard panel page chrome: themed ConfigProvider + the
// sidebar + the content-shell/content-area layout that every existing page
// (e.g. UsersPage) composes itself. New pages render their content inside it so
// they match the rest of the panel (sidebar, theme tokens, spacing).
export default function PageShell({ name, children }: { name: string; children: ReactNode }) {
  usePageTitle();
  const { isDark, isUltra, antdThemeConfig } = useTheme();

  // One themed message instance for the page, also registered as the global
  // instance so HttpUtil's auto-toasts and getMessage() calls render here with
  // the right theme/position (instead of the static fallback).
  const [messageApi, messageHolder] = message.useMessage();
  useEffect(() => { setMessageInstance(messageApi); }, [messageApi]);

  const pageClass = useMemo(() => {
    const classes = [name];
    if (isDark) classes.push('is-dark');
    if (isUltra) classes.push('is-ultra');
    return classes.join(' ');
  }, [name, isDark, isUltra]);

  return (
    <ConfigProvider theme={antdThemeConfig} direction={document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'}>
      {messageHolder}
      <Layout className={pageClass}>
        <AppSidebar />
        <Layout className="content-shell">
          <Layout.Content id="content-layout" className="content-area">
            {children}
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
