# Manager Multi-Tenancy — Phase 3: Design

## 1. Core concept: `tenant_id = 0` is "the original panel"

The single most important design decision:

> **The existing admin panel and all existing data live in tenant 0 (the global
> scope). Managers create tenants 1..N. Nothing existing moves.**

This makes the whole feature *additive*: every new scoping column defaults to
`0`, admin keeps seeing everything, and the admin panel is untouched by
construction. There is no risky data migration — only a backfill to the default.

A **Tenant** *is* a Manager's workspace: one Manager owns exactly one tenant; a
tenant has many sub-users (members/resellers), products, clients, finance,
tickets, settings, branding, payment config.

## 2. Data model

### 2.1 New table `tenants` (`model/tenant.go`)

```go
type Tenant struct {
    Id                  int    `gorm:"primaryKey;autoIncrement"`
    Slug                string `gorm:"uniqueIndex;not null"`   // URL id, reserved-word checked
    ManagerUserId       int    `gorm:"uniqueIndex;not null"`   // owning Manager (users.id)
    Name                string `gorm:"default:''"`             // display name
    Status              string `gorm:"index;default:'active'"` // active | suspended
    Domain              string `gorm:"uniqueIndex;default:''"` // optional custom domain
    ApiKeyHash          string `gorm:"uniqueIndex;default:''"` // SHA-256 of manager API key
    BandwidthQuotaBytes int64  `gorm:"default:0"`              // admin-allocated (0 = unlimited)
    BandwidthUsedBytes  int64  `gorm:"default:0"`              // aggregated from client traffic
    CreatedAt           int64  `gorm:"autoCreateTime:milli"`
    UpdatedAt           int64  `gorm:"autoUpdateTime:milli"`
}
```

### 2.2 New table `tenant_settings` (`model/tenant_setting.go`)

Per-tenant key-value, mirroring the global `settings` pattern so the manager
settings surface is a *subset* with the same shape:

```go
type TenantSetting struct {
    Id       int    `gorm:"primaryKey;autoIncrement"`
    TenantId int    `gorm:"uniqueIndex:idx_tenant_key,priority:1;not null"`
    Key      string `gorm:"uniqueIndex:idx_tenant_key,priority:2;not null"`
    Value    string
}
```

Manager-editable keys (subset; everything else falls back to global default):
`brandTitle`, `brandLogo`, `brandFavicon`, `theme`, `landing*`, `registrationEnable`,
`subTitle`/`subPath`/`subDomain` defaults, `zarinpalEnable`/`zarinpalMerchantId`,
`plisioEnable`/`plisioSecretKey`, crypto/wallet addresses.
**Never** manager-editable: `webPort`, `webBasePath`, TLS, LDAP, xray, session —
these stay in the global `settings` table, admin-only.

### 2.3 `tenant_id` columns (`default:0;index`) added to

`users`, `clients`, `products`, `orders`, `transactions`, `payments`,
`manual_deposit_requests`, `payment_cards`, `tickets`, `ticket_categories`,
`referrals`, `notifications`.

Child tables (`ticket_messages`, `ticket_attachments`, `client_inbounds`, …)
inherit tenant via their parent — no column needed.

`inbounds`/`nodes` stay **infra** (tenant 0): managers sell *bandwidth on admin
infra*, they do not manage inbounds. A manager's client (`tenant_id = N`) still
attaches via `client_inbounds` to an admin inbound (`tenant_id = 0`).

### 2.4 Migration / backfill (seeders in `db.go`)

1. `AutoMigrate` adds `tenants`, `tenant_settings`, and every `tenant_id` column
   (GORM adds columns with the `default:0`).
2. Seeder `TenantBackfill`: no-op for fresh installs; for existing installs all
   rows already read `0`. Idempotent, recorded in `history_of_seeders`.
3. No FK enforcement (`DisableForeignKeyConstraintWhenMigrating: true`) → safe.

## 3. RBAC: the `manager` role

Add to `model/rbac.go` / `model/model.go`:

```go
const RoleManager = "manager"   // owns an isolated tenant/workspace
```

Wire into `NormalizeRole`, `IsValidRole`, add `IsManager()`. **`manager`
normalizes to itself** (it is a first-class role, not folded).

New permissions (tenant-scoped capabilities the existing set doesn't express):

```go
PermTenantSettings  = "tenant.settings"   // edit own workspace settings/branding/domain/register/subscription
PermTenantPayments  = "tenant.payments"   // edit own gateways + card numbers
PermTenantUsers     = "tenant.users"      // manage member/reseller within own tenant (NOT manager/admin)
```

Manager's permission set (all **implicitly tenant-scoped** by the tenant
middleware):

```
product.manage, product.view, product.purchase,
client.manage, customer.view,
order.view_all, order.view_own, balance.view_own, balance.manage(*own tenant*),
finance.view_all (*own tenant*), deposit.manage (*own tenant*),
ticket.create, ticket.view_own, ticket.manage, ticket.admin (*own tenant*),
tenant.settings, tenant.payments, tenant.users
```

Manager **never** gets: `infra.manage`, `user.manage` (system role mgmt),
`stats.view_all`/`transaction.view_all` (global), and can never create a
manager/admin or touch another tenant — enforced server-side (§5).

Admin (`Can()` returns true for everything) additionally gets **global** scope
via the tenant middleware (effective tenant = 0/all). New admin-only oversight
permission: `PermManagerAdmin = "manager.admin"` (list/suspend/delete/impersonate
managers, allocate bandwidth, rotate keys).

## 4. Tenant context (backend)

### 4.1 Resolver — `middleware/tenant.go` (runs after auth, before handlers)

Resolution precedence for the **effective tenant**:

1. **Custom domain:** if `Host` matches `tenants.domain` → that tenant.
2. **Authenticated user:** `user.TenantId` (a manager and all their sub-users
   carry their tenant id). This is the **server-side source of truth.**
3. **Manager API key:** Bearer token matching `tenants.api_key_hash` → that
   tenant's manager.
4. **Admin impersonation:** if `user.IsAdmin()` and request carries
   `?tenant=<id>` / `X-Tenant: <id>` → that tenant (admin only, audited).
5. **Admin default:** admin with no impersonation → effective tenant **0 = all**
   (global scope; sees everything).

Sets on `gin.Context`: `tenant_id` (int), `tenant_scope` (`"global"` |
`"tenant"`). **The URL slug is used only for routing/branding and is
cross-checked against the resolved tenant — never trusted as the authority.** A
manager requesting a slug that isn't theirs → 403.

```go
func TenantFromContext(c *gin.Context) (id int, global bool)
```

### 4.2 Query scoping — `model/scope.go`

A single reusable GORM scope so no service hand-writes `WHERE tenant_id`:

```go
// Global scope (admin, tenant 0 + no impersonation) → no filter.
// Tenant scope → WHERE tenant_id = ?.
func TenantScope(tenantId int, global bool) func(*gorm.DB) *gorm.DB
```

Every tenant-owned repository query does `.Scopes(model.TenantScope(...))`.
Writes set `tenant_id` from context on create. This is the **one** place scoping
lives — eliminating the per-controller duplication that exists for ownership
today.

### 4.3 Relationship to existing ownership

Tenant scope and ownership compose: tenant scope answers *which workspace*,
existing `owner_id`/`user_id` ownership answers *which row within it*. A reseller
inside tenant N still only sees their own clients (owner) **and** only tenant N
(tenant scope). Admin bypasses both.

## 5. Security model (server-side, mandatory)

- **Default-deny tenant:** non-admins always run in tenant scope = their own
  tenant. There is no client-controlled path to widen it.
- **No trust in slug / `tenant_id` from client:** the only client-supplied
  tenant signal honored is admin impersonation, gated by `RequireAdmin`.
- **IDOR:** every `:id` lookup runs through `TenantScope`, so fetching another
  tenant's order/ticket/product 404s.
- **Privilege escalation guard (`tenant.users`):** `UserService` rejects, for a
  manager caller: target in a different tenant, target role ∈ {admin, manager},
  or setting a role to {admin, manager}. Managers may only CRUD/promote between
  `member` ↔ `reseller` within their tenant.
- **Slug spoofing:** `TenantLayout` + backend verify slug↔tenant match.
- **API key leakage:** stored only as SHA-256; shown once on rotate; per-tenant.
- **Callback safety:** payment/deposit rows persist `tenant_id` so
  unauthenticated gateway callbacks resolve the correct tenant without a session.
- **Impersonation audit:** every admin impersonation writes a `sync_audit`-style
  audit row.

## 6. URL & routing design

### 6.1 The collision and its resolution

Spec wants `/panel/ApiMehdi`. But `/panel/inbounds`, `/panel/clients`, … are
explicit static Gin routes, and Gin cannot mount a catch-all (`/panel/*any`)
beside static siblings. Resolution:

- **Reuse `engine.NoRoute`.** Keep all API/static/sub routes as real routes
  (matched first). In `NoRoute`: if it's a `GET` for an HTML navigation under
  `<basePath>panel/` that didn't match anything else, **serve the SPA shell**
  (`index.html`). Otherwise 404. This serves `/panel/ApiMehdi`,
  `/panel/ApiMehdi/products`, and any future page with zero per-page route
  churn, and cannot shadow `/panel/api`, `/panel/setting`, `/panel/xray`,
  `/sub`, `/assets` (those match first).
- **Reserved slugs:** slug creation rejects any value equal to a top-level page
  name (`inbounds`, `clients`, `products`, `orders`, `settings`, `api`, `xray`,
  `setting`, `finance`, `tickets`, `support`, `store`, `services`, `users`,
  `groups`, `nodes`, `billing`, `profile`, `referral`, `manual-deposit`,
  `manual-deposits`, `ws`, `csrf-token`, `api-docs`). One shared list, enforced
  backend (validation) and frontend (router precedence).

### 6.2 Frontend routing (`routes.tsx`)

`basename` stays `<basePath>/panel`. Add a sibling dynamic layout route; React
Router ranks static segments above dynamic, so admin pages keep matching and
only unknown first segments fall through to the tenant route:

```
[
  { path: '/',           element: <PanelLayout/>,  children: [ …admin/global pages… ] },
  { path: '/:tenantSlug', element: <TenantLayout/>, children: [ …manager pages… ] },
]
```

`TenantLayout` reads `:tenantSlug`, validates it against `useMe()` (a manager may
only use their own slug; admin may use any during impersonation), provides a
`TenantContext`, and applies tenant branding. Manager nav links are
slug-prefixed; API calls stay at `/panel/api/*` (tenant resolved server-side, so
**axios needs no slug** — contrary to the initial brief).

### 6.3 API path

API stays `/panel/api/...`. No slug in API paths. Tenant comes from the
authenticated session/key (§4.1). This keeps the API surface stable, the
OpenAPI/codegen unchanged, and removes a whole class of spoofing.

## 7. Manager authentication & onboarding

- Admin creates a Manager: creates a `users` row (`role=manager`,
  `tenant_id = <new tenant>`) + a `tenants` row (slug, manager_user_id) +
  generates an API key (returns plaintext once).
- Manager logs in via the normal `/login`. On success, `/me` returns
  `role=manager`, `tenantId`, `tenantSlug`, branding → SPA routes them into
  `/panel/<slug>`.
- Sub-users (members/resellers) of a tenant register via the manager's
  slug/domain landing; registration stamps `tenant_id` from the resolved tenant.

## 8. What stays global / untouched (admin panel safety)

`settings` (global), `nodes`, `inbounds`, `xray`, LDAP, `custom_geo_resources`,
`api_tokens` (global), `client_groups`, web server config. Admin's experience at
tenant 0 is byte-for-byte unchanged; the RBAC matrix for admin/moderator/
reseller/member is unchanged except admin gains global-scope semantics and the
new `manager` role is added.
