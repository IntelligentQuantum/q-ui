package service

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/config"
	"github.com/mhsanaei/3x-ui/v3/database"
	"github.com/mhsanaei/3x-ui/v3/database/model"
	"github.com/mhsanaei/3x-ui/v3/logger"

	"gorm.io/gorm"
)

// Ticket errors — sentinels the controller maps to precise localized messages.
var (
	ErrTicketNotFound      = errors.New("ticket not found")
	ErrTicketInvalid       = errors.New("invalid ticket data")
	ErrTicketCategory      = errors.New("invalid or inactive category")
	ErrTicketForbidden     = errors.New("not allowed")
	ErrTicketClosed        = errors.New("ticket is closed")
	ErrReopenWindow        = errors.New("reopen window has passed")
	ErrAttachmentType      = errors.New("unsupported attachment type")
	ErrAttachmentTooLarge  = errors.New("attachment too large")
	ErrAttachmentEmpty     = errors.New("empty attachment")
	ErrTicketCategoryInUse = errors.New("category has tickets")
)

// Limits.
const (
	ticketMaxSubjectLen = 200
	ticketMaxBodyLen    = 20000
	ticketReopenDays    = 7 // window after closing in which the owner may reopen
)

// Per-priority first-response SLA targets (minutes). These are the documented
// configuration point; recomputed onto a ticket whenever its priority changes.
var ticketSLAMinutes = map[string]int64{
	model.TicketPriorityUrgent: 60,
	model.TicketPriorityHigh:   360,
	model.TicketPriorityNormal: 1440,
	model.TicketPriorityLow:    4320,
}

// Attachment allow-list. The EXTENSION is the primary guard (executables, .svg,
// .html, .js, etc. are simply absent); a content sniff is a secondary check.
var ticketExtKind = map[string]string{
	".jpg": model.TicketKindImage, ".jpeg": model.TicketKindImage, ".png": model.TicketKindImage,
	".webp": model.TicketKindImage, ".gif": model.TicketKindImage,
	".mp4": model.TicketKindVideo, ".webm": model.TicketKindVideo,
	".pdf": model.TicketKindDocument, ".docx": model.TicketKindDocument,
	".xlsx": model.TicketKindDocument, ".txt": model.TicketKindDocument,
	".zip": model.TicketKindArchive, ".rar": model.TicketKindArchive,
}

var ticketKindMaxBytes = map[string]int64{
	model.TicketKindImage:    10 << 20,  // 10 MiB
	model.TicketKindVideo:    100 << 20, // 100 MiB
	model.TicketKindDocument: 25 << 20,  // 25 MiB
	model.TicketKindArchive:  50 << 20,  // 50 MiB
}

// MaxTicketUploadBytes caps a single multipart request body (largest kind +
// headroom for fields/boundaries).
const MaxTicketUploadBytes = (100 << 20) + (4 << 20)

// TicketVirusScan is an optional hook: when set, it is invoked with the saved
// file's absolute path right after an attachment is written. A non-nil error
// causes the file to be deleted and the upload rejected. Wire a ClamAV/remote
// scanner here without touching the upload path. nil = no scanning.
var TicketVirusScan func(path string) error

var mentionRe = regexp.MustCompile(`@([A-Za-z0-9_]{3,32})`)

// TicketService owns the helpdesk lifecycle: categories, tickets, the threaded
// conversation, attachments, SLA, audit trail and notifications.
type TicketService struct {
	notificationService NotificationService
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// TicketCategoryInput is the admin payload for create/update.
type TicketCategoryInput struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	DisplayOrder int    `json:"displayOrder"`
}

func (s *TicketService) ListCategories(activeOnly bool) ([]model.TicketCategory, error) {
	q := database.GetDB().Model(&model.TicketCategory{}).Order("display_order asc, id asc")
	if activeOnly {
		q = q.Where("status = ?", model.TicketCategoryActive)
	}
	var rows []model.TicketCategory
	err := q.Find(&rows).Error
	return rows, err
}

func (s *TicketService) GetCategory(id int) (*model.TicketCategory, error) {
	var c model.TicketCategory
	if err := database.GetDB().Where("id = ?", id).First(&c).Error; err != nil {
		if database.IsNotFound(err) {
			return nil, ErrTicketCategory
		}
		return nil, err
	}
	return &c, nil
}

func (s *TicketService) CreateCategory(in TicketCategoryInput) (*model.TicketCategory, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrTicketInvalid
	}
	c := &model.TicketCategory{
		Name:         name,
		Description:  strings.TrimSpace(in.Description),
		DisplayOrder: in.DisplayOrder,
		Status:       model.TicketCategoryActive,
	}
	if err := database.GetDB().Create(c).Error; err != nil {
		return nil, err
	}
	return c, nil
}

func (s *TicketService) UpdateCategory(id int, in TicketCategoryInput) (*model.TicketCategory, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrTicketInvalid
	}
	if _, err := s.GetCategory(id); err != nil {
		return nil, err
	}
	if err := database.GetDB().Model(&model.TicketCategory{}).Where("id = ?", id).
		Updates(map[string]any{
			"name":          name,
			"description":   strings.TrimSpace(in.Description),
			"display_order": in.DisplayOrder,
		}).Error; err != nil {
		return nil, err
	}
	return s.GetCategory(id)
}

func (s *TicketService) SetCategoryStatus(id int, active bool) error {
	status := model.TicketCategoryInactive
	if active {
		status = model.TicketCategoryActive
	}
	res := database.GetDB().Model(&model.TicketCategory{}).Where("id = ?", id).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrTicketCategory
	}
	return nil
}

func (s *TicketService) DeleteCategory(id int) error {
	var count int64
	if err := database.GetDB().Model(&model.Ticket{}).Where("category_id = ?", id).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrTicketCategoryInUse
	}
	res := database.GetDB().Where("id = ?", id).Delete(&model.TicketCategory{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrTicketCategory
	}
	return nil
}

// ReorderCategories applies a new display order from an ordered list of ids.
func (s *TicketService) ReorderCategories(ids []int) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for order, id := range ids {
			if err := tx.Model(&model.TicketCategory{}).Where("id = ?", id).
				Update("display_order", order).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func nowMilli() int64 { return time.Now().UnixMilli() }

func slaDueAt(priority string, createdAt int64) int64 {
	mins, ok := ticketSLAMinutes[priority]
	if !ok {
		mins = ticketSLAMinutes[model.TicketPriorityNormal]
	}
	return createdAt + mins*60*1000
}

// audit appends one history row (best-effort).
func (s *TicketService) audit(tx *gorm.DB, ticketId, actorId int, actorName, action, oldVal, newVal string) {
	db := tx
	if db == nil {
		db = database.GetDB()
	}
	row := &model.TicketAuditLog{
		TicketId: ticketId, ActorId: actorId, ActorName: actorName,
		Action: action, OldValue: oldVal, NewValue: newVal,
	}
	if err := db.Create(row).Error; err != nil {
		logger.Warning("ticket: audit write failed:", err)
	}
}

// TicketStaff is an assignable support agent (admin/moderator) for the staff UI.
type TicketStaff struct {
	Id       int    `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// ListStaff returns the assignable support agents (admins + moderators).
func (s *TicketService) ListStaff() ([]TicketStaff, error) {
	var rows []TicketStaff
	err := database.GetDB().Model(&model.User{}).
		Select("id, username, role").
		Where("role IN ?", []string{model.RoleAdmin, model.RoleModerator}).
		Order("username asc").Scan(&rows).Error
	for i := range rows {
		rows[i].Role = model.NormalizeRole(rows[i].Role)
	}
	return rows, err
}

func (s *TicketService) staffUserIds() []int {
	var ids []int
	database.GetDB().Model(&model.User{}).
		Where("role IN ?", []string{model.RoleAdmin, model.RoleModerator}).Pluck("id", &ids)
	return ids
}

type userInfo struct {
	Id       int
	Username string
	Role     string
}

func (s *TicketService) usersByIds(ids []int) map[int]userInfo {
	out := map[int]userInfo{}
	if len(ids) == 0 {
		return out
	}
	var rows []userInfo
	database.GetDB().Model(&model.User{}).Select("id, username, role").Where("id IN ?", ids).Scan(&rows)
	for _, r := range rows {
		r.Role = model.NormalizeRole(r.Role)
		out[r.Id] = r
	}
	return out
}

// notifyMentions parses @username tokens and notifies each mentioned existing
// user (used so staff can loop a colleague into a thread).
func (s *TicketService) notifyMentions(body string, ticket *model.Ticket, actorName string) {
	matches := mentionRe.FindAllStringSubmatch(body, -1)
	if len(matches) == 0 {
		return
	}
	names := make([]string, 0, len(matches))
	for _, m := range matches {
		names = append(names, m[1])
	}
	var ids []int
	database.GetDB().Model(&model.User{}).Where("username IN ?", names).Pluck("id", &ids)
	if len(ids) == 0 {
		return
	}
	_ = s.notificationService.NotifyUsers(ids,
		"notifications.ticketMention.title", "notifications.ticketMention.body",
		model.NotificationInfo, "/tickets/"+itoa(ticket.Id),
		map[string]any{"number": ticket.Number, "actor": actorName})
}

func itoa(n int) string { return fmt.Sprintf("%d", n) }

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

// CreateTicketInput is the requester payload (attachments handled separately).
type CreateTicketInput struct {
	Subject    string
	CategoryId int
	Priority   string
	Body       string
}

// CreateTicket opens a new ticket: validates input, generates the TCK number,
// computes the SLA deadline, writes the opening message, records the audit row
// and notifies support staff — all in one transaction.
func (s *TicketService) CreateTicket(userId int, username string, in CreateTicketInput) (*model.Ticket, *model.TicketMessage, error) {
	subject := strings.TrimSpace(in.Subject)
	body := strings.TrimSpace(in.Body)
	if userId <= 0 || subject == "" || body == "" {
		return nil, nil, ErrTicketInvalid
	}
	if len(subject) > ticketMaxSubjectLen {
		subject = subject[:ticketMaxSubjectLen]
	}
	if len(body) > ticketMaxBodyLen {
		return nil, nil, ErrTicketInvalid
	}
	priority := in.Priority
	if !model.IsValidTicketPriority(priority) {
		priority = model.TicketPriorityNormal
	}
	// Category must exist and be active.
	cat, err := s.GetCategory(in.CategoryId)
	if err != nil || cat.Status != model.TicketCategoryActive {
		return nil, nil, ErrTicketCategory
	}

	var ticket model.Ticket
	var msg model.TicketMessage
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		now := nowMilli()
		ticket = model.Ticket{
			UserId:       userId,
			CategoryId:   in.CategoryId,
			Subject:      subject,
			Priority:     priority,
			Status:       model.TicketStatusOpen,
			SLADueAt:     slaDueAt(priority, now),
			LastReplyAt:  now,
			LastReplyBy:  userId,
			MessageCount: 1,
		}
		if e := tx.Create(&ticket).Error; e != nil {
			return e
		}
		// Number derives from the autoincrement id (race-free, globally unique).
		ticket.Number = fmt.Sprintf("TCK-%d-%06d", time.Now().Year(), ticket.Id)
		if e := tx.Model(&model.Ticket{}).Where("id = ?", ticket.Id).Update("number", ticket.Number).Error; e != nil {
			return e
		}
		msg = model.TicketMessage{TicketId: ticket.Id, UserId: userId, Body: body}
		if e := tx.Create(&msg).Error; e != nil {
			return e
		}
		s.audit(tx, ticket.Id, userId, username, model.TicketActionCreated, "", ticket.Number)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	// Notify all staff that a new ticket awaits (best-effort).
	_ = s.notificationService.NotifyUsers(s.staffUserIds(),
		"notifications.ticketCreated.title", "notifications.ticketCreated.body",
		model.NotificationInfo, "/tickets/"+itoa(ticket.Id),
		map[string]any{"number": ticket.Number, "subject": subject})
	s.notifyMentions(body, &ticket, username)
	logger.Infof("[audit] ticket created: %s user=%d", ticket.Number, userId)
	return &ticket, &msg, nil
}

// ---------------------------------------------------------------------------
// Read / list
// ---------------------------------------------------------------------------

func (s *TicketService) Get(id int) (*model.Ticket, error) {
	var t model.Ticket
	if err := database.GetDB().Where("id = ?", id).First(&t).Error; err != nil {
		if database.IsNotFound(err) {
			return nil, ErrTicketNotFound
		}
		return nil, err
	}
	return &t, nil
}

// TicketListItem is an enriched list row (one query, no N+1): the ticket plus
// the requester/assignee usernames and the category name.
type TicketListItem struct {
	model.Ticket
	Username     string `json:"username"`
	CategoryName string `json:"categoryName"`
	AssigneeName string `json:"assigneeName"`
	Overdue      bool   `json:"overdue" gorm:"-"`
}

// TicketListResult is a page of tickets plus the total for the pager.
type TicketListResult struct {
	Items []TicketListItem `json:"items"`
	Total int64            `json:"total"`
}

// TicketListParams drives the staff/user queue: ownership, the named filter, the
// free-text search, and pagination.
type TicketListParams struct {
	ViewerId   int
	CanViewAll bool   // staff
	Filter     string // open|assigned_to_me|unassigned|closed|escalated|urgent|today|week|all
	Status     string
	Priority   string
	CategoryId int
	Search     string
	Limit      int
	Offset     int
}

func (s *TicketService) ListTickets(p TicketListParams) (*TicketListResult, error) {
	if p.Limit <= 0 || p.Limit > 100 {
		p.Limit = 15
	}
	if p.Offset < 0 {
		p.Offset = 0
	}
	base := database.GetDB().
		Table("tickets AS t").
		Joins("LEFT JOIN users u ON u.id = t.user_id").
		Joins("LEFT JOIN users a ON a.id = t.assigned_to").
		Joins("LEFT JOIN ticket_categories c ON c.id = t.category_id")

	// Ownership: non-staff only ever see their own tickets.
	if !p.CanViewAll {
		base = base.Where("t.user_id = ?", p.ViewerId)
	}

	switch p.Filter {
	case "open":
		base = base.Where("t.status NOT IN ?", []string{model.TicketStatusSolved, model.TicketStatusClosed})
	case "assigned_to_me":
		base = base.Where("t.assigned_to = ?", p.ViewerId)
	case "unassigned":
		base = base.Where("t.assigned_to = 0 AND t.status NOT IN ?", []string{model.TicketStatusSolved, model.TicketStatusClosed})
	case "closed":
		base = base.Where("t.status IN ?", []string{model.TicketStatusSolved, model.TicketStatusClosed})
	case "escalated":
		base = base.Where("t.status = ?", model.TicketStatusEscalated)
	case "urgent":
		base = base.Where("t.priority = ? AND t.status NOT IN ?", model.TicketPriorityUrgent,
			[]string{model.TicketStatusSolved, model.TicketStatusClosed})
	case "today":
		base = base.Where("t.created_at >= ?", startOfDayMilli(0))
	case "week":
		base = base.Where("t.created_at >= ?", startOfDayMilli(7))
	}

	if model.IsValidTicketStatus(p.Status) {
		base = base.Where("t.status = ?", p.Status)
	}
	if model.IsValidTicketPriority(p.Priority) {
		base = base.Where("t.priority = ?", p.Priority)
	}
	if p.CategoryId > 0 {
		base = base.Where("t.category_id = ?", p.CategoryId)
	}
	if search := strings.TrimSpace(p.Search); search != "" {
		like := "%" + search + "%"
		base = base.Where(
			"t.number LIKE ? OR t.subject LIKE ? OR u.username LIKE ? OR a.username LIKE ? OR CAST(t.user_id AS TEXT) = ?",
			like, like, like, like, search)
	}

	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, err
	}

	items := []TicketListItem{} // non-nil so an empty page marshals as [] not null
	err := base.
		Select("t.*, u.username AS username, a.username AS assignee_name, c.name AS category_name").
		Order("t.last_reply_at DESC, t.id DESC").
		Limit(p.Limit).Offset(p.Offset).
		Scan(&items).Error
	if err != nil {
		return nil, err
	}
	now := nowMilli()
	for i := range items {
		items[i].Overdue = items[i].FirstResponseAt == 0 &&
			items[i].SLADueAt > 0 && now > items[i].SLADueAt &&
			!model.TicketStatusIsClosed(items[i].Status)
	}
	return &TicketListResult{Items: items, Total: total}, nil
}

// startOfDayMilli returns the ms timestamp for 00:00 local time, daysAgo days back.
func startOfDayMilli(daysAgo int) int64 {
	t := time.Now().AddDate(0, 0, -daysAgo)
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location()).UnixMilli()
}

// Detail returns the enriched ticket (requester/assignee/category resolved, SLA
// overdue computed) plus its thread. includeInternal controls whether staff-only
// notes are present (staff view) — the caller passes the viewer's staff status.
func (s *TicketService) Detail(id int, includeInternal bool) (*TicketListItem, []TicketMessageView, error) {
	var item TicketListItem
	err := database.GetDB().
		Table("tickets AS t").
		Joins("LEFT JOIN users u ON u.id = t.user_id").
		Joins("LEFT JOIN users a ON a.id = t.assigned_to").
		Joins("LEFT JOIN ticket_categories c ON c.id = t.category_id").
		Select("t.*, u.username AS username, a.username AS assignee_name, c.name AS category_name").
		Where("t.id = ?", id).Limit(1).Scan(&item).Error
	if err != nil {
		return nil, nil, err
	}
	if item.Id == 0 {
		return nil, nil, ErrTicketNotFound
	}
	now := nowMilli()
	item.Overdue = item.FirstResponseAt == 0 && item.SLADueAt > 0 && now > item.SLADueAt &&
		!model.TicketStatusIsClosed(item.Status)
	msgs, err := s.Thread(id, includeInternal)
	if err != nil {
		return nil, nil, err
	}
	return &item, msgs, nil
}

// TicketMessageView is one thread entry with the author resolved and its files.
type TicketMessageView struct {
	model.TicketMessage
	AuthorName  string                   `json:"authorName"`
	AuthorRole  string                   `json:"authorRole"`
	Attachments []model.TicketAttachment `json:"attachments"`
}

// Thread loads a ticket's conversation in chronological order. When
// includeInternal is false, staff-only notes are omitted (the requester view).
// One query for messages, one for their authors, one for attachments — no N+1.
func (s *TicketService) Thread(ticketId int, includeInternal bool) ([]TicketMessageView, error) {
	q := database.GetDB().Where("ticket_id = ?", ticketId)
	if !includeInternal {
		q = q.Where("is_internal = ?", false)
	}
	var msgs []model.TicketMessage
	if err := q.Order("id asc").Find(&msgs).Error; err != nil {
		return nil, err
	}
	if len(msgs) == 0 {
		return []TicketMessageView{}, nil
	}
	authorIds := make([]int, 0, len(msgs))
	for _, m := range msgs {
		authorIds = append(authorIds, m.UserId)
	}
	users := s.usersByIds(authorIds)

	var atts []model.TicketAttachment
	database.GetDB().Where("ticket_id = ?", ticketId).Order("id asc").Find(&atts)
	byMsg := map[int][]model.TicketAttachment{}
	for _, a := range atts {
		byMsg[a.MessageId] = append(byMsg[a.MessageId], a)
	}

	out := make([]TicketMessageView, 0, len(msgs))
	for _, m := range msgs {
		u := users[m.UserId]
		out = append(out, TicketMessageView{
			TicketMessage: m,
			AuthorName:    u.Username,
			AuthorRole:    u.Role,
			Attachments:   byMsg[m.Id],
		})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

// AddMessage appends a reply (or staff internal note) and applies the automatic
// status transition + first-response stamp. Returns the created message.
func (s *TicketService) AddMessage(ticketId, authorId int, authorName, body string, isInternal, authorIsStaff bool) (*model.TicketMessage, error) {
	body = strings.TrimSpace(body)
	if body == "" || len(body) > ticketMaxBodyLen {
		return nil, ErrTicketInvalid
	}
	ticket, err := s.Get(ticketId)
	if err != nil {
		return nil, err
	}
	isInternal = isInternal && authorIsStaff // only staff can post internal notes

	var msg model.TicketMessage
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		now := nowMilli()
		msg = model.TicketMessage{TicketId: ticketId, UserId: authorId, Body: body, IsInternal: isInternal}
		if e := tx.Create(&msg).Error; e != nil {
			return e
		}
		updates := map[string]any{"message_count": gorm.Expr("message_count + 1")}
		if !isInternal {
			updates["last_reply_at"] = now
			updates["last_reply_by"] = authorId
			// Auto-transition: staff public reply -> waiting on user; user reply ->
			// waiting on staff. Terminal statuses are left untouched.
			if !model.TicketStatusIsClosed(ticket.Status) {
				if authorIsStaff {
					updates["status"] = model.TicketStatusPendingUser
					if ticket.FirstResponseAt == 0 {
						updates["first_response_at"] = now
					}
				} else {
					updates["status"] = model.TicketStatusPendingStaff
				}
			}
		}
		if e := tx.Model(&model.Ticket{}).Where("id = ?", ticketId).Updates(updates).Error; e != nil {
			return e
		}
		action := model.TicketActionReply
		if isInternal {
			action = model.TicketActionNote
		}
		s.audit(tx, ticketId, authorId, authorName, action, "", "")
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Notifications (skip for internal notes, which the requester never sees).
	if !isInternal {
		if authorIsStaff {
			_ = s.notificationService.Notify(ticket.UserId,
				"notifications.ticketReplied.title", "notifications.ticketReplied.body",
				model.NotificationInfo, "/tickets/"+itoa(ticketId),
				map[string]any{"number": ticket.Number})
		} else {
			// Notify the assignee, or all staff if unassigned.
			targets := []int{ticket.AssignedTo}
			if ticket.AssignedTo == 0 {
				targets = s.staffUserIds()
			}
			_ = s.notificationService.NotifyUsers(targets,
				"notifications.ticketReplied.title", "notifications.ticketUserReplied.body",
				model.NotificationInfo, "/tickets/"+itoa(ticketId),
				map[string]any{"number": ticket.Number})
		}
	}
	s.notifyMentions(body, ticket, authorName)
	return &msg, nil
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

func (s *TicketService) Assign(ticketId, assigneeId, actorId int, actorName string) error {
	ticket, err := s.Get(ticketId)
	if err != nil {
		return err
	}
	now := nowMilli()
	if err := database.GetDB().Model(&model.Ticket{}).Where("id = ?", ticketId).
		Updates(map[string]any{"assigned_to": assigneeId, "assigned_by": actorId, "assigned_at": now}).Error; err != nil {
		return err
	}
	s.audit(nil, ticketId, actorId, actorName, model.TicketActionAssign, itoa(ticket.AssignedTo), itoa(assigneeId))
	if assigneeId > 0 {
		_ = s.notificationService.Notify(assigneeId,
			"notifications.ticketAssigned.title", "notifications.ticketAssigned.body",
			model.NotificationInfo, "/tickets/"+itoa(ticketId),
			map[string]any{"number": ticket.Number})
	}
	return nil
}

// Transfer moves a ticket to another category and/or assignee.
func (s *TicketService) Transfer(ticketId, newCategoryId, newAssignee, actorId int, actorName string) error {
	ticket, err := s.Get(ticketId)
	if err != nil {
		return err
	}
	updates := map[string]any{}
	if newCategoryId > 0 && newCategoryId != ticket.CategoryId {
		if _, e := s.GetCategory(newCategoryId); e != nil {
			return ErrTicketCategory
		}
		updates["category_id"] = newCategoryId
		s.audit(nil, ticketId, actorId, actorName, model.TicketActionTransfer, itoa(ticket.CategoryId), itoa(newCategoryId))
	}
	if newAssignee != ticket.AssignedTo {
		updates["assigned_to"] = newAssignee
		updates["assigned_by"] = actorId
		updates["assigned_at"] = nowMilli()
		s.audit(nil, ticketId, actorId, actorName, model.TicketActionAssign, itoa(ticket.AssignedTo), itoa(newAssignee))
	}
	if len(updates) == 0 {
		return nil
	}
	return database.GetDB().Model(&model.Ticket{}).Where("id = ?", ticketId).Updates(updates).Error
}

func (s *TicketService) SetStatus(ticketId int, status string, actorId int, actorName string) error {
	if !model.IsValidTicketStatus(status) {
		return ErrTicketInvalid
	}
	ticket, err := s.Get(ticketId)
	if err != nil {
		return err
	}
	updates := map[string]any{"status": status}
	if model.TicketStatusIsClosed(status) {
		updates["closed_at"] = nowMilli()
	}
	if err := database.GetDB().Model(&model.Ticket{}).Where("id = ?", ticketId).Updates(updates).Error; err != nil {
		return err
	}
	action := model.TicketActionStatus
	if status == model.TicketStatusEscalated {
		action = model.TicketActionEscalate
	} else if model.TicketStatusIsClosed(status) {
		action = model.TicketActionClose
	}
	s.audit(nil, ticketId, actorId, actorName, action, ticket.Status, status)
	if model.TicketStatusIsClosed(status) {
		_ = s.notificationService.Notify(ticket.UserId,
			"notifications.ticketClosed.title", "notifications.ticketClosed.body",
			model.NotificationSuccess, "/tickets/"+itoa(ticketId),
			map[string]any{"number": ticket.Number})
	}
	return nil
}

func (s *TicketService) SetPriority(ticketId int, priority string, actorId int, actorName string) error {
	if !model.IsValidTicketPriority(priority) {
		return ErrTicketInvalid
	}
	ticket, err := s.Get(ticketId)
	if err != nil {
		return err
	}
	updates := map[string]any{"priority": priority}
	// Recompute the SLA deadline from the original creation time when first
	// response hasn't happened yet.
	if ticket.FirstResponseAt == 0 {
		updates["sla_due_at"] = slaDueAt(priority, ticket.CreatedAt)
	}
	if err := database.GetDB().Model(&model.Ticket{}).Where("id = ?", ticketId).Updates(updates).Error; err != nil {
		return err
	}
	s.audit(nil, ticketId, actorId, actorName, model.TicketActionPriority, ticket.Priority, priority)
	return nil
}

// Reopen lets the owner (or staff) reopen a solved/closed ticket within the
// configured window. Staff are not bound by the window.
func (s *TicketService) Reopen(ticketId, actorId int, actorName string, actorIsStaff bool) error {
	ticket, err := s.Get(ticketId)
	if err != nil {
		return err
	}
	if !model.TicketStatusIsClosed(ticket.Status) {
		return ErrTicketInvalid
	}
	if !actorIsStaff {
		deadline := ticket.ClosedAt + int64(ticketReopenDays)*24*60*60*1000
		if ticket.ClosedAt > 0 && nowMilli() > deadline {
			return ErrReopenWindow
		}
	}
	if err := database.GetDB().Model(&model.Ticket{}).Where("id = ?", ticketId).
		Updates(map[string]any{
			"status":       model.TicketStatusOpen,
			"closed_at":    0,
			"reopen_count": gorm.Expr("reopen_count + 1"),
		}).Error; err != nil {
		return err
	}
	s.audit(nil, ticketId, actorId, actorName, model.TicketActionReopen, ticket.Status, model.TicketStatusOpen)
	// Notify the other side.
	if actorIsStaff {
		_ = s.notificationService.Notify(ticket.UserId,
			"notifications.ticketReopened.title", "notifications.ticketReopened.body",
			model.NotificationInfo, "/tickets/"+itoa(ticketId), map[string]any{"number": ticket.Number})
	} else {
		targets := []int{ticket.AssignedTo}
		if ticket.AssignedTo == 0 {
			targets = s.staffUserIds()
		}
		_ = s.notificationService.NotifyUsers(targets,
			"notifications.ticketReopened.title", "notifications.ticketReopened.body",
			model.NotificationInfo, "/tickets/"+itoa(ticketId), map[string]any{"number": ticket.Number})
	}
	return nil
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

func ticketUploadDir() string {
	return filepath.Join(config.GetDBFolderPath(), "uploads", "ticket-attachments")
}

// ValidateAttachment enforces the extension allow-list, per-kind size limit and
// a defensive content sniff. Returns the resolved kind and canonical extension.
func (s *TicketService) ValidateAttachment(data []byte, originalName string) (kind, ext string, err error) {
	if len(data) == 0 {
		return "", "", ErrAttachmentEmpty
	}
	ext = strings.ToLower(filepath.Ext(originalName))
	kind, ok := ticketExtKind[ext]
	if !ok {
		return "", "", ErrAttachmentType
	}
	if int64(len(data)) > ticketKindMaxBytes[kind] {
		return "", "", ErrAttachmentTooLarge
	}
	ct := http.DetectContentType(data)
	// Never accept anything that sniffs as HTML/script regardless of extension.
	if strings.Contains(ct, "text/html") {
		return "", "", ErrAttachmentType
	}
	// Defensive confirmation for the spoofable, render-in-browser types.
	switch kind {
	case model.TicketKindImage:
		if !strings.HasPrefix(ct, "image/") && !isWebP(data) {
			return "", "", ErrAttachmentType
		}
	case model.TicketKindDocument:
		if ext == ".pdf" && ct != "application/pdf" {
			return "", "", ErrAttachmentType
		}
	}
	return kind, ext, nil
}

// SaveAttachment validates, persists the bytes under a random name, runs the
// optional virus-scan hook, and records the row bound to a message.
func (s *TicketService) SaveAttachment(ticketId, messageId, userId int, data []byte, originalName string) (*model.TicketAttachment, error) {
	kind, ext, err := s.ValidateAttachment(data, originalName)
	if err != nil {
		return nil, err
	}
	dir := ticketUploadDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	name := uuid.NewString() + ext
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return nil, err
	}
	if TicketVirusScan != nil {
		if scanErr := TicketVirusScan(path); scanErr != nil {
			_ = os.Remove(path)
			logger.Warning("ticket: attachment rejected by virus scan:", scanErr)
			return nil, ErrAttachmentType
		}
	}
	att := &model.TicketAttachment{
		TicketId: ticketId, MessageId: messageId, UserId: userId,
		FileName: name, OriginalName: sanitizeFileName(originalName),
		MimeType: http.DetectContentType(data), Size: int64(len(data)), Kind: kind,
	}
	if err := database.GetDB().Create(att).Error; err != nil {
		_ = os.Remove(path)
		return nil, err
	}
	s.audit(nil, ticketId, userId, "", model.TicketActionFile, "", att.OriginalName)
	return att, nil
}

func sanitizeFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "" || name == "." || name == ".." {
		return "file"
	}
	if len(name) > 180 {
		name = name[len(name)-180:]
	}
	return name
}

// GetAttachment returns the attachment row and its ticket so the controller can
// run the ownership/RBAC check before streaming the bytes.
func (s *TicketService) GetAttachment(id int) (*model.TicketAttachment, *model.Ticket, error) {
	var att model.TicketAttachment
	if err := database.GetDB().Where("id = ?", id).First(&att).Error; err != nil {
		return nil, nil, ErrTicketNotFound
	}
	ticket, err := s.Get(att.TicketId)
	if err != nil {
		return nil, nil, err
	}
	return &att, ticket, nil
}

// AttachmentFilePath resolves a stored attachment to its absolute path
// (path-traversal guarded).
func (s *TicketService) AttachmentFilePath(fileName string) (string, error) {
	if fileName == "" || filepath.Base(fileName) != fileName {
		return "", ErrTicketNotFound
	}
	return filepath.Join(ticketUploadDir(), fileName), nil
}

// ---------------------------------------------------------------------------
// Audit + dashboard
// ---------------------------------------------------------------------------

func (s *TicketService) AuditLog(ticketId int) ([]model.TicketAuditLog, error) {
	var rows []model.TicketAuditLog
	err := database.GetDB().Where("ticket_id = ?", ticketId).Order("id asc").Limit(500).Find(&rows).Error
	return rows, err
}

// TicketDashboard is the support-team overview.
type TicketDashboard struct {
	Open            int64 `json:"open"`
	WaitingForStaff int64 `json:"waitingForStaff"`
	WaitingForUser  int64 `json:"waitingForUser"`
	Urgent          int64 `json:"urgent"`
	ClosedToday     int64 `json:"closedToday"`
	Overdue         int64 `json:"overdue"`
	AvgResponseMs   int64 `json:"avgResponseMs"`
}

func (s *TicketService) Dashboard() (*TicketDashboard, error) {
	db := database.GetDB()
	d := &TicketDashboard{}
	closed := []string{model.TicketStatusSolved, model.TicketStatusClosed}
	count := func(q *gorm.DB) int64 {
		var n int64
		q.Count(&n)
		return n
	}
	d.Open = count(db.Model(&model.Ticket{}).Where("status NOT IN ?", closed))
	d.WaitingForStaff = count(db.Model(&model.Ticket{}).Where("status IN ?",
		[]string{model.TicketStatusOpen, model.TicketStatusPendingStaff, model.TicketStatusEscalated}))
	d.WaitingForUser = count(db.Model(&model.Ticket{}).Where("status = ?", model.TicketStatusPendingUser))
	d.Urgent = count(db.Model(&model.Ticket{}).Where("priority = ? AND status NOT IN ?", model.TicketPriorityUrgent, closed))
	d.ClosedToday = count(db.Model(&model.Ticket{}).Where("closed_at >= ?", startOfDayMilli(0)))
	d.Overdue = count(db.Model(&model.Ticket{}).Where("first_response_at = 0 AND sla_due_at > 0 AND sla_due_at < ? AND status NOT IN ?",
		nowMilli(), closed))

	// Average first-response time over tickets that have been answered.
	var avg struct{ Avg float64 }
	db.Model(&model.Ticket{}).
		Select("COALESCE(AVG(first_response_at - created_at), 0) AS avg").
		Where("first_response_at > 0").Scan(&avg)
	d.AvgResponseMs = int64(avg.Avg)
	return d, nil
}
