package controller

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// TicketController exposes the helpdesk API under /panel/api/tickets:
//
//   - Requesters (member/reseller/moderator — anyone with ticket.create) open and
//     reply to their OWN tickets and download their own attachments.
//   - Staff (ticket.manage — moderator/admin) see every ticket, reply, post
//     internal notes, assign/transfer, change status/priority, escalate, and view
//     the audit log + dashboard.
//   - Admins (ticket.admin) manage categories.
//
// Every route is gated server-side; ownership is enforced per request so a
// requester can never read a ticket — or an attachment — that isn't theirs.
type TicketController struct {
	ticketService service.TicketService
}

// NewTicketController registers the ticket routes on the API group.
func NewTicketController(g *gin.RouterGroup) *TicketController {
	a := &TicketController{}
	a.initRouter(g)
	return a
}

func (a *TicketController) initRouter(g *gin.RouterGroup) {
	tickets := g.Group("/tickets")
	// Every role that can have tickets holds ticket.view_own (admin implicitly).
	tickets.Use(middleware.RequirePermission(model.PermTicketViewOwn))

	tickets.GET("/categories", a.listCategories)
	tickets.GET("", a.list)
	tickets.POST("", middleware.RequirePermission(model.PermTicketCreate), a.create)
	tickets.GET("/:id", a.get)
	tickets.POST("/:id/messages", a.reply)
	tickets.POST("/:id/reopen", a.reopen)
	tickets.GET("/:id/attachments/:aid", a.attachment)
	tickets.GET("/:id/audit", a.audit)

	// Staff actions.
	staff := tickets.Group("")
	staff.Use(middleware.RequirePermission(model.PermTicketManage))
	staff.GET("/dashboard", a.dashboard)
	staff.GET("/staff", a.staffList)
	staff.POST("/:id/assign", a.assign)
	staff.POST("/:id/transfer", a.transfer)
	staff.POST("/:id/status", a.setStatus)
	staff.POST("/:id/priority", a.setPriority)
	staff.POST("/:id/escalate", a.escalate)

	// Admin category configuration.
	admin := tickets.Group("/admin")
	admin.Use(middleware.RequirePermission(model.PermTicketAdmin))
	admin.GET("/categories", a.listAllCategories)
	admin.POST("/categories", a.createCategory)
	admin.POST("/categories/reorder", a.reorderCategories)
	admin.POST("/categories/:id", a.updateCategory)
	admin.POST("/categories/:id/del", a.deleteCategory)
	admin.POST("/categories/:id/status", a.setCategoryStatus)
}

// canManage reports whether the user is support staff.
func canManageTickets(c *gin.Context) bool {
	u := session.GetLoginUser(c)
	return u != nil && u.Can(model.PermTicketManage)
}

// canAccessTicket returns true when the user may view the ticket: staff always,
// otherwise only the owner.
func (a *TicketController) canAccessTicket(c *gin.Context, t *model.Ticket) bool {
	u := session.GetLoginUser(c)
	if u == nil {
		return false
	}
	return u.Can(model.PermTicketManage) || t.UserId == u.Id
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

func (a *TicketController) listCategories(c *gin.Context) {
	cats, err := a.ticketService.ListCategories(true)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, cats, nil)
}

func (a *TicketController) listAllCategories(c *gin.Context) {
	cats, err := a.ticketService.ListCategories(false)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, cats, nil)
}

func (a *TicketController) createCategory(c *gin.Context) {
	var in service.TicketCategoryInput
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	cat, err := a.ticketService.CreateCategory(in)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, cat, nil)
}

func (a *TicketController) updateCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var in service.TicketCategoryInput
	if err := c.ShouldBindJSON(&in); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	cat, err := a.ticketService.UpdateCategory(id, in)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, cat, nil)
}

func (a *TicketController) deleteCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := a.ticketService.DeleteCategory(id); err != nil {
		if errors.Is(err, service.ErrTicketCategoryInUse) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.ticketAdmin.toasts.categoryInUse"))
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TicketController) setCategoryStatus(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var form struct {
		Active bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.ticketService.SetCategoryStatus(id, form.Active); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TicketController) reorderCategories(c *gin.Context) {
	var form struct {
		Ids []int `json:"ids"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.ticketService.ReorderCategories(form.Ids); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

// ---------------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------------

func (a *TicketController) list(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	categoryId, _ := strconv.Atoi(c.Query("categoryId"))
	res, err := a.ticketService.ListTickets(service.TicketListParams{
		ViewerId:   user.Id,
		CanViewAll: user.Can(model.PermTicketManage),
		Filter:     c.Query("filter"),
		Status:     c.Query("status"),
		Priority:   c.Query("priority"),
		CategoryId: categoryId,
		Search:     c.Query("search"),
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, res, nil)
}

func (a *TicketController) get(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	ticket, err := a.ticketService.Get(id)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if !a.canAccessTicket(c, ticket) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	staff := canManageTickets(c)
	item, messages, err := a.ticketService.Detail(id, staff)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, gin.H{"ticket": item, "messages": messages, "canManage": staff}, nil)
}

func (a *TicketController) audit(c *gin.Context) {
	if !canManageTickets(c) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	rows, err := a.ticketService.AuditLog(id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *TicketController) staffList(c *gin.Context) {
	rows, err := a.ticketService.ListStaff()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *TicketController) dashboard(c *gin.Context) {
	d, err := a.ticketService.Dashboard()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "fail"), err)
		return
	}
	jsonObj(c, d, nil)
}

// ---------------------------------------------------------------------------
// Create / reply (multipart)
// ---------------------------------------------------------------------------

// readAttachments validates and persists every file in the multipart form's
// "attachments" field, bound to the given message. Errors abort the request.
func (a *TicketController) readAttachments(c *gin.Context, ticketId, messageId, userId int) bool {
	form, err := c.MultipartForm()
	if err != nil {
		return true // no multipart form / no files — nothing to do
	}
	files := form.File["attachments"]
	for _, fh := range files {
		f, oerr := fh.Open()
		if oerr != nil {
			continue
		}
		data, rerr := io.ReadAll(io.LimitReader(f, service.MaxTicketUploadBytes))
		f.Close()
		if rerr != nil {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "somethingWentWrong"))
			return false
		}
		if _, serr := a.ticketService.SaveAttachment(ticketId, messageId, userId, data, fh.Filename); serr != nil {
			pureJsonMsg(c, http.StatusOK, false, ticketAttachmentError(c, serr))
			return false
		}
	}
	return true
}

func (a *TicketController) create(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxTicketUploadBytes)

	categoryId, _ := strconv.Atoi(c.PostForm("categoryId"))
	ticket, msg, err := a.ticketService.CreateTicket(user.Id, user.Username, service.CreateTicketInput{
		Subject:    c.PostForm("subject"),
		CategoryId: categoryId,
		Priority:   c.PostForm("priority"),
		Body:       c.PostForm("body"),
	})
	if err != nil {
		if m := ticketError(c, err); m != "" {
			pureJsonMsg(c, http.StatusOK, false, m)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if !a.readAttachments(c, ticket.Id, msg.Id, user.Id) {
		return
	}
	jsonObj(c, gin.H{"id": ticket.Id, "number": ticket.Number}, nil)
}

func (a *TicketController) reply(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	ticket, err := a.ticketService.Get(id)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if !a.canAccessTicket(c, ticket) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	staff := user.Can(model.PermTicketManage)
	// A requester must reopen a solved/closed ticket before replying; staff may
	// reply anytime.
	if !staff && model.TicketStatusIsClosed(ticket.Status) {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.tickets.toasts.closedReply"))
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxTicketUploadBytes)
	internal := staff && c.PostForm("internal") == "true"

	msg, err := a.ticketService.AddMessage(id, user.Id, user.Username, c.PostForm("body"), internal, staff)
	if err != nil {
		if m := ticketError(c, err); m != "" {
			pureJsonMsg(c, http.StatusOK, false, m)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if !a.readAttachments(c, id, msg.Id, user.Id) {
		return
	}
	jsonObj(c, gin.H{"id": msg.Id}, nil)
}

func (a *TicketController) reopen(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	ticket, err := a.ticketService.Get(id)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if !a.canAccessTicket(c, ticket) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	staff := user.Can(model.PermTicketManage)
	if err := a.ticketService.Reopen(id, user.Id, user.Username, staff); err != nil {
		if errors.Is(err, service.ErrReopenWindow) {
			pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.tickets.toasts.reopenWindow"))
			return
		}
		if m := ticketError(c, err); m != "" {
			pureJsonMsg(c, http.StatusOK, false, m)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

// ---------------------------------------------------------------------------
// Attachment streaming (authorized)
// ---------------------------------------------------------------------------

func (a *TicketController) attachment(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	aid, _ := strconv.Atoi(c.Param("aid"))
	att, ticket, err := a.ticketService.GetAttachment(aid)
	if err != nil || att.TicketId != id {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if !a.canAccessTicket(c, ticket) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	path, err := a.ticketService.AttachmentFilePath(att.FileName)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	// Render images/video/pdf inline; force-download everything else. nosniff so
	// the browser never reinterprets the declared type.
	disposition := "attachment"
	switch att.Kind {
	case model.TicketKindImage, model.TicketKindVideo:
		disposition = "inline"
	case model.TicketKindDocument:
		if strings.EqualFold(att.MimeType, "application/pdf") {
			disposition = "inline"
		}
	}
	c.Header("Content-Type", att.MimeType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", disposition+`; filename="`+att.OriginalName+`"`)
	c.Header("Cache-Control", "private, max-age=86400")
	c.File(path)
}

// ---------------------------------------------------------------------------
// Staff mutations
// ---------------------------------------------------------------------------

func (a *TicketController) assign(c *gin.Context) {
	actor := session.GetLoginUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var form struct {
		AssignedTo int `json:"assignedTo"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.ticketService.Assign(id, form.AssignedTo, actor.Id, actor.Username); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TicketController) transfer(c *gin.Context) {
	actor := session.GetLoginUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var form struct {
		CategoryId int `json:"categoryId"`
		AssignedTo int `json:"assignedTo"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.ticketService.Transfer(id, form.CategoryId, form.AssignedTo, actor.Id, actor.Username); err != nil {
		if m := ticketError(c, err); m != "" {
			pureJsonMsg(c, http.StatusOK, false, m)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TicketController) setStatus(c *gin.Context) {
	actor := session.GetLoginUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var form struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.ticketService.SetStatus(id, form.Status, actor.Id, actor.Username); err != nil {
		if m := ticketError(c, err); m != "" {
			pureJsonMsg(c, http.StatusOK, false, m)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TicketController) setPriority(c *gin.Context) {
	actor := session.GetLoginUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var form struct {
		Priority string `json:"priority"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	if err := a.ticketService.SetPriority(id, form.Priority, actor.Id, actor.Username); err != nil {
		if m := ticketError(c, err); m != "" {
			pureJsonMsg(c, http.StatusOK, false, m)
			return
		}
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

func (a *TicketController) escalate(c *gin.Context) {
	actor := session.GetLoginUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if err := a.ticketService.SetStatus(id, model.TicketStatusEscalated, actor.Id, actor.Username); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "success"), nil)
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

func ticketError(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrTicketInvalid):
		return I18nWeb(c, "pages.tickets.toasts.invalid")
	case errors.Is(err, service.ErrTicketCategory):
		return I18nWeb(c, "pages.tickets.toasts.category")
	case errors.Is(err, service.ErrTicketNotFound):
		return I18nWeb(c, "pages.tickets.toasts.notFound")
	case errors.Is(err, service.ErrTicketCategoryInUse):
		return I18nWeb(c, "pages.ticketAdmin.toasts.categoryInUse")
	default:
		return ticketAttachmentError(c, err)
	}
}

func ticketAttachmentError(c *gin.Context, err error) string {
	switch {
	case errors.Is(err, service.ErrAttachmentType):
		return I18nWeb(c, "pages.tickets.toasts.fileType")
	case errors.Is(err, service.ErrAttachmentTooLarge):
		return I18nWeb(c, "pages.tickets.toasts.fileTooLarge")
	case errors.Is(err, service.ErrAttachmentEmpty):
		return I18nWeb(c, "pages.tickets.toasts.fileEmpty")
	default:
		return ""
	}
}
