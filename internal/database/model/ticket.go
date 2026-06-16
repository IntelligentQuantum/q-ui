package model

// This file defines the support-ticketing (helpdesk) subsystem. It is designed
// to scale to 100k+ tickets: every column a list/filter/search query touches is
// indexed, the conversation thread and attachments are separate rows (lazy
// loaded), and an append-only audit log records every state change.
//
//   - TicketCategory   — admin-configured, ordered category list.
//   - Ticket           — the case itself: owner, category, priority, status,
//                        assignee, SLA due time, denormalized last-reply/counts.
//   - TicketMessage    — one entry in the threaded conversation (public reply,
//                        staff-only internal note, or a system event line).
//   - TicketAttachment — an uploaded file bound to a message; the bytes live on
//                        disk and are only served through an authorized endpoint.
//   - TicketAuditLog   — append-only history (who did what, old -> new).

// TicketCategory is an admin-managed bucket a ticket is filed under.
type TicketCategory struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Name         string `json:"name" gorm:"not null"`
	Description  string `json:"description" gorm:"default:''"`
	DisplayOrder int    `json:"displayOrder" gorm:"column:display_order;default:0;index"`
	Status       string `json:"status" gorm:"index;default:'active'"` // active | inactive
	CreatedAt    int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt    int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (TicketCategory) TableName() string { return "ticket_categories" }

// Ticket is a single support case. The thread (TicketMessage) and files
// (TicketAttachment) hang off it; the denormalized LastReply*/MessageCount keep
// list views fast without joining the thread.
type Ticket struct {
	Id     int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Number string `json:"number" gorm:"uniqueIndex;not null"` // TCK-YYYY-NNNNNN
	// UserId owns the ticket; ownership scoping for members/resellers keys off it.
	UserId     int    `json:"userId" gorm:"index;not null;column:user_id"`
	CategoryId int    `json:"categoryId" gorm:"index;column:category_id"`
	Subject    string `json:"subject" gorm:"not null"`
	Priority   string `json:"priority" gorm:"index;default:'normal'"` // low|normal|high|urgent
	Status     string `json:"status" gorm:"index;default:'open'"`     // see status constants
	// AssignedTo is the staff user handling the ticket (0 = unassigned).
	AssignedTo      int   `json:"assignedTo" gorm:"index;column:assigned_to;default:0"`
	AssignedBy      int   `json:"assignedBy" gorm:"column:assigned_by;default:0"`
	AssignedAt      int64 `json:"assignedAt" gorm:"column:assigned_at;default:0"`
	SLADueAt        int64 `json:"slaDueAt" gorm:"column:sla_due_at;index;default:0"`    // first-response deadline (ms)
	FirstResponseAt int64 `json:"firstResponseAt" gorm:"column:first_response_at;default:0"` // first staff reply (ms); 0 = none
	LastReplyAt     int64 `json:"lastReplyAt" gorm:"column:last_reply_at;index;default:0"`
	LastReplyBy     int   `json:"lastReplyBy" gorm:"column:last_reply_by;default:0"`
	MessageCount    int   `json:"messageCount" gorm:"column:message_count;default:0"`
	ReopenCount     int   `json:"reopenCount" gorm:"column:reopen_count;default:0"`
	ClosedAt        int64 `json:"closedAt" gorm:"column:closed_at;default:0"`
	CreatedAt       int64 `json:"createdAt" gorm:"autoCreateTime:milli;index"`
	UpdatedAt       int64 `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (Ticket) TableName() string { return "tickets" }

// TicketMessage is one entry in a ticket's chronological thread.
type TicketMessage struct {
	Id       int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TicketId int    `json:"ticketId" gorm:"index:idx_tmsg_ticket_created,priority:1;not null;column:ticket_id"`
	UserId   int    `json:"userId" gorm:"index;column:user_id"`
	Body     string `json:"body" gorm:"type:text"` // sanitized HTML
	// IsInternal marks a staff-only note that owners (members/resellers) never see.
	IsInternal bool  `json:"isInternal" gorm:"column:is_internal;index;default:false"`
	// IsSystem marks an auto-generated event line (e.g. "status changed to solved").
	IsSystem  bool  `json:"isSystem" gorm:"column:is_system;default:false"`
	CreatedAt int64 `json:"createdAt" gorm:"autoCreateTime:milli;index:idx_tmsg_ticket_created,priority:2"`
}

func (TicketMessage) TableName() string { return "ticket_messages" }

// TicketAttachment is a file bound to a message. Bytes live on disk under a
// random name; FileName is that name, never a client path. Served only through
// the authorized streaming endpoint.
type TicketAttachment struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TicketId     int    `json:"ticketId" gorm:"index;not null;column:ticket_id"`
	MessageId    int    `json:"messageId" gorm:"index;column:message_id"`
	UserId       int    `json:"userId" gorm:"column:user_id"`
	FileName     string `json:"-" gorm:"column:file_name;not null"` // stored uuid name (never exposed)
	OriginalName string `json:"originalName" gorm:"column:original_name"`
	MimeType     string `json:"mimeType" gorm:"column:mime_type"`
	Size         int64  `json:"size"`
	Kind         string `json:"kind"` // image | video | document | archive
	CreatedAt    int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
}

func (TicketAttachment) TableName() string { return "ticket_attachments" }

// TicketAuditLog is the append-only history of everything that happened to a
// ticket. OldValue/NewValue capture the transition for state-changing actions.
type TicketAuditLog struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TicketId  int    `json:"ticketId" gorm:"index;not null;column:ticket_id"`
	ActorId   int    `json:"actorId" gorm:"column:actor_id;index"`
	ActorName string `json:"actorName" gorm:"column:actor_name;default:''"`
	Action    string `json:"action" gorm:"index"` // see action constants
	OldValue  string `json:"oldValue" gorm:"column:old_value;default:''"`
	NewValue  string `json:"newValue" gorm:"column:new_value;default:''"`
	CreatedAt int64  `json:"createdAt" gorm:"autoCreateTime:milli;index"`
}

func (TicketAuditLog) TableName() string { return "ticket_audit_logs" }

// Category status.
const (
	TicketCategoryActive   = "active"
	TicketCategoryInactive = "inactive"
)

// Ticket priorities (ascending urgency).
const (
	TicketPriorityLow    = "low"
	TicketPriorityNormal = "normal"
	TicketPriorityHigh   = "high"
	TicketPriorityUrgent = "urgent"
)

// IsValidTicketPriority reports whether p is a known priority.
func IsValidTicketPriority(p string) bool {
	switch p {
	case TicketPriorityLow, TicketPriorityNormal, TicketPriorityHigh, TicketPriorityUrgent:
		return true
	default:
		return false
	}
}

// Ticket statuses.
const (
	TicketStatusOpen         = "open"
	TicketStatusPendingUser  = "pending_user"  // waiting on the requester
	TicketStatusPendingStaff = "pending_staff" // waiting on support
	TicketStatusInProgress   = "in_progress"
	TicketStatusEscalated    = "escalated"
	TicketStatusSolved       = "solved"
	TicketStatusClosed       = "closed"
)

// IsValidTicketStatus reports whether s is a known status.
func IsValidTicketStatus(s string) bool {
	switch s {
	case TicketStatusOpen, TicketStatusPendingUser, TicketStatusPendingStaff,
		TicketStatusInProgress, TicketStatusEscalated, TicketStatusSolved, TicketStatusClosed:
		return true
	default:
		return false
	}
}

// TicketStatusIsClosed reports whether a status counts as terminal (solved/closed).
func TicketStatusIsClosed(s string) bool {
	return s == TicketStatusSolved || s == TicketStatusClosed
}

// Attachment kinds (drives the UI viewer: inline image / video player / doc).
const (
	TicketKindImage    = "image"
	TicketKindVideo    = "video"
	TicketKindDocument = "document"
	TicketKindArchive  = "archive"
)

// Audit actions.
const (
	TicketActionCreated   = "created"
	TicketActionReply     = "reply"
	TicketActionNote      = "note"
	TicketActionAssign    = "assign"
	TicketActionTransfer  = "transfer"
	TicketActionStatus    = "status"
	TicketActionPriority  = "priority"
	TicketActionEscalate  = "escalate"
	TicketActionFile      = "file"
	TicketActionClose     = "close"
	TicketActionReopen    = "reopen"
	TicketActionMerge     = "merge"
)
