package model

import (
	"regexp"
	"strings"
)

// This file defines multi-tenancy: a Manager owns an isolated Tenant (a
// "workspace"/"panel inside the panel"). The original single-tenant world is
// tenant 0 (the global/admin scope): every tenant_id column defaults to 0, so
// existing data and the admin panel are unchanged and the feature is purely
// additive. Managers create tenants 1..N; their data never crosses tenants.
//
//   - Tenant        — one Manager's workspace: slug, owner, branding domain,
//                     API key, admin-allocated bandwidth quota, status.
//   - TenantSetting — per-tenant key/value config (branding, register toggle,
//                     subscription defaults, gateway config), mirroring the
//                     global Setting table so the manager surface is a subset.

// GlobalTenantId is the sentinel tenant for the original, non-tenant-scoped
// world: the admin panel and all data that predate (or live outside) any
// Manager workspace. A caller resolved to the global scope sees every tenant.
const GlobalTenantId = 0

// NoTenantSentinel is the fail-safe tenant id for a non-admin who is supposed to
// own a workspace but doesn't (a manager whose tenant is missing). Scoped queries
// (`WHERE tenant_id = -1`) match nothing, so such a caller sees an empty panel
// rather than aliasing the admin's tenant-0 data. It is never a real row id.
const NoTenantSentinel = -1

// Tenant is a Manager's isolated workspace. Exactly one Manager owns one tenant.
type Tenant struct {
	Id int `json:"id" gorm:"primaryKey;autoIncrement"`
	// Slug is the URL identifier for the workspace panel (/panel/<slug>). It is
	// unique and validated against ReservedSlugs so it can never collide with a
	// built-in panel page name.
	Slug string `json:"slug" gorm:"uniqueIndex;not null"`
	// ManagerUserId is the users.id of the owning Manager. Unique: a user owns at
	// most one tenant.
	ManagerUserId int    `json:"managerUserId" gorm:"column:manager_user_id;uniqueIndex;not null"`
	Name          string `json:"name" gorm:"default:''"`               // display name / brand
	Status        string `json:"status" gorm:"index;default:'active'"` // active | suspended
	// Domain is an optional custom domain/subdomain that resolves to this tenant's
	// panel. Unique when set; empty means "reachable only via /panel/<slug>".
	// NOTE: no column-level uniqueIndex — both DBs treat '' as a real value, so a
	// plain unique index would allow only ONE workspace with an empty domain.
	// Uniqueness is enforced by a PARTIAL unique index (WHERE domain <> '') created
	// in migrateTenantPartialUniqueIndexes, plus the app-level check in SetDomain.
	Domain string `json:"domain" gorm:"default:''"`
	// ApiKeyHash is the SHA-256 of the tenant's API key (plaintext shown once on
	// rotation). A Bearer token matching it authenticates as this tenant's manager.
	// Empty until a key is minted; uniqueness is a PARTIAL unique index (see Domain)
	// so multiple key-less workspaces can coexist.
	ApiKeyHash string `json:"-" gorm:"column:api_key_hash;default:''"`
	// BandwidthQuotaBytes is admin-allocated capacity the manager resells
	// (0 = unlimited). BandwidthUsedBytes is aggregated from the tenant's client
	// traffic by a background job.
	BandwidthQuotaBytes int64 `json:"bandwidthQuotaBytes" gorm:"column:bandwidth_quota_bytes;default:0"`
	BandwidthUsedBytes  int64 `json:"bandwidthUsedBytes" gorm:"column:bandwidth_used_bytes;default:0"`
	CreatedAt           int64 `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt           int64 `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (Tenant) TableName() string { return "tenants" }

// Tenant status constants.
const (
	TenantActive    = "active"
	TenantSuspended = "suspended"
)

// TenantSetting is a per-tenant key/value config row. Unique on (tenant_id, key)
// so a tenant has at most one value per key; absent keys fall back to the global
// Setting default. The manager-editable key set is a deliberate subset (branding,
// registration, subscription defaults, payment gateways) — infrastructure keys
// (web port, base path, TLS, LDAP, xray) stay global/admin-only.
type TenantSetting struct {
	Id       int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TenantId int    `json:"tenantId" gorm:"column:tenant_id;uniqueIndex:idx_tenant_setting_key,priority:1;not null"`
	Key      string `json:"key" gorm:"uniqueIndex:idx_tenant_setting_key,priority:2;not null"`
	Value    string `json:"value" gorm:"default:''"`
}

func (TenantSetting) TableName() string { return "tenant_settings" }

// ReservedSlugs are the first-path-segment names under /panel/ that are built-in
// pages or API/sub-server prefixes. A tenant slug may never equal one of these,
// otherwise /panel/<slug> would shadow (or be shadowed by) a real route. This
// list is mirrored by the frontend reserved-words check; keep them in sync.
var ReservedSlugs = map[string]bool{
	"api": true, "setting": true, "settings": true, "xray": true, "ws": true,
	"csrf-token": true, "api-docs": true, "inbounds": true, "clients": true,
	"groups": true, "users": true, "profile": true, "billing": true,
	"nodes": true, "store": true, "orders": true, "products": true,
	"services": true, "referral": true, "manual-deposit": true,
	"manual-deposits": true, "tickets": true, "support": true, "finance": true,
}

// slugPattern allows lowercase letters, digits and single hyphens (3-32 chars),
// not starting/ending with a hyphen — DNS-label-ish so a slug also works as a
// subdomain label.
var slugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`)

// IsReservedSlug reports whether s collides with a built-in route name.
func IsReservedSlug(s string) bool {
	return ReservedSlugs[strings.ToLower(strings.TrimSpace(s))]
}

// ValidateSlug reports whether s is a syntactically valid, non-reserved tenant
// slug. It does NOT check uniqueness (that is a DB concern).
func ValidateSlug(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	return slugPattern.MatchString(s) && !IsReservedSlug(s)
}
