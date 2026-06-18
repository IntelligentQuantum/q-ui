import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { BrandManager } from '@/utils';

const TITLE_KEYS: Record<string, string> = {
    '/': 'menu.dashboard',
    '/inbounds': 'menu.inbounds',
    '/clients': 'menu.clients',
    '/groups': 'menu.groups',
    '/users': 'menu.users',
    '/profile': 'menu.profile',
    '/billing': 'menu.billing',
    '/nodes': 'menu.nodes',
    '/settings': 'menu.settings',
    '/xray': 'menu.xray',
    '/api-docs': 'menu.apiDocs',
    '/store': 'menu.store',
    '/orders': 'menu.orders',
    '/products': 'menu.products',
    '/services': 'menu.services',
    '/finance': 'menu.finance',
    '/tickets': 'menu.tickets',
    '/support': 'menu.support',
    '/referral': 'menu.referral',
    '/managers': 'menu.managers',
    '/tenant-users': 'menu.tenantUsers',
    '/workspace-settings': 'menu.workspaceSettings',
    '/workspace-payments': 'menu.workspacePayments',
    '/manual-deposit': 'menu.manualDeposit',
    '/manual-deposits': 'menu.manualDeposits'
};

// A workspace page lives under /manager/<slug>/…; strip that prefix so the title
// lookup uses the logical path. Without this, every page inside a manager
// workspace has no mapped title — and PageShell hides its whole header (and thus
// actions like the "Add product" button) when the title is null.
function logicalPath(pathname: string): string
{
    const m = pathname.match(/^\/manager\/[^/]+(\/.*)?$/);
    return m ? (m[1] || '/') : pathname;
}

export function usePageTitle()
{
    const { pathname } = useLocation();
    const { t } = useTranslation();

    useEffect(() =>
    {
        const key = TITLE_KEYS[logicalPath(pathname)];
        const title = key ? t(key) : BrandManager.getTitle();
        const host = window.location.hostname;
        document.title = host ? `${ host } - ${ title }` : title;
    }, [pathname, t]);
}

/** The translated title for the current route (same map as the document title),
 *  or null for unmapped routes. Used by PageShell to render a consistent header. */
export function usePageTitleText(): string | null
{
    const { pathname } = useLocation();
    const { t } = useTranslation();
    const key = TITLE_KEYS[logicalPath(pathname)];
    return key ? t(key) : null;
}
