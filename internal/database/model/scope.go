package model

import "gorm.io/gorm"

// Scope is the request's effective tenant, carried from the controller (which
// reads it off the gin context via the tenant package) into the service layer.
// Passing this one value — instead of re-deriving the tenant in every service —
// keeps tenant isolation auditable: a reviewer can see exactly which queries are
// scoped. Build it with tenant.ScopeFrom(c).
type Scope struct {
	TenantID int
	Global   bool // admin / tenant-0 global scope: sees every tenant
}

// GlobalScope is the unrestricted scope (admin). Useful for internal callers
// (jobs, callbacks) that legitimately operate across all tenants.
var GlobalScope = Scope{TenantID: GlobalTenantId, Global: true}

// TenantOnly builds a scope confined to a single tenant (never global).
func TenantOnly(tenantID int) Scope { return Scope{TenantID: tenantID, Global: false} }

// ScopeForUser derives a user's effective scope from their identity alone (no
// request context): admins get the global scope; everyone else is confined to
// their own tenant. Use this for internal/service-to-service calls where the
// acting user is known but the gin context isn't threaded through (e.g. order
// provisioning). A nil user fails safe to the restrictive tenant-0 scope.
func ScopeForUser(u *User) Scope {
	if u == nil {
		return TenantOnly(GlobalTenantId)
	}
	if u.IsAdmin() {
		return GlobalScope
	}
	return TenantOnly(u.TenantId)
}

// Apply restricts a query to the scope's tenant (no-op when Global). Use as
// `s.Apply(db).Where(...)` or `db.Scopes(...)` equivalently.
func (s Scope) Apply(db *gorm.DB) *gorm.DB {
	return db.Scopes(TenantScope(s.TenantID, s.Global))
}

// ApplyCol restricts a query to the scope's tenant using an explicitly-qualified
// column (e.g. "o.tenant_id"). Use this for JOINed/aliased queries where the
// bare "tenant_id" of TenantScope would be ambiguous across joined tables.
func (s Scope) ApplyCol(db *gorm.DB, col string) *gorm.DB {
	if s.Global {
		return db
	}
	return db.Where(col+" = ?", s.TenantID)
}

// OwnerTenantID returns the tenant id a newly-created row should be stamped
// with for this scope. Global (admin) writes land in tenant 0; tenant-scoped
// writes land in that tenant.
func (s Scope) OwnerTenantID() int {
	if s.Global {
		return GlobalTenantId
	}
	return s.TenantID
}

// TenantScope is the single, reusable GORM scope every tenant-owned query runs
// through, so no service hand-writes `WHERE tenant_id = ?` (which is exactly how
// cross-tenant leaks creep in). Apply it with `db.Scopes(model.TenantScope(...))`.
//
//   - global == true  → no filter (admin / the tenant-0 global scope sees all).
//   - global == false → restrict to the given tenant id.
//
// The (id, global) pair comes from the tenant middleware via
// tenant.FromContext(c); see internal/web/tenant.
func TenantScope(tenantId int, global bool) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if global {
			return db
		}
		return db.Where("tenant_id = ?", tenantId)
	}
}
