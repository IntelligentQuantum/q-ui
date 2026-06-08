import type { ReactNode } from 'react';

import { usePageTitle, usePageTitleText } from '@/hooks/usePageTitle';
import AppSidebar from '@/layouts/AppSidebar';
import { PageHeader, cn } from '@/components/ui';

interface PageShellProps {
  name?: string;
  /** Header title. Omit to derive from the route; pass null to hide the header. */
  title?: ReactNode | null;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

// PageShell is the standard panel page chrome: the sidebar + a consistent page
// header (title/description/actions) + the content-shell/content-area layout
// that every page renders its content inside. Pure Tailwind (RTL-safe logical
// props) — AppSidebar is a `sticky top-0 h-screen md:flex` flex child, so the
// flex-row wrapper sits it beside the content. The header title defaults to the
// current route's name so every page is titled consistently with no per-page
// wiring; pages may override it or pass actions.
export default function PageShell({ name, title, description, actions, children }: PageShellProps)
{
    usePageTitle();
    const routeTitle = usePageTitleText();
    const headerTitle = title === undefined ? routeTitle : title;

    return (
    <div className={cn('flex min-h-screen', name)}>
      <AppSidebar />
      <div className="content-shell flex min-w-0 flex-1 flex-col">
        <main
          id="content-layout"
          className="content-area flex-1 px-4 pb-8 pt-16 sm:px-6 sm:pb-10 md:p-8 lg:px-10 lg:py-9"
        >
          {headerTitle != null && <PageHeader title={headerTitle} description={description} actions={actions} />}
          {children}
        </main>
      </div>
    </div>
    );
}
