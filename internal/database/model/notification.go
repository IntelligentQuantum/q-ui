package model

// Notification is a per-user in-app notification shown in the panel's bell menu.
// Title and Body store i18n KEYS (not rendered text) and Params is a JSON object
// of interpolation values, so the message renders in each recipient's own UI
// language at display time. Level drives the icon/color; Link is an optional SPA
// path the notification deep-links to when clicked.
type Notification struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"userId" gorm:"index;not null;column:user_id"`
	TenantId  int    `json:"tenantId" gorm:"column:tenant_id;index;default:0"` // workspace scope (0 = global/admin)
	Title     string `json:"title"`                                            // i18n key
	Body      string `json:"body"`                                             // i18n key
	Params    string `json:"params" gorm:"default:''"`                         // JSON object of interpolation values
	Level     string `json:"level" gorm:"default:'info'"`                      // info | success | warning | error
	Link      string `json:"link" gorm:"default:''"`                           // optional SPA path
	Read      bool   `json:"read" gorm:"default:false;index:idx_notif_user_read"`
	CreatedAt int64  `json:"createdAt" gorm:"autoCreateTime:milli;index"`
}

func (Notification) TableName() string { return "notifications" }

// Notification level constants.
const (
	NotificationInfo    = "info"
	NotificationSuccess = "success"
	NotificationWarning = "warning"
	NotificationError   = "error"
)
