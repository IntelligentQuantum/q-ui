# Manager Multi-Tenancy — Implementation Roadmap

Feature-by-feature, each phase ends green (compile + typecheck + lint + the
panel still boots and the admin panel behaves exactly as before). Phases are
ordered so the foundation lands first and nothing ships a cross-tenant leak.

## Phase 0 — Foundation (no behavior change)
- `model/tenant.go`, `model/tenant_setting.go`, `tenant_id` columns, AutoMigrate
  entries, `TenantBackfill` seeder (everything defaults to tenant 0).
- `model/scope.go` (`TenantScope`), `web/tenant/context.go`.
- Add `RoleManager`, `IsManager`, new permission consts to `rbac.go` (+ matrix),
  `IsValidRole`/`NormalizeRole`.
- **Verify:** `go build ./...`, panel boots, admin panel identical, `/me`
  unchanged for existing roles.

## Phase 1 — Tenant context wiring
- `middleware/tenant.go` resolver; mount after auth in `web.go`.
- Extend `session`/`/me` to surface `tenantId`, `tenantSlug`, `isManager`.
- Frontend: `useMe` + `Role`/`Permission` unions + `PanelLayout.canAccess`
  mirror; `manager` role recognized (still no manager pages → no-op for admin).
- **Verify:** admin = global scope; a hand-seeded manager resolves to its tenant.

## Phase 2 — Admin "Managers" oversight (F1/F9)
- `service/manager.go` + `controller/manager.go` (`/panel/api/admin/managers/*`,
  `RequireAdmin` + `manager.admin`): create/list/suspend/delete, rotate API key,
  allocate bandwidth, impersonate (audited).
- Admin frontend "Managers" page.
- **Verify:** admin can create a manager + tenant end-to-end; impersonation works
  and is audited.

## Phase 3 — Tenant-scoped data (F3) — the core, do per subsystem
Apply `TenantScope` to reads and stamp `tenant_id` on writes, one service at a
time, each with a cross-tenant test:
1. Products → 2. Orders/services → 3. Wallet/transactions/finance →
4. Deposits/payments/payment-cards → 5. Tickets/categories → 6. Clients →
7. Referrals/notifications → 8. Users (`tenant.users` guard).
- **Verify per step:** manager sees only tenant N; admin sees all; reseller-in-N
  sees own rows within N; an IDOR fetch of another tenant's row 404s.

## Phase 4 — Per-tenant settings & branding (F4)
- `service/tenant_setting.go` + `/panel/api/tenant/settings` (manager-scoped).
- Frontend "Workspace Settings" page (branding, register toggle, subscription
  defaults). Global `/panel/setting/*` stays admin-only/unchanged.
- **Verify:** manager edits don't touch global settings; admin settings intact.

## Phase 5 — Frontend tenant routing & branding (F10)
- `NoRoute` SPA fallback for `/panel/<slug>/*`; reserved-words list shared.
- `routes.tsx` `/:tenantSlug` + `TenantLayout`; slug↔tenant validation;
  slug-prefixed nav; tenant branding applied.
- **Verify:** `/panel/<slug>` loads; admin pages unaffected; bad slug → 403/home.

## Phase 6 — Per-tenant payments, API key, custom domain (F5/F6/F7)
- Gateway config from tenant settings w/ global fallback; persist `tenant_id` on
  payment/deposit rows; tenant-aware callbacks.
- `checkAPIAuth` resolves manager API keys to the manager user.
- Host-header tenant resolution + `DomainValidatorMiddleware` whitelist.
- **Verify:** manager gateway flow end-to-end; API key scoped; custom domain
  resolves only its tenant.

## Phase 7 — Bandwidth business model (F8)
- Aggregation job (client traffic → `tenants.bandwidth_used_bytes`); admin
  allocation UI; `OrderService` quota guard.
- **Verify:** usage aggregates per tenant; provisioning blocked over quota.

## Final validation checklist (gate for "done")
- [ ] `go build ./...` and `go vet` clean
- [ ] `cd frontend && npm run typecheck && npm run lint && npm run test` clean
- [ ] `npm run gen:api` produces no unexpected diff (model/entity changes
      regenerate types intentionally)
- [ ] Panel boots on a fresh DB **and** on a copy of an existing DB (backfill)
- [ ] No broken routes (admin pages, sub-server, assets all serve)
- [ ] No RBAC regression for admin/moderator/reseller/member
- [ ] Cross-tenant tests: manager A cannot read/write any tenant B row (data,
      settings, tickets, finance, users, products, payments)
- [ ] Manager cannot create manager/admin or edit global/system config
- [ ] Admin panel (tenant 0) behaves byte-for-byte as before
- [ ] No duplicated scoping logic — all via `TenantScope` + tenant middleware
- [ ] i18n: any new strings added to **both** en and fa at full parity
