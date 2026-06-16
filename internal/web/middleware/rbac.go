package middleware

import (
	"net/http"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// forbid aborts the request with a 403, JSON for XHR/API callers and a bare
// status for full-page navigations.
func forbid(c *gin.Context, msg string) {
	if c.GetHeader("X-Requested-With") == "XMLHttpRequest" {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "msg": msg})
	} else {
		c.AbortWithStatus(http.StatusForbidden)
	}
}

// RequireAdmin aborts the request unless the authenticated user is the admin.
// It is the server-side enforcement point for every admin-only route and API —
// the frontend hides admin UI, but this is what actually prevents a non-admin
// from reaching admin functionality by calling the API directly.
//
// Bearer-token API callers are resolved to the first (admin) user by
// APIController.checkAPIAuth, so they pass. Session callers are checked against
// their stored role.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := session.GetLoginUser(c)
		if user == nil || !user.IsAdmin() {
			forbid(c, "forbidden: admin role required")
			return
		}
		c.Next()
	}
}

// RequireRole aborts the request unless the authenticated user's canonical role
// is one of the allowed roles. Admin is always allowed (it is the superset
// role) even when not listed explicitly.
func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(roles)+1)
	allowed[model.RoleAdmin] = true
	for _, r := range roles {
		allowed[model.NormalizeRole(r)] = true
	}
	return func(c *gin.Context) {
		user := session.GetLoginUser(c)
		if user == nil || !allowed[user.CanonicalRole()] {
			forbid(c, "forbidden: insufficient role")
			return
		}
		c.Next()
	}
}

// RequirePermission aborts the request unless the authenticated user holds ALL
// of the given permissions. Admin holds every permission. This is the primary
// capability gate; resource-level ownership is enforced separately in services.
func RequirePermission(perms ...model.Permission) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := session.GetLoginUser(c)
		if user == nil {
			forbid(c, "forbidden")
			return
		}
		for _, p := range perms {
			if !user.Can(p) {
				forbid(c, "forbidden: missing permission")
				return
			}
		}
		c.Next()
	}
}
