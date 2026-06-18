package service

import (
	"encoding/json"
	"strings"

	"github.com/google/uuid"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// GetOwnerByEmail returns the owner_id of the client with the given email, or
// gorm.ErrRecordNotFound when no such client exists. Used by the controller to
// enforce per-user ownership before mutating a client.
func (s *ClientService) GetOwnerByEmail(email string) (int, error) {
	var rec model.ClientRecord
	if err := database.GetDB().Select("owner_id").Where("email = ?", email).First(&rec).Error; err != nil {
		return 0, err
	}
	return rec.OwnerId, nil
}

// GetClientScopeByEmail returns the owner_id and tenant_id of the client with
// the given email. Used by the controller to authorize a mutation: a manager may
// act on any client in their tenant; a reseller/member only on clients they own.
func (s *ClientService) GetClientScopeByEmail(email string) (ownerId, tenantId int, err error) {
	var rec model.ClientRecord
	if e := database.GetDB().Select("owner_id, tenant_id").Where("email = ?", email).First(&rec).Error; e != nil {
		return 0, 0, e
	}
	return rec.OwnerId, rec.TenantId, nil
}

// GetOwnerBySubID returns the owner_id of the client owning the given subId.
func (s *ClientService) GetOwnerBySubID(subID string) (int, error) {
	var rec model.ClientRecord
	if err := database.GetDB().Select("owner_id").Where("sub_id = ?", subID).First(&rec).Error; err != nil {
		return 0, err
	}
	return rec.OwnerId, nil
}

// recordToClient projects a stored ClientRecord into the in-settings
// model.Client shape that Create/Update operate on. Notably it maps the
// record's UUID column onto Client.ID (the protocol identifier) and parses the
// reverse JSON. Use this whenever you need to feed an existing client back
// through the update path — never reconstruct the payload by hand (the record
// and the settings client have different field names, e.g. id vs uuid).
func recordToClient(rec *model.ClientRecord) model.Client {
	c := model.Client{
		ID:         rec.UUID,
		Security:   rec.Security,
		Password:   rec.Password,
		Flow:       rec.Flow,
		Auth:       rec.Auth,
		Email:      rec.Email,
		LimitIP:    rec.LimitIP,
		TotalGB:    rec.TotalGB,
		ExpiryTime: rec.ExpiryTime,
		Enable:     rec.Enable,
		TgID:       rec.TgID,
		SubID:      rec.SubID,
		Group:      rec.Group,
		Comment:    rec.Comment,
		Reset:      rec.Reset,
		CreatedAt:  rec.CreatedAt,
		UpdatedAt:  rec.UpdatedAt,
	}
	if strings.TrimSpace(rec.Reverse) != "" {
		var rev model.ClientReverse
		if json.Unmarshal([]byte(rec.Reverse), &rev) == nil {
			c.Reverse = &rev
		}
	}
	return c
}

// attachOwnerNames resolves owner usernames onto every row keyed by the
// distinct owner ids present, so the admin clients list can display the owner
// and the free-text search can match by owner name (one query).
func (s *ClientService) attachOwnerNames(rows []ClientWithAttachments) {
	ownerIds := make([]int, 0)
	seen := map[int]bool{}
	for i := range rows {
		if id := rows[i].OwnerId; id > 0 && !seen[id] {
			seen[id] = true
			ownerIds = append(ownerIds, id)
		}
	}
	if len(ownerIds) == 0 {
		return
	}
	var owners []model.User
	if err := database.GetDB().Select("id, username").Where("id IN ?", ownerIds).Find(&owners).Error; err != nil {
		return
	}
	nameById := make(map[int]string, len(owners))
	for _, u := range owners {
		nameById[u.Id] = u.Username
	}
	for i := range rows {
		rows[i].OwnerName = nameById[rows[i].OwnerId]
	}
}

// RotateOptions controls what Rotate changes on a client.
type RotateOptions struct {
	NewEmail   string // rename the config when non-empty
	Enable     *bool  // toggle enable when non-nil
	Regenerate bool   // issue a fresh subscription ID + protocol secrets
}

// Rotate edits a client's email/enable and optionally regenerates its
// subscription ID and protocol secrets (UUID / password / Hysteria auth). The
// stored record is rebuilt into a model.Client server-side so callers never
// reconstruct the protocol-specific payload, and the change is applied through
// the normal update path (which syncs every owning inbound and restarts xray).
func (s *ClientService) Rotate(inboundSvc *InboundService, email string, opts RotateOptions) (bool, error) {
	rec, err := s.GetRecordByEmail(nil, email)
	if err != nil {
		return false, err
	}
	updated := recordToClient(rec)
	if strings.TrimSpace(opts.NewEmail) != "" {
		updated.Email = strings.TrimSpace(opts.NewEmail)
	}
	if opts.Enable != nil {
		updated.Enable = *opts.Enable
	}
	if opts.Regenerate {
		updated.SubID = uuid.NewString()
		updated.ID = ""       // regenerated per-protocol by Update -> fillProtocolDefaults
		updated.Password = "" // trojan / shadowsocks
		updated.Auth = ""     // hysteria
	}
	return s.UpdateByEmail(inboundSvc, email, updated)
}
