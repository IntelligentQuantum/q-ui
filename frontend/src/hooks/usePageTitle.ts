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
    '/reports': 'menu.reports',
    '/profile': 'menu.profile',
    '/billing': 'menu.billing',
    '/nodes': 'menu.nodes',
    '/settings': 'menu.settings',
    '/xray': 'menu.xray',
    '/api-docs': 'menu.apiDocs',
    '/store': 'menu.store',
    '/orders': 'menu.orders',
    '/products': 'menu.products',
    '/services': 'menu.services'
};

export function usePageTitle()
{
    const { pathname } = useLocation();
    const { t } = useTranslation();

    useEffect(() =>
    {
        const key = TITLE_KEYS[pathname];
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
    const key = TITLE_KEYS[pathname];
    return key ? t(key) : null;
}
