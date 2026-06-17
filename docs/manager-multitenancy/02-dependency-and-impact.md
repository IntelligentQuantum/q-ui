# Manager Multi-Tenancy — Phase 2: Dependency Graph & Impact Analysis

## 1. Module dependency graph

```
                       ┌─────────────────────────────┐
                       │ internal/database/model     │  ← schema (GORM structs)
                       │  model.go rbac.go commerce…  │     SHARED — never duplicate
                       └──────────────┬──────────────┘
                                      │ imported by everything
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                              ▼
┌───────────────┐          ┌────────────────────┐         ┌──────────────────┐
│ web/session   │          │ web/service/*      │         │ web/middleware/* │
│ GetLoginUser  │◄────────►│ user, wallet,      │◄───────►│ rbac (Require*)  │
│ SetLoginUser  │          │ product, order,    │         │ security (CSRF)  │
│ csrf          │          │ ticket, finance,   │         └────────┬─────────┘
└───────┬───────┘          │ deposit, setting…  │                  │
        │                  └─────────┬──────────┘                  │
        │                            │                             │
        └──────────────┬─────────────┴──────────────┬──────────────┘
                       ▼                             ▼
              ┌────────────────────┐       ┌────────────────────┐
              │ web/controller/*   │──────►│ web/entity (Msg,    │
              │ (HTTP surfaces)    │       │ AllSetting)         │
              └─────────┬──────────┘       └─────────┬──────────┘
                        │ web.go mounts                │ openapigen reads
                        ▼                              ▼
              ┌────────────────────┐       ┌────────────────────────────┐
              │ web/web.go (Gin)   │       │ frontend/src/generated/*    │
              └────────────────────┘       │ types.ts zod.ts schemas.ts  │
                                           └─────────────┬───────────────┘
                                                         ▼
                              ┌──────────────────────────────────────────┐
                              │ frontend: routes.tsx, PanelLayout,        │
                              │ AppSidebar, useMe, api/*, pages/*         │
                              └──────────────────────────────────────────┘
```

### Files that are shared and must never be duplicated

- `internal/database/model/rbac.go` — **single source of truth** for roles &
  permissions. The new `manager` role and any new permissions go here; the
  frontend `useMe.ts` `Role`/`Permission` unions and `PanelLayout.canAccess`
  must be kept in lockstep (manual mirror — there is no codegen for the RBAC
  matrix).
- `internal/web/session/session.go` — the *only* place identity is resolved.
  Tenant resolution must hang off this, not be re-implemented per controller.
- `internal/web/middleware/rbac.go` — the *only* permission gate. The new tenant
  guard belongs alongside it as a sibling middleware, not inline in controllers.
- `internal/web/entity/entity.go` (`AllSetting`) + `tools/openapigen` — changing
  a model/entity struct regenerates the frontend types. Per-tenant settings must
  not bloat the global `AllSetting`.
- `internal/web/service/setting.go` (`SettingService`) — every subsystem reads
  config through it. Tenant-aware reads must be added here, not bypassed.
- `frontend/src/hooks/useMe.ts` — single frontend identity source; tenant
  slug/branding should flow through `/me`, reusing this hook.

## 2. Impact analysis per feature

Legend for "DB": **+col** = add nullable/`default:0` column; **+table** = new
table; **migrate** = backfill seeder needed.

### F1 — `manager` role + Tenant (Workspace) entity

- **Files:** `model/rbac.go` (role const, matrix, `IsManager`, `IsValidRole`),
  `model/model.go` (`NormalizeRole`), new `model/tenant.go`, `db.go`
  (AutoMigrate + seeder), `useMe.ts`, `PanelLayout.tsx`.
- **APIs:** none broken; `/me` gains `tenantId`, `tenantSlug`, `isManager`.
- **DB:** **+table** `tenants`; **+col** `users.tenant_id` (default 0).
  **migrate**: existing rows → `tenant_id = 0` (the global/admin scope).
- **UI:** new admin "Managers" page; nav gains manager-scoped items.
- **Breaking:** none — `tenant_id = 0` reproduces today's single-tenant world.

### F2 — Tenant context (resolver middleware + query scope)

- **Files:** new `web/tenant/context.go` (ctx helpers), new
  `middleware/tenant.go`, `session/session.go` (wire-in), `model/scope.go`
  (GORM `TenantScope`). Every tenant-scoped service gains a tenant filter.
- **APIs:** all `/panel/api/*` gain implicit tenant scoping (transparent).
- **DB:** none beyond F1/F3.
- **Breaking:** risk of over/under-scoping — mitigated by defaulting admin to
  global and adding tests per service.

### F3 — Tenant-owned data (products, orders, finance, clients, users, tickets)

- **Files:** the owning services + controllers; `model/*` for `+col`.
- **DB:** **+col `tenant_id` (default 0, indexed)** on: `clients`, `products`,
  `orders`, `transactions`, `payments`, `manual_deposit_requests`,
  `payment_cards`, `tickets`, `ticket_categories`, `referrals`,
  `notifications`. **migrate**: backfill `0`.
- **APIs affected:** `/products`, `/orders`, `/billing/*`, `/tickets/*`,
  `/finance/*`, `/clients`, `/referral`, `/notification`.
- **UI:** unchanged shape (data just gets scoped); admin gains a tenant filter.
- **Breaking:** none if every query that today returns "all" is updated to honor
  effective tenant; **the central risk is a missed query → cross-tenant leak.**

### F4 — Per-tenant settings (branding, register, domain, subscription)

- **Files:** new `model/tenant_setting.go` (`+table tenant_settings`), new
  `service/tenant_setting.go`, new `controller/tenant_setting.go`
  (`/panel/api/tenant/settings`), frontend manager settings page.
- **DB:** **+table** `tenant_settings (id, tenant_id, key, value)` unique
  `(tenant_id, key)`.
- **APIs:** new manager-scoped settings endpoints; existing global
  `/panel/setting/*` stays admin-only and unchanged.
- **UI:** new "Workspace Settings" page (subset of admin settings).
- **Breaking:** none — global `AllSetting` untouched.

### F5 — Per-tenant payment gateways + card numbers

- **Files:** `service/zarinpal.go`, `service/plisio.go`, `service/deposit.go`,
  `service/payment.go` read gateway config via tenant settings (F4) with global
  fallback; `payment_cards.tenant_id` (F3).
- **DB:** covered by F3/F4.
- **APIs:** `/billing/*` callbacks must resolve tenant from the payment record,
  not the session (callbacks are unauthenticated) → store `tenant_id` on
  `payments`/`manual_deposit_requests`.
- **Breaking:** ZarinPal/Plisio callback URLs must carry the tenant — verify
  before enabling per-tenant gateways.

### F6 — Custom domain per tenant

- **Files:** `middleware/tenant.go` (Host-header → tenant resolution), `web.go`
  (relax `DomainValidatorMiddleware` to allow registered tenant domains),
  `model/tenant.go` (`domain` column).
- **DB:** `tenants.domain` (unique, nullable).
- **Breaking:** interacts with `DomainValidatorMiddleware` (currently rejects
  non-`webDomain` hosts) — must whitelist tenant domains.

### F7 — Manager API key

- **Files:** `controller/api.go` (`checkAPIAuth` resolves tenant key → manager
  user, not first admin), `model/tenant.go` (`api_key_hash`),
  admin Managers page (rotate key).
- **DB:** `tenants.api_key_hash` (unique).
- **Breaking:** existing global `api_tokens` keep resolving to admin — additive.

### F8 — Bandwidth business model (admin allocates, manager sells)

- **Files:** `model/tenant.go` (`bandwidth_quota_bytes`,
  `bandwidth_used_bytes`), new aggregation job in `web/job/`, `OrderService`
  quota check.
- **DB:** columns on `tenants` (+ optional `tenant_bandwidth_ledger` table).
- **Breaking:** none; gating provisioning on quota is opt-in per tenant.

### F9 — Admin oversight (list/suspend/delete/impersonate/recharge)

- **Files:** new `controller/manager.go` + `service/manager.go`
  (`/panel/api/admin/managers/*`, admin-only), impersonation via admin-only
  `X-Tenant`/`?tenant=` honored in `middleware/tenant.go`.
- **DB:** none beyond above.
- **Breaking:** impersonation must be strictly `RequireAdmin` + audited.

### F10 — Frontend tenant routing & branding

- **Files:** `routes.tsx` (add `/:tenantSlug` layout route + `TenantLayout`),
  `spa.go`/`web.go` `NoRoute` (serve SPA for `/panel/<slug>/*`),
  `useMe.ts`/branding, `AppSidebar`/`PanelLayout` (slug-aware links + manager nav
  set), slug-reserved-words list shared with backend validation.
- **DB:** none.
- **Breaking:** `NoRoute` change must not shadow `/panel/api`, `/panel/setting`,
  `/panel/xray`, `/sub`, `/assets` — only serve SPA for unmatched GET HTML
  navigations under `/panel/`.

## 3. Cross-cutting breaking-change risks (ranked)

1. **Cross-tenant data leak** (F2/F3) — a single query that forgets the tenant
   scope. Mitigation: centralized `TenantScope` + per-service tests +
   default-deny effective tenant.
2. **Unauthenticated callback tenant loss** (F5) — gateway callbacks have no
   session. Mitigation: persist `tenant_id` on the payment row.
3. **Route shadowing** (F10) — `NoRoute`/catch-all eclipsing API or sub-server
   routes. Mitigation: strict prefix checks; keep API groups as real routes.
4. **RBAC drift** (F1) — backend matrix and frontend mirror diverging.
   Mitigation: change both in the same commit; `/me` remains authoritative.
5. **`user.manage` over-power** (F3) — managers managing users must not create
   managers/admins or touch other tenants. Mitigation: service-level role+tenant
   guard, not just the permission flag.
