import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useWebSocketBridge } from '@/api/websocketBridge';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe, type MeInfo } from '@/hooks/useMe';

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
        case '/reports':
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
        case '/clients':
            return has('client.manage'); // admin, moderator
        case '/products':
            return has('product.manage'); // admin, moderator
        case '/store':
        case '/billing':
            return has('product.purchase'); // admin, reseller, member
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
    if (me.isModerator)
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

    const { me } = useMe();
    const { pathname } = useLocation();
    const navigate = useNavigate();

    const home = me ? homeFor(me) : '/';
    const restricted = !!me && !canAccess(me, pathname);

    useEffect(() =>
    {
        if (restricted)
        {
            navigate(home, { replace: true });
        }
    }, [restricted, home, navigate]);

    // Avoid flashing a forbidden page for the frame before the redirect lands.
    if (restricted)
    {
        return null;
    }

    return <Outlet />;
}
