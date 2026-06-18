// Admin "view as workspace" state. When set, the axios layer attaches an
// `X-Tenant: <id>` header to every request; the backend tenant middleware honors
// it ONLY for admins (RequireAdmin elsewhere), scoping tenant-aware reads/writes
// to that workspace. Stored in sessionStorage so it's scoped to the tab and
// cleared on close. The logged-in identity stays the admin — this only redirects
// data scope, never elevates anyone.
const KEY = 'qui_impersonate';

export interface Impersonation {
  tenantId: number;
  slug: string;
}

export function getImpersonation(): Impersonation | null
{
    try
    {
        const raw = sessionStorage.getItem(KEY);
        if (!raw)
        {
            return null;
        }
        const v = JSON.parse(raw) as Partial<Impersonation>;
        if (typeof v.tenantId === 'number' && v.tenantId > 0 && typeof v.slug === 'string' && v.slug)
        {
            return { tenantId: v.tenantId, slug: v.slug };
        }
    }
    catch
    {
        /* ignore malformed state */
    }
    return null;
}

export function setImpersonation(tenantId: number, slug: string): void
{
    sessionStorage.setItem(KEY, JSON.stringify({ tenantId, slug }));
}

export function clearImpersonation(): void
{
    sessionStorage.removeItem(KEY);
}
