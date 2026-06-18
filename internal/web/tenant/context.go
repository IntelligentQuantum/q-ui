// Package tenant carries the per-request effective tenant on the gin.Context.
// The tenant is resolved once (by the tenant middleware, from the authenticated
// user / API key / admin impersonation — never from a client-supplied slug) and
// read everywhere else through FromContext, so scoping has a single source of
// truth. Pair the result with model.TenantScope to filter queries.
package tenant

import (
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"

	"github.com/gin-gonic/gin"
)

const (
	ctxTenantID     = "tenant_id"
	ctxTenantGlobal = "tenant_global"
	ctxViewID       = "view_tenant_id"
	ctxViewSet      = "view_tenant_set"
)

// Set records the effective tenant for this request. global==true means the
// caller (admin / tenant-0 scope) sees every tenant and queries are unfiltered.
func Set(c *gin.Context, tenantID int, global bool) {
	c.Set(ctxTenantID, tenantID)
	c.Set(ctxTenantGlobal, global)
}

// ScopeFrom builds the home/management model.Scope from the request context, for
// passing into tenant-scoped service methods. This is the user's OWN workspace
// (or global, for admin) and is what MANAGEMENT operations must use — never the
// client-supplied storefront, so a manager can only ever manage their own data.
func ScopeFrom(c *gin.Context) model.Scope {
	id, global := FromContext(c)
	return model.Scope{TenantID: id, Global: global}
}

// HomeScopeStrict returns the caller's HOME workspace as a CONCRETE tenant scope
// that is NEVER global "see-all". Use it for workspace-owned storefront resources
// that are isolated per workspace — bank cards, ticket categories — where the
// admin/tenant-0 panel is just one workspace (tenant 0), so the original panel
// never lists a manager's cards/categories. For managers this is identical to
// ScopeFrom (already concrete); only admin changes from see-all to tenant-0.
func HomeScopeStrict(c *gin.Context) model.Scope {
	id, _ := FromContext(c)
	return model.TenantOnly(id)
}

// SetView records the storefront workspace the request is browsing (from the
// /panel/manager/<slug> URL, conveyed by the X-Workspace header). It is
// client-driven and therefore only ever used for PUBLIC storefront reads
// (product catalog) and purchases — never for management/private data.
func SetView(c *gin.Context, viewTenantID int) {
	c.Set(ctxViewID, viewTenantID)
	c.Set(ctxViewSet, true)
}

// ViewTenantID returns the storefront tenant id the request is browsing. Falls
// back to the home tenant when no storefront was set.
func ViewTenantID(c *gin.Context) int {
	if v, ok := c.Get(ctxViewID); ok {
		if n, ok := v.(int); ok {
			return n
		}
	}
	id, _ := FromContext(c)
	return id
}

// ViewScope builds the storefront model.Scope (always tenant-scoped, never
// global — a storefront shows exactly one workspace's catalog). Use ONLY for
// product browsing and purchasing.
func ViewScope(c *gin.Context) model.Scope {
	return model.Scope{TenantID: ViewTenantID(c), Global: false}
}

// IsOwnStorefront reports whether the storefront being viewed is the caller's own
// management scope (their workspace, or global for admin) — i.e. they're managing
// rather than shopping someone else's store.
func IsOwnStorefront(c *gin.Context) bool {
	home, global := FromContext(c)
	if global {
		// Admin: "their own" storefront is the global/tenant-0 catalog.
		return ViewTenantID(c) == model.GlobalTenantId
	}
	return ViewTenantID(c) == home
}

// FromContext returns the effective tenant id and whether the caller has global
// scope. If the tenant middleware has not run (id unset), it fails safe to the
// global tenant with NON-global scope — i.e. the most restrictive interpretation
// (`tenant_id = 0`), never an accidental "see everything".
func FromContext(c *gin.Context) (tenantID int, global bool) {
	id := model.GlobalTenantId
	if v, ok := c.Get(ctxTenantID); ok {
		if n, ok := v.(int); ok {
			id = n
		}
	}
	if v, ok := c.Get(ctxTenantGlobal); ok {
		if b, ok := v.(bool); ok {
			global = b
		}
	}
	return id, global
}
