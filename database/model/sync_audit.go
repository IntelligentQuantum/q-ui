package model

// SyncAudit is an append-only record of a single client-inbound synchronization
// operation triggered by a product/inbound change or the reconciliation worker.
// It answers "who changed what, on which client, with what result" — the audit
// trail required for diagnosing partial syncs and drift.
type SyncAudit struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatedAt   int64  `json:"createdAt" gorm:"column:created_at;autoCreateTime:milli;index"`
	Actor       string `json:"actor" gorm:"column:actor;default:''"`     // username or "system"/"reconcile-worker"
	ProductId   int    `json:"productId" gorm:"column:product_id;index"` // 0 when not product-scoped
	ClientEmail string `json:"clientEmail" gorm:"column:client_email;index"`
	Action      string `json:"action" gorm:"column:action"`                     // attach | detach | reconcile
	InboundIds  string `json:"inboundIds" gorm:"column:inbound_ids;default:''"` // CSV of affected inbound ids
	Result      string `json:"result" gorm:"column:result;index"`               // ok | error
	Detail      string `json:"detail" gorm:"column:detail;default:''"`          // error message / note
}

// TableName pins the table name regardless of GORM's pluralizer.
func (SyncAudit) TableName() string { return "sync_audits" }

// Sync audit action / result constants.
const (
	SyncActionAttach    = "attach"
	SyncActionDetach    = "detach"
	SyncActionReconcile = "reconcile"

	SyncResultOK    = "ok"
	SyncResultError = "error"
)
