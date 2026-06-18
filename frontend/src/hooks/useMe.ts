import { useQuery } from '@tanstack/react-query';

import { HttpUtil } from '@/utils';

// Role names mirror the backend's canonical roles (database/model: admin,
// manager, moderator, reseller, member). The backend is the source of truth;
// these are only used to drive presentation.
export type Role = 'admin' | 'manager' | 'reseller' | 'member';

// Permission strings mirror database/model/rbac.go. Keep in sync with the
// backend matrix; the backend independently enforces every one.
export type Permission =
  | 'infra.manage'
  | 'user.manage'
  | 'balance.manage'
  | 'stats.view_all'
  | 'transaction.view_all'
  | 'deposit.manage'
  | 'finance.view_all'
  | 'ticket.create'
  | 'ticket.view_own'
  | 'ticket.manage'
  | 'ticket.admin'
  | 'product.manage'
  | 'product.view'
  | 'product.purchase'
  | 'client.manage'
  | 'customer.view'
  | 'order.view_all'
  | 'order.view_own'
  | 'balance.view_own'
  | 'tenant.settings'
  | 'tenant.payments'
  | 'tenant.users'
  | 'manager.admin';

export interface MeInfo {
  id: number;
  username: string;
  email: string;
  role: Role;
  permissions: Permission[];
  isAdmin: boolean;
  isManager: boolean;
  isReseller: boolean;
  isMember: boolean;
  // Multi-tenancy: the user's home workspace. tenantId 0 = global/admin scope
  // (no workspace); a manager and their sub-users carry their tenant id + slug.
  tenantId: number;
  tenantSlug: string;
  // Workspace branding (tenant users only; empty for the global/admin scope).
  brandLogo: string;
  brandFavicon: string;
  brandTheme: string;
  balance: number;
  clientCost: number;
  clientCostPerGB: number;
  zarinpalEnable: boolean;
  currency: string;
  plisioEnable: boolean;
  plisioSourceCurrency: string;
  cryptoExchangeRate: number;
  cryptoBonusEnabled: boolean;
  cryptoBonusPercent: number;
  cryptoBonusMinDeposit: number;
  cryptoBonusMax: number;
  panelTitle: string;
}

export const ME_QUERY_KEY = ['me'] as const;

function normalizeRole(role: unknown): Role
{
    switch (String(role))
    {
        case 'admin':
        case 'manager':
        case 'reseller':
        case 'member':
            return role as Role;
        case 'moderator':
            return 'reseller'; // legacy alias — moderator role removed
        case 'user':
            return 'reseller'; // legacy alias
        default:
            return 'member';
    }
}

async function fetchMe(): Promise<MeInfo>
{
    const msg = await HttpUtil.get('/panel/api/me', undefined, { silent: true });
    if (!msg?.success || !msg.obj)
    {
        throw new Error(msg?.msg || 'Failed to load profile');
    }
    const o = msg.obj as Partial<MeInfo> & { permissions?: unknown };
    return {
        id: Number(o.id) || 0,
        username: String(o.username ?? ''),
        email: String(o.email ?? ''),
        role: normalizeRole(o.role),
        permissions: Array.isArray(o.permissions) ? (o.permissions as Permission[]) : [],
        isAdmin: Boolean(o.isAdmin),
        isManager: Boolean(o.isManager),
        isReseller: Boolean(o.isReseller),
        isMember: Boolean(o.isMember),
        tenantId: Number(o.tenantId) || 0,
        tenantSlug: String(o.tenantSlug ?? ''),
        brandLogo: String(o.brandLogo ?? ''),
        brandFavicon: String(o.brandFavicon ?? ''),
        brandTheme: String(o.brandTheme ?? ''),
        balance: Number(o.balance) || 0,
        clientCost: Number(o.clientCost) || 0,
        clientCostPerGB: Number(o.clientCostPerGB) || 0,
        zarinpalEnable: Boolean(o.zarinpalEnable),
        currency: String(o.currency ?? 'IRT'),
        plisioEnable: Boolean(o.plisioEnable),
        plisioSourceCurrency: String(o.plisioSourceCurrency ?? 'USD'),
        cryptoExchangeRate: Number(o.cryptoExchangeRate) || 1,
        cryptoBonusEnabled: Boolean(o.cryptoBonusEnabled),
        cryptoBonusPercent: Number(o.cryptoBonusPercent) || 0,
        cryptoBonusMinDeposit: Number(o.cryptoBonusMinDeposit) || 0,
        cryptoBonusMax: Number(o.cryptoBonusMax) || 0,
        panelTitle: String(o.panelTitle ?? '').trim() || 'Q-UI'
    };
}

/**
 * useMe loads the current session's identity, role, permission set, wallet
 * balance and per-client cost. It is the single source of truth the SPA uses to
 * gate navigation and hide UI. The backend independently enforces every one of
 * these — the hook only drives presentation. `can()` mirrors the backend's
 * User.Can(): admins implicitly hold every permission.
 */
export function useMe()
{
    const query = useQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: fetchMe,
        staleTime: 15_000
    });
    const me = query.data;
    const can = (perm: Permission): boolean =>
        !!me && (me.isAdmin || me.permissions.includes(perm));
    return {
        me,
        role: me?.role,
        can,
        isAdmin: me?.isAdmin,
        isManager: me?.isManager,
        tenantSlug: me?.tenantSlug ?? '',
        balance: me?.balance ?? 0,
        clientCost: me?.clientCost ?? 0,
        loading: query.isLoading,
        refetch: query.refetch
    };
}
