package model

import "gorm.io/gorm"

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
