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
)

// Set records the effective tenant for this request. global==true means the
// caller (admin / tenant-0 scope) sees every tenant and queries are unfiltered.
func Set(c *gin.Context, tenantID int, global bool) {
	c.Set(ctxTenantID, tenantID)
	c.Set(ctxTenantGlobal, global)
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
