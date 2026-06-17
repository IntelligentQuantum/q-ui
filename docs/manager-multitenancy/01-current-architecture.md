# Manager Multi-Tenancy — Phase 2: Current Architecture

> Status: **analysis only, no code changed.** This document captures the
> as-built architecture of q-ui (a 3x-ui fork) so the Manager multi-tenant
> feature can be designed against reality rather than assumptions.

## 0. Stack reality check

The original feature brief assumed a Prisma/TypeScript/Node backend. **That is
wrong for this repo.** The actual stack is:

| Layer    | Technology |
|----------|-----------|
| Backend  | Go 1.26, Gin (`github.com/gin-gonic/gin v1.12`), GORM, gorilla sessions (cookie store) |
| DB       | SQLite **or** Postgres (`QUI_DB_TYPE`), GORM `AutoMigrate`, no migration files |
| Frontend | React 19, Vite 8, Tailwind v4, TanStack Query, react-router-dom v7, Zod, react-hook-form |
| Types    | Go structs are the source of truth → `tools/openapigen` generates `frontend/src/generated/{types,zod,schemas,examples}.ts` |
| i18n     | en + fa only, full key parity (backend `nicksnyder/go-i18n`, frontend `i18next`) |

There is **no Prisma schema**. The schema is the set of GORM structs in
`internal/database/model/`. "Migrations" are `db.AutoMigrate(...)` + one-time
seeders.

## 1. Folder structure (relevant subset)

```
main.go                         # boots web.Server + sub.Server
internal/
  config/                       # env + build config (QUI_* vars)
  database/
    db.go                       # InitDB, initModels (AutoMigrate list), seeders
    model/                      # GORM models = the schema
      model.go                  # User, Inbound, ClientRecord, Setting, Node, ...
      rbac.go                   # Permission constants + role→permission matrix
      commerce.go               # Product, Order
      deposit.go                # PaymentCard, ManualDepositRequest
      ticket.go                 # Ticket, TicketMessage, TicketCategory, ...
      referral.go               # Referral
      notification.go
  web/
    web.go                      # Gin engine, middleware chain, route mounting
    middleware/                 # rbac.go (RequireAdmin/Role/Permission), security.go (CSRF), ...
    session/                    # session.go (GetLoginUser/SetLoginUser), csrf.go
    controller/                 # one file per HTTP surface (api, spa, setting, product, order, ticket, finance, deposit, payment, admin, referral, ...)
    service/                    # business logic (setting, user, wallet, product, order, ticket, finance, deposit, ...)
    entity/entity.go            # Msg{success,msg,obj} envelope + AllSetting struct
    dist/                       # embedded Vite build (index.html, assets/)
  sub/                          # separate HTTP server for /sub /json /clash links
frontend/src/
  routes.tsx                    # react-router routes + basename = <basePath>/panel
  layouts/PanelLayout.tsx       # RBAC gate (canAccess) + redirect
  layouts/AppSidebar.tsx        # nav items filtered by permission
  hooks/useMe.ts                # GET /panel/api/me → role/permissions/branding
  pages/                        # one dir per page (admin, users, products, finance, tickets, ...)
  api/                          # axios-init, queryKeys, queries/
```

## 2. Authentication flow

- **Session (browser):** `POST /login` → `UserService.CheckUser(user, pass, 2fa)`
  → bcrypt check → optional LDAP fallback → optional TOTP → `session.SetLoginUser`
  stores `LOGIN_USER` (user id) + `LOGIN_EPOCH` in the encrypted cookie
  (`sessions.Sessions("3x-ui", cookieStore)`). Password change bumps
  `LoginEpoch`, invalidating old cookies.
- **Bearer token (API):** `APIController.checkAPIAuth` reads
  `Authorization: Bearer <token>`, matches `ApiToken.Token` (SHA-256),
  and **resolves the caller to the first admin user** (`GetFirstUser`).
  → This is a key fact for the design: API-key auth is currently global/admin.
- **Per-request identity:** `session.GetLoginUser(c)` returns `*model.User`,
  checking `c.Get("api_auth_user")` first (Bearer), then the session cookie.
- **CSRF:** `CSRFMiddleware` validates `X-CSRF-Token` on unsafe methods; skipped
  for Bearer callers and safe methods.

## 3. RBAC flow (`internal/database/model/rbac.go`)

Four canonical roles (descending privilege): `admin`, `moderator`, `reseller`,
`member` (+ legacy `user` → reseller). `NormalizeRole` defaults unknown/blank to
**member** (least privilege).

- 19 fine-grained `Permission` constants (e.g. `infra.manage`, `user.manage`,
  `product.manage`, `order.view_all`, `ticket.manage`, `finance.view_all`).
- `rolePermissions` map assigns permissions to moderator/reseller/member.
  **Admin is special-cased** in `User.Can()` — holds every permission and
  bypasses ownership.
- Enforcement points:
  1. **Middleware** (`middleware/rbac.go`): `RequireAdmin()`,
     `RequireRole(...)`, `RequirePermission(perms...)` — gate whole route
     groups.
  2. **Service/controller ownership** — "can the caller use this capability"
     (permission) is separate from "on *which* rows" (ownership). Ownership is
     enforced ad-hoc in services/controllers, e.g.
     `ClientController.requireOwnership(email)` compares `ClientRecord.OwnerId`
     to the caller; `InboundService.GetInbounds(userId)` filters by `user_id`
     for non-admins.
- Frontend mirror: `/panel/api/me` returns `role` + `permissions[]`;
  `useMe().can(perm)` gates nav (`AppSidebar`) and routes
  (`PanelLayout.canAccess`). **The backend re-checks everything** — the
  frontend gate is cosmetic.

## 4. API flow & routing (`internal/web/web.go`)

- Engine middleware (all routes): security headers → body cap → optional domain
  validator → gzip → sessions → `base_path` ctx → asset cache → i18n.
- `basePath` comes from `SettingService.GetBasePath()` (default `/`, env
  `QUI_INIT_WEB_BASE_PATH`). The whole app mounts under
  `g := engine.Group(basePath)`.
- Route surfaces:
  - `IndexController` — `/`, `/login`, `/register`, `/logout`, `/csrf-token`,
    public `getPanelTitle`/`getRegistrationEnable`/`getTwoFactorEnable`.
  - `XUIController` (`/panel`, see `controller/spa.go`) — `g.Use(checkLogin)` +
    `CSRFMiddleware`, then **one explicit `GET` route per page**
    (`/panel/inbounds`, `/panel/clients`, … `/panel/finance`) that all serve the
    same `index.html` SPA shell. `/panel/tickets/*any` is the only wildcard.
    Sub-routers: `/panel/setting/*` (admin), `/panel/xray/*` (admin).
  - `APIController` (`/panel/api`) — `checkAPIAuth` + CSRF, then sub-controllers:
    `/inbounds`, `/clients`, `/server`(admin), `/nodes`(admin),
    `/custom-geo`(admin), `/admin`, `/products`, `/orders`, `/referral`,
    `/billing`, `/tickets`, `/finance`, `/sync`(admin), `/notification`, plus
    `/me` and `/profile`.
  - `sub.Server` — separate server for `/sub/:subid`, `/json/:subid`,
    `/clash/:subid`.
- **Response envelope:** every endpoint returns `entity.Msg{success, msg, obj}`.
- The engine ends with `engine.NoRoute(404)`. **This fallback is the hook the
  Manager design will reuse** to serve the SPA for arbitrary `/panel/<slug>`
  paths without colliding with the static page routes (Gin forbids a catch-all
  next to static siblings).

## 5. Database relations (owner-scoping columns already present)

Tables that already carry an owner/user column (the scoping foundation):

| Table | Owner column | Notes |
|-------|--------------|-------|
| `users` | `id` (+ `referred_by_user_id`) | single `role` string, no tenant concept |
| `inbounds` | `user_id` (optional, often 0) | infra; usually admin-owned |
| `clients` (`ClientRecord`) | `owner_id` (0 = system) | reseller/member ownership |
| `transactions` | `user_id` | wallet ledger |
| `payments` | `user_id` | gateway top-ups |
| `manual_deposit_requests` | `user_id` (+ `approved_by`) | card deposits |
| `orders` | `user_id` (+ `product_id`) | purchases |
| `products` | `created_by` | catalog |
| `referrals` | `reseller_id` (+ `referred_user_id`) | |
| `tickets` | `user_id` (+ `assigned_to`) | messages/attachments/audit inherit |
| `notifications` | `user_id` | |

Global/infra tables with **no** owner column: `nodes`, `settings` (global K-V),
`payment_cards`, `ticket_categories`, `client_groups`, `api_tokens`,
`custom_geo_resources`, `outbound_subscriptions`, traffic tables.

`db.go` uses `DisableForeignKeyConstraintWhenMigrating: true`, so adding new
nullable/`default:0` columns and a new table via `AutoMigrate` is safe and
non-breaking; data consistency is handled by seeders.

## 6. Subsystem summaries

- **Settings system:** one global key-value `settings` table, surfaced as the
  flat `entity.AllSetting` struct via `SettingService`. Covers web server,
  branding (`panelTitle`), security, per-role pricing, ZarinPal, Plisio/crypto,
  subscriptions, Telegram, SMTP, LDAP. **All settings are global + admin-only
  today.**
- **Finance system:** ledger-backed. `WalletService` mutates `users.balance`
  with a paired `transactions` row (compare-and-swap, atomic).
  `FinanceController` (`finance.view_all`) reads global analytics.
  `PaymentService`/`ZarinpalService`/`PlisioService` handle gateway top-ups;
  `DepositService` handles manual card-to-card deposits + `payment_cards`.
- **Products system:** `Product` (price, traffic, duration, audience,
  `inbound_ids` CSV, `created_by`) + `Order`. `OrderService.Create` debits
  balance and provisions a client. Audience filters catalog by role.
- **Users system:** `AdminController` (`/panel/api/admin/users`, `user.manage`,
  admin-only) CRUDs users and assigns roles; `UserService` handles self-profile,
  registration, auth.
- **Subscriptions:** `sub.Server` serves per-client links at configurable paths
  (`subPath`/`subJsonPath`/`subClashPath`) and optional `subDomain`; all global.
- **Ticketing:** `TicketService` + `TicketController`. `ticket.view_own` for
  customers, `ticket.manage` for staff (all tickets), `ticket.admin` for
  categories/SLA. Categories are global.

## 7. Frontend architecture

- `routes.tsx` builds `createBrowserRouter(routes, { basename })` where
  `basename = <window.Q_UI_BASE_PATH>/panel`. All pages are children of one `/`
  route rendered by `PanelLayout`.
- `PanelLayout` calls `useMe()` and `canAccess(me, pathname)` (a switch mirroring
  `rbac.go`); unauthorized → redirect to a role-specific home (`homeFor`).
- `AppSidebar` builds nav items gated by `me.can(permission)`.
- `useMe()` (`GET /panel/api/me`, staleTime 15s) is the single identity source:
  `role`, `permissions[]`, `isAdmin/...`, `balance`, `panelTitle`, gateway flags.
- Data: axios (`api/axios-init.ts`) auto-injects CSRF, retries on 403, redirects
  on 401; TanStack Query keys in `api/queryKeys.ts`. Settings fetched once via
  `POST /panel/setting/all` (cached forever).
- Branding today = `me.panelTitle`; theme is Tailwind CSS variables (no backend
  config); **no logo/favicon settings exist yet**.
