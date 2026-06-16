package controller

import (
	"net/http"
	"strconv"

	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// NotificationController exposes the current user's in-app notifications (the
// bell menu). Every route is scoped to the logged-in user — a caller can only
// ever read or mutate their own notifications.
type NotificationController struct {
	notificationService service.NotificationService
}

// NewNotificationController registers the notification routes on the API group.
func NewNotificationController(g *gin.RouterGroup) *NotificationController {
	a := &NotificationController{}
	a.initRouter(g)
	return a
}

func (a *NotificationController) initRouter(g *gin.RouterGroup) {
	n := g.Group("/notifications")
	n.GET("", a.list)
	n.GET("/unread-count", a.unreadCount)
	n.POST("/:id/read", a.markRead)
	n.POST("/read-all", a.markAllRead)
}

func (a *NotificationController) list(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := a.notificationService.ListForUser(user.Id, limit)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *NotificationController) unreadCount(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	count, err := a.notificationService.UnreadCount(user.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, gin.H{"count": count}, nil)
}

func (a *NotificationController) markRead(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.notificationService.MarkRead(user.Id, id); err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *NotificationController) markAllRead(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := a.notificationService.MarkAllRead(user.Id); err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}
