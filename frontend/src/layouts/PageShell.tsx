import { useState, type ReactNode } from 'react';

import { usePageTitle, usePageTitleText } from '@/hooks/usePageTitle';
import AppSidebar from '@/layouts/AppSidebar';
import Topbar from '@/layouts/Topbar';
import { PageHeader, cn } from '@/components/ui';

interface PageShellProps {
  name?: string;
  /** Header title. Omit to derive from the route; pass null to hide the header. */
  title?: ReactNode | null;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

// PageShell is the standard panel page chrome: the sticky sidebar (md+) / mobile
// drawer + a sticky top navbar (notifications, language, theme + the mobile
// hamburger) + the page header (title/description/actions) over the content area.
// Pure Tailwind, RTL-safe (logical props), mobile-first. The header title
// defaults to the current route's name so every page is titled consistently.
export default function PageShell({ name, title, description, actions, children }: PageShellProps)
{
    usePageTitle();
    const routeTitle = usePageTitleText();
    const headerTitle = title === undefined ? routeTitle : title;
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
    <div className={cn('flex min-h-screen', name)}>
      <AppSidebar drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} />
      <div className="content-shell flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <main
          id="content-layout"
          className="content-area flex-1 px-4 py-6 sm:px-6 sm:py-7 md:px-8 md:py-8 lg:px-10 lg:py-9"
        >
          {headerTitle != null && <PageHeader title={headerTitle} description={description} actions={actions} />}
          {children}
        </main>
      </div>
    </div>
    );
}
