package middleware

import (
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"github.com/mhsanaei/3x-ui/v3/internal/web/tenant"

	"github.com/gin-gonic/gin"
)

// ResolveTenant determines the effective tenant for the request and stores it on
// the context (read everywhere via tenant.FromContext + model.TenantScope). It
// must run AFTER authentication so the logged-in user is known. The tenant is
// derived server-side only — the URL slug is never trusted as the authority.
//
// Resolution:
//   - admin: global scope (sees every tenant) by default; an explicit, admin-only
//     impersonation hint (`X-Tenant` header or `?tenant=` query) narrows to one
//     tenant for this request alone.
//   - everyone else (manager + their sub-users; legacy reseller/member in
//     tenant 0): confined to their own tenant. tenant_id 0 + non-global scope
//     reproduces today's single-tenant behavior exactly.
//
// Storefront view precedence: an explicit X-Workspace header (from the
// /panel/manager/<slug> URL) wins; otherwise the request's custom domain (Host →
// Tenant.Domain) selects the workspace, so a workspace served on its own domain
// shows its own catalog without any slug in the URL; otherwise the caller's home.
func ResolveTenant(ts *service.TenantService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := session.GetLoginUser(c)

		// 1. HOME / management scope — what MANAGEMENT ops use. Derived server-side
		// from the user (never the storefront), so a manager can only ever manage
		// their own workspace.
		homeID := model.GlobalTenantId
		homeGlobal := false
		switch {
		case user == nil:
			// Fail safe to the most restrictive scope.
		case user.IsAdmin():
			homeGlobal = true
			if id, ok := impersonationTarget(c); ok {
				if _, err := ts.GetByID(id); err == nil {
					homeID, homeGlobal = id, false // admin "view as workspace"
				}
			}
		default:
			homeID = user.TenantId
		}
		tenant.Set(c, homeID, homeGlobal)

		// 2. STOREFRONT view scope — which workspace's catalog the request is
		// browsing. Used ONLY for public catalog reads + purchases, so it's safe to
		// take from the client.
		if _, ok := c.Request.Header["X-Workspace"]; ok {
			// Explicit storefront from the /panel/manager/<slug> URL (or the
			// injected custom-domain workspace). Empty = the admin/global store.
			view := model.GlobalTenantId
			if slug := strings.TrimSpace(c.GetHeader("X-Workspace")); slug != "" {
				if t, err := ts.GetBySlug(slug); err == nil && t.Status == model.TenantActive {
					view = t.Id
				}
			}
			tenant.SetView(c, view)
		} else if dt := domainTenant(c, ts); dt != nil {
			// Served on a workspace's own custom domain (Host → Tenant.Domain): the
			// whole site IS that storefront, even with no slug in the URL.
			tenant.SetView(c, dt.Id)
		} else {
			// API-key / non-SPA caller: fall back to the caller's home tenant.
			tenant.SetView(c, homeID)
		}
		c.Next()
	}
}

// domainTenant resolves the request's Host to an ACTIVE tenant by its custom
// domain (Tenant.Domain), or nil when the Host is the main panel domain / not a
// registered workspace domain. The port, if any, is stripped first.
func domainTenant(c *gin.Context, ts *service.TenantService) *model.Tenant {
	host := c.Request.Host
	if i := strings.IndexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return nil
	}
	t, err := ts.GetByDomain(host)
	if err != nil || t.Status != model.TenantActive {
		return nil
	}
	return t
}

// impersonationTarget reads an admin's optional tenant-impersonation hint from
// the X-Tenant header (preferred) or a ?tenant= query param. Returns false when
// absent or not a positive tenant id.
func impersonationTarget(c *gin.Context) (int, bool) {
	raw := c.GetHeader("X-Tenant")
	if raw == "" {
		raw = c.Query("tenant")
	}
	if raw == "" {
		return 0, false
	}
	id, err := strconv.Atoi(raw)
	if err != nil || id <= model.GlobalTenantId {
		return 0, false
	}
	return id, true
}
