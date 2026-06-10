package controller

import (
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/web/service"

	"github.com/gin-gonic/gin"
)

// SyncController exposes the synchronization audit trail (admin-only): a
// read-only view of every client-inbound sync operation, its actor, and result.
type SyncController struct {
	BaseController
	syncService service.SyncService
}

// NewSyncController registers the sync routes on the given group.
func NewSyncController(g *gin.RouterGroup) *SyncController {
	a := &SyncController{}
	sync := g.Group("/sync")
	sync.Use(middleware.RequireAdmin())
	sync.GET("/audit", a.audit)
	return a
}

// audit returns the most recent sync audit rows (newest first). Supports an
// optional ?limit= (default 200, capped at 1000).
func (a *SyncController) audit(c *gin.Context) {
	limit := 200
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	rows, err := a.syncService.ListRecentAudit(limit)
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	jsonObj(c, rows, nil)
}
