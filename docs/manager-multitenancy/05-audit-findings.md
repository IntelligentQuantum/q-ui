# Manager Role + Workspace-Balance Audit

> Multi-agent audit (2026-06-21). 53 findings raised, 52 confirmed after adversarial
> verification (security/financial findings required a 3-verifier majority). Scope:
> the `manager` RBAC role + the workspace-balance financial model, backend and frontend.

## Financial model design (recommendation)

Adopt a **ledger-first workspace treasury** (Approach 2): two NEW physically-separate tables mutated by a dedicated service that shares no write path with the existing user wallet. This makes the core rule (account balance vs. workspace balance never mix) a *structural* invariant rather than a coding discipline.

**Schema (new file `internal/database/model/treasury.go`):**
- `workspace_wallets` — the treasury balance-of-record, one row per tenant: `TenantId (uniqueIndex)`, `Balance int64` (minor units, CAS-guarded), `Status` (`active|frozen`), timestamps.
- `workspace_transactions` — the treasury double-entry ledger, a structural twin of `Transaction` (`model.go:128-147`) but tenant-keyed: `TenantId (index)`, `Amount int64`, `Type` (reuse `TxCredit`/`TxDebit`), `BalanceBefore/After`, `Source`, `RefId`, `Actor`, `CounterpartyUserId`, `LinkedTxId` (pairs the two legs of a cross-ledger transfer).
- New sources beside `model.TxSource*` (`model.go:155-168`): `ws_sale`, `ws_refund`, `ws_quota_buy`, `ws_settlement`, `ws_topup`, `ws_adjust`.
- New `WorkspaceWalletService` (`internal/web/service/workspace_wallet.go`) cloning `WalletService.applyDelta`'s CAS + `withRetry` + before/after-snapshot + single-tx discipline (`wallet.go:51-90,162-171`), operating only on the two new tables. `GuardTenant` rejects ops on `tenantID <= GlobalTenantId`; `EnsureWallet` lazily provisions one wallet per tenant. Register both models in `db.go` AutoMigrate after `TenantSetting` (`db.go:95`) and add an idempotent `migrateProvisionWorkspaceWallets()` beside `migrateTenantPartialUniqueIndexes` (`db.go:110`).

**The 4 money flows (all int64 minor units; each cross-balance move in ONE `database.GetDB().Transaction`; treasury leg SKIPPED when `view.TenantID == GlobalTenantId`):**
1. **Customer top-up / purchase → revenue into workspace N treasury.** Top-ups stay personal (credit the buyer's `User.Balance` — `deposit.go:454`, `payment.go:219`, `plisio_webhook.go:121-128`); revenue accrues at **sale** time. Purchase = two-leg transfer: buyer `applyDelta(-price)` + `applyTreasuryDelta(N, +price, ws_sale)`, stitched by `LinkedTxId`. Deletes `DebitWorkspacePurchase`/`tenantManagerID` (`wallet.go:92-158`).
2. **Manager buys quota from admin → debit treasury.** New `PurchaseBandwidth(tenantID, quota, price)`: `DebitTreasury(ws_quota_buy)` then raise `bandwidth_quota_bytes`, in one tx; replaces the free `AllocateBandwidth` (`manager.go:374-379`) for the priced path.
3. **Settlement / payout → debit treasury.** New `Settle(tenantID, amount, dest, payoutRef)`, wallet frozen during settlement: `external` = `DebitTreasury(ws_settlement)`; `manager_account` = `DebitTreasury` + `applyDelta(manager, +amount)` in one tx — the ONLY sanctioned treasury→account bridge, gated by `balance.manage`, idempotent via `RefId`. `ManagerService.Delete` must force-settle a non-zero treasury before destroying the tenant.
4. **Manager personal purchase → account balance only.** Correct by construction once flow-1's dual-debit is gone: admin-store buy debits only `User.Balance` (treasury leg skipped); buying from another manager's store credits *that* store's treasury, never the buyer's own.

Admin "workspace balance" top-up (`manager.go:139-192 adjustBalance`) reroutes to `CreditTreasury/DebitTreasury/SetTreasury`; `WorkspaceOverview.ManagerBalance` splits into `TreasuryBalance` + `ManagerAccountBalance`; `/me` gains a distinct `workspaceBalance` field.

**Key invariants:** atomicity (every mutation + its ledger row in one tx; every transfer's two legs in one outer tx); no-oversell (treasury CAS `WHERE tenant_id=? AND balance=before`, `after<0 → ErrInsufficientTreasury`); idempotency (ws_sale anchored to the order row; settlement/quota carry unique `RefId`); no-fund-mixing (disjoint tables + disjoint services + tenant-0 guard + single sanctioned bridge); ledger correctness (`GetTreasuryBalance == Σcredit−Σdebit` per tenant; `users.balance == Σcredit−Σdebit` per user — now exactly true for managers too); `TotalWalletBalance = SUM(users.balance)` (`finance.go:135`) stays, ADD `TotalTreasuryBalance = SUM(workspace_wallets.balance)`.

**Rejected:** the "balance column on Tenant + party tag on Transaction" variants (Approaches 1/3) — they force a `party='user'` predicate onto every existing per-user aggregate (`wallet.go:258`, `finance.go:132-137`) or treasury legs silently pollute personal/customer finance; grafted from them only the `GlobalTenantId` short-circuit, the finance-figure split, the single-tx bridge, and int64 minor units.

## Backend fixes

**[Critical] Cross-DB migration silently drops ALL tenant data — `Tenant`, `TenantSetting` and 13 other tables missing from `migrationModels()`**
- What & where: `internal/database/migrate_data.go:37-60` lists only 20 models; `initModels()` (`db.go:60-96`) has 35. The list omits `Tenant`, `TenantSetting`, `ClientGroup`, `PaymentCard`, `ManualDepositRequest`, `Notification`, `TicketCategory`, `Ticket`, `TicketMessage`, `TicketAttachment`, `TicketAuditLog`, `Referral`, `SyncAudit`, `CustomGeoResource`, `ClientGlobalTraffic`. `MigrateData` (used by `q-ui migrate-db --dsn`, `main.go:562-592`) AutoMigrates + copies only the listed models and reports success.
- Why it is wrong: a manager running the officially-documented DB-backend migration loses their entire workspace economy with no error. Surviving manager `User` rows then point at a now-nonexistent tenant id; `ReconcileWorkspaces` (`manager.go:178`) provisions a fresh empty workspace with a new id, orphaning all old tenant-scoped data. The self-referential test (`migrate_data_test.go:27`) iterates the same incomplete list so it can never detect the omission.
- Fix: derive `migrationModels()` from `initModels()` (single shared slice) or add a unit test asserting full coverage; immediately add the 15 missing models in FK-safe order. Until fixed, prefer the schema-introspective `--dump`/`--restore` path (`dump_sqlite.go` reads `sqlite_master`).
- Confirm: with Postgres reachable, AutoMigrate full `initModels()` into a SQLite source, insert a `Tenant` + manager `User` + a `Ticket`, run `MigrateData`, assert the destination has a `tenants` table (it won't); or a pure unit test asserting every `initModels()` type appears in `migrationModels()` (fails today, naming the 15).

**[High] No workspace treasury exists: `Tenant` has no balance field, so workspace money has nowhere to live**
- What & where: `model.Tenant` (`internal/database/model/tenant.go:32-62`) has slug/owner/domain/api-key/bandwidth but no balance; the only balance primitive is `User.Balance` (`model.go:50`) mutated by `WalletService.applyDelta` (`wallet.go:51-90`). No tenant ledger table exists.
- Why it is wrong: the CORE PRODUCT RULE is unsatisfiable by construction — all four money flows have no treasury source/destination. This is the headline defect; every other money finding is downstream.
- Fix: add the `workspace_wallets` + `workspace_transactions` tables and `WorkspaceWalletService` per the recommended design.
- Confirm: trace a storefront purchase: `order.Purchase → DebitWorkspacePurchase → applyDelta` on the manager's `User` row; confirm `model.Tenant` has no balance column and no `CreditTenant`/`DebitTenant` primitive exists anywhere.

**[High] Manager's PERSONAL account balance is used AS the workspace treasury — fund-mixing in both directions (flow #4 violation)**
- What & where: `DebitWorkspacePurchase` debits BOTH buyer and storefront manager's personal `User.Balance` in one tx (`wallet.go:117-138`), driven by `tenantManagerID` (`wallet.go:97-109`), called from `order.go:133,220` and `client.go:296,652`. Admin top-up credits/debits the manager `User.Balance` (`manager.go:171-178`); `WorkspaceOverview.ManagerBalance = mgr.Balance` (`manager.go:353`).
- Why it is wrong: the two balances that must never mix ARE the same int64 field. A manager who tops up customers and sells to them silently drains their own money; personal spend starves the storefront and vice versa.
- Fix: re-point all four debit call sites and the admin top-up at the new treasury (`DebitTreasury`/`CreditTreasury` on `view.TenantID`); delete `tenantManagerID`/the dual-debit; personal purchases hit only `User.Balance`.
- Confirm: top up a manager via `POST /admin/managers/:id/balance`, have a workspace customer buy a priced product, observe TWO debit `Transaction` rows for one sale (buyer + "— workspace pool"), both stamped the manager's `tenant_id`; drop the manager below a product price and watch customer purchases fail with `ErrInsufficientBalance`.

**[High] Crediting a workspace customer draws from nothing while selling to them debits the manager — asymmetric, self-draining**
- What & where: `TenantUserService.AdjustBalance` credits a customer via plain `CreditWithMeta` with no offsetting treasury debit (`tenant_user.go:131-153`); when the customer spends, `DebitWorkspacePurchase` debits the manager (`wallet.go:117-138`, `order.go:130-141`).
- Why it is wrong: a manager granting a customer 100 credits funds it from thin air, but when the customer spends it the manager's personal balance is debited 100 — the manager pays for credit they gifted. The books never balance.
- Fix: model customer credits as a treasury→customer-wallet transfer and sales as a customer-wallet→treasury transfer, both touching the workspace treasury, never the manager's personal wallet.
- Confirm: fund manager M to 1000; `POST /tenant/users/<C>/balance {op:add, amount:100}` → C=100, M=1000; as C buy a product priced 100 → C=0, **M=900**.

**[High] `ManagerService.Delete` orphans all tenant-scoped rows (and destroys the manager-balance "pool") with no reassignment, settlement, or FK cleanup**
- What & where: `Delete` (`manager.go:415-428`) removes the manager `User` + `Tenant` rows in one tx but leaves every tenant-scoped row (orders, products, cards, deposits, tickets, referrals, transactions, sub-users). No FKs cascade (`DisableForeignKeyConstraintWhenMigrating=true`, `db.go:854`). On Postgres, autoincrement id reuse (`resyncPostgresSequences`, `db.go:119-120`) can hand a deleted tenant's id to a NEW tenant.
- Why it is wrong: orphaned `tenant_id` rows + id reuse is cross-tenant data-bleed — a future tenant silently inherits a deleted tenant's customers/orders/deposits/cards. The comment claims data "can be reassigned" but there is no reassignment path. The accrued pool (manager `User.Balance`) is destroyed with no payout.
- Fix: on Delete, hard-delete/archive or re-stamp tenant-scoped rows to a tombstone tenant id in the same tx; never reuse a deleted tenant's id (soft-delete or reserve ids); add an explicit settlement step before destroying the manager.
- Confirm: on Postgres, seed orders/customers for the MAX-id tenant, delete it, restart (setval lowers the sequence), create a new manager → it reuses the id → log in and list orders/customers and see the prior tenant's rows. SQLite (AUTOINCREMENT) is not affected.

**[High] Ticket subsystem: manager reads/replies/downloads attachments across tenants via client-controlled `X-Workspace` header (ViewScope + staff bypass)**
- What & where: ticket read/reply/reopen/attachment handlers scope by `tenant.ViewScope(c)` (`ticket.go:214,224,348,390,423`), which resolves from the client `X-Workspace` header to ANY active tenant (`middleware/tenant.go:72-81`). A manager holds `PermTicketManage` so `canAccessTicket` returns true for any ticket (`ticket.go:85-91`); `ListTickets` skips the owner clause for staff (`service/ticket.go:443-459`) and `Detail` runs with `staff=true` incl. internal notes (`ticket.go:530-553`).
- Why it is wrong: a manager of workspace A sends `X-Workspace: <B-slug>` and lists/reads (incl. staff-only internal notes), replies into, and downloads attachments (receipts/IDs) of workspace B's tickets. ViewScope is documented safe only for public catalog reads. Frontend hiding is not security.
- Fix: scope staff ticket list/get/detail/reply/reopen/attachment by `tenant.HomeScopeStrict(c)` (as assign/transfer/status already do), or add to `canAccessTicket` a non-admin requirement that `ticket.TenantId == caller home tenant` even when `ticket.manage` is held.
- Confirm: as manager of A with a forged `X-Workspace: <B-slug>`: `GET /panel/api/tickets?filter=all` returns B's tickets; `GET /tickets/<B-id>` returns `isInternal=true` notes; `POST /tickets/<B-id>/messages` injects a reply; `GET /tickets/<B-id>/attachments/<B-aid>` streams B's file.

**[Medium] Suspending a workspace does NOT lock out a session-authenticated manager — "suspend" is half-enforced**
- What & where: `SetStatus` flips `tenants.status` (`manager.go:366-371`). Suspension is checked only on API-key auth (`tenant.go:98`) and the public storefront (`middleware/tenant.go:77,107`). `checkLogin` checks only `session.IsLogin` (`base.go:19-31`) and `ResolveTenant` sets `homeID=user.TenantId` for a non-admin with no status check (`middleware/tenant.go:51-65`).
- Why it is wrong: an admin who suspends a workspace believes the manager is locked out, but the manager (and session sub-users) keep full SPA management access to clients, customers, balances, products, orders, deposits and settings. A security-relevant control failure.
- Fix: in `ResolveTenant` (or `checkLogin`/session validation), after resolving a non-admin `homeID`, load the tenant and fail/force-logout if `status != active`, mirroring `ManagerByApiKey`.
- Confirm: log in as a manager (session cookie), have admin suspend the workspace, then exercise `/panel/api/me`, `/tenant/settings`, `/tenant/users/:id/balance` — all still 200 (bug), while the same calls with the manager API key return 404/401.

**[Medium] Gateway credit is NOT atomic with the payment-status transition — crash window credits zero on a paid payment (money loss)**
- What & where: the idempotency CAS (status pending→paid) runs in a SEPARATE tx from the wallet credit. ZarinPal: `MarkPaid` (`payment.go:213`, CAS `payment.go:61-76`) then `CreditWithMeta` in a distinct tx (`payment.go:219`). Plisio: `MarkPaidWithBonus` (`plisio_webhook.go:113`) then two `CreditWithMeta` (`plisio_webhook.go:121,128`). Contrast the correct shared-tx pattern at `deposit.go:429-462`.
- Why it is wrong: a crash between the status flip and the credit marks the payment PAID but never credits; since `MarkPaid` is the idempotency guard, a replay sees `transitioned=false` and SKIPS the credit forever — permanent loss.
- Fix: move the status CAS and wallet credit into one DB tx (as `Approve` does), so a credit failure rolls back the status flip; or make the credit replay-safe keyed on payment id and re-attempt on detected pending-credit.

**[Medium] Inbounds are not tenant-scoped: a manager can enumerate all admin/other-workspace inbounds and provision clients onto any inbound id**
- What & where: `Inbound` has no `tenant_id`. `GET /inbounds/options` returns `GetAllInboundOptions()` panel-wide to any non-admin (`inbound.go:69,142-149`). `ClientService.Create` attaches to arbitrary `payload.InboundIds` with no check they belong to the caller's tenant (`client_crud.go:52-129`; `controller/client.go:236-332` stamps the client row's `TenantId` but never validates the target inbound). Same in product provisioning (`order.go:408-446`). The injected client becomes a live credential on the admin's Xray server (`xray.go:109-168`).
- Why it is wrong: a manager (denied `infra.manage`) discovers the admin's full inbound topology and writes clients into admin-owned tenant-0 inbound config, consuming/griefing shared infra — there is no per-tenant inbound allow-list.
- Fix: introduce a tenant↔inbound allow-list (or reuse product `InboundIds` as the only attachable set for non-admins); validate on client create / provisioning that every target inbound is allocated to the caller's tenant; restrict `/inbounds/options` for managers to their own products' inbounds.
- Confirm: as a manager, `GET /panel/api/inbounds/options` returns admin tenant-0 inbound ids; `POST /clients/add {inboundIds:[<admin inbound>]}` succeeds; as admin, `GET /inbounds/get/:id` shows the manager's client in `settings.clients[]`.

**[Medium] Selling bandwidth/quota to a workspace charges no balance — `AllocateBandwidth` is free, breaking the cost-of-goods flow**
- What & where: `AllocateBandwidth` only sets `tenants.bandwidth_quota_bytes` (`manager.go:374-379`); `OverBandwidthQuota` is a pure provisioning gate (`tenant.go:148-160`, enforced `client.go:249-252`). No debit anywhere.
- Why it is wrong: the admin hands out resold capacity for free with no accounting; intended flow #2 (manager pays for quota from the workspace balance) is unimplemented and cannot exist without a treasury.
- Fix: add a treasury + ledger and make `AllocateBandwidth` (or a separate "purchase quota" action) debit the workspace balance for the allocated bytes, recording a ledger row; surface insufficient-treasury distinctly from personal-wallet errors.
- Confirm: `POST /admin/managers/:id/bandwidth` changes `bandwidth_quota_bytes` while no balance is debited and no `Transaction` row is written; the `AllocateBandwidth` call chain never references `WalletService`/`applyDelta`.

**[Medium] Admin "workspace balance" top-up and the Managers overview operate on the manager's PERSONAL wallet, so the oversight UI mislabels personal funds as the treasury**
- What & where: `ManagerController.adjustBalance` credits/debits `walletService` with `mgrID = manager.User.Id` (`manager.go:143-192`, comment: balance "IS the workspace's prepaid pool"); `WorkspaceOverview.ManagerBalance = mgr.Balance` (`manager.go:335,353`).
- Why it is wrong: the admin's tenant-oversight surface presents the manager's personal wallet as the workspace treasury, and "charge workspace balance" moves the manager's personal money — wrong-model in the management layer.
- Fix: point `adjustBalance` and `WorkspaceOverview` at the treasury, with separate labels for personal account vs. workspace treasury.
- Confirm: Managers-page "Workspace balance" equals the manager `User.Balance` row; "Charge" raises the same `users.balance`.

**[Medium] Workspace-pool ledger rows are stamped to the manager's own `tenant_id`, so per-tenant revenue rollups double-count and mis-attribute on existing data**
- What & where: `applyDelta` stamps `Transaction.TenantId` from the debited user (`wallet.go:76`); the dual debit writes the buyer leg AND the manager-pool leg into the same tenant N ledger (`wallet.go:117-138`), distinguishable only by the `" — workspace pool"` description suffix (`wallet.go:128`). `FinanceService.TotalSpend = SUM(amount) WHERE type=debit` scoped by tenant (`finance.go:171`) thus reports `2×price` per sale.
- Why it is wrong: one sale produces two same-tenant debit rows with no structured discriminator; the eventual treasury backfill cannot partition history by `tenant_id` alone, and current tenant finance reports are inflated 2×.
- Fix: add a structured discriminator to `Transaction` (a `Leg`/account enum or a dedicated pool `Source`) NOW; the future backfill must exclude/repoint the pool legs rather than summing `tenant_id` blindly.
- Confirm: one purchase of price P on tenant N → two `type=debit, amount=P, source=purchase` rows differing only by description; finance dashboard shows `TotalSpend = 2P`.

**[Medium] `TotalWalletBalance` conflates the manager's personal/pool balance with customer wallet liabilities**
- What & where: `FinanceService.TotalWalletBalance = SUM(User.Balance)` within scope (`finance.go:135`); for a manager's tenant this includes the manager's own balance plus every customer's.
- Why it is wrong: the displayed figure mixes the treasury proxy with customer-held credit and the manager's personal money — not a meaningful number.
- Fix: once the treasury exists, expose a distinct `workspaceBalance`; compute `TotalWalletBalance` as customer wallets only with the treasury as its own line item.
- Confirm: fund the manager personally and a customer; the dashboard's `totalWalletBalance` equals the sum including the manager's own row.

**[Medium] `ResolveTenant` zero-scope / `NoTenantSentinel` guard and `ManagerByApiKey` resolution are untested**
- What & where: the manager guard rewriting `homeID<=GlobalTenantId` to the owned tenant or `NoTenantSentinel(-1)` (`middleware/tenant.go:51-66`), `ManagerByApiKey` active-tenant-only resolution (`tenant.go:91-110`), and the `FromContext` fail-safe (`context.go:88-105`) have zero tests.
- Why it is wrong: this is the request-time second defense against a manager aliasing admin tenant-0 data; if it regresses (e.g. someone removes the role check), `{0,non-global}` scopes onto admin data with no failing test. The API-key path is the sole auth for manager automation; an inactive-tenant key still resolving would be a suspension bypass.
- Fix: add tests — manager with `tenant_id<=0` resolves to owned tenant else `NoTenantSentinel` (never global); suspended tenant's key yields `ErrTenantNotFound`; a valid active key confines scope to that tenant.
- Confirm: `rg "ResolveTenant|ManagerByApiKey|GetByManagerUserID" -g "*_test.go"` returns nothing; removing the role check or the active-status filter still passes the suite.

**[Low] Storefront `ViewScope` (`X-Workspace`) is resolved to ANY active tenant for ANY caller, not constrained to the caller's own/visited workspace**
- What & where: `ResolveTenant` sets the view scope purely from the client slug/Host to any `Active` tenant with no relationship check (`middleware/tenant.go:72-89`, `tenant.go:77`); `ViewScope` is fully attacker-controlled (`context.go:69-74`). Today bounded consumers are deposit submit (`deposit.go:163`) and order purchase (`order.go:115,160`).
- Why it is wrong: this is the root enabler of the ticket break and a latent footgun for any future endpoint reaching for `ViewScope`; the "public-only" invariant is documented, not type-enforced.
- Fix: treat `ViewScope` as untrusted/public-only — audit all call sites, optionally restrict non-admins to their home tenant unless the target has public storefront enabled, and add a lint/test asserting management controllers never call `ViewScope`.

**[Low] Bad / nonexistent / suspended workspace slug silently serves the ADMIN (tenant-0) storefront**
- What & where: on any `X-Workspace` lookup failure (unknown/typo/suspended), `ResolveTenant` falls back to `view = GlobalTenantId` (`middleware/tenant.go:72-89`); `TenantScope` then emits `WHERE tenant_id=0` (`scope.go:72-79`), the admin's catalog.
- Why it is wrong: a buyer on an invalid or suspended workspace URL sees the admin's products; for a suspended workspace this defeats suspension. `workspaceCanBuy` blocks members from purchasing, but admins/managers (exempt) could transact against the fallback store.
- Fix: when a slug is present but resolves to no ACTIVE tenant, set view to `NoTenantSentinel(-1)` (empty catalog) or an explicit not-found state; reserve the empty-slug→global fallback for a literally empty header only.

**[Low] No settlement/payout primitive (flow #3) and no "manager buys quota from admin" primitive (flow #2)**
- What & where: no path debits a workspace balance for payout, and `AllocateBandwidth` charges nothing (`manager.go:374-379`); manager creation and admin top-up only move `User.Balance` (`controller/manager.go:139-192`).
- Why it is wrong: two of the four mandated flows are entirely unbuilt; the business model (manager pays for quota, manager gets settled) cannot operate.
- Fix: add treasury-debiting `Settle`/`PurchaseBandwidth` primitives, atomic and idempotent, per the recommended design.

**[Low] Manager buying from the admin store produces NO storefront/treasury accounting at all**
- What & where: `workspaceCanBuy` exempts manager (`order.go:83-91`); `tenantManagerID` returns 0 for the global store and for buyer==manager (`wallet.go:98,105`), so a manager reselling from the admin store draws only personal balance with zero pool accounting.
- Why it is wrong: a manager's restocking purchases and personal purchases are the same un-attributed personal-balance debit — flow #2 cannot be distinguished from personal spend.
- Fix: treat a manager's admin-store purchase as a treasury→admin cost when restocking vs. a personal debit when buying for self, disambiguated by caller/context.

**[Low] Customer top-ups never accrue any workspace revenue — flow #1 has no destination (informational baseline)**
- What & where: all three credit paths increment only the buyer's `User.Balance` (`deposit.go:454`, `payment.go:219`, `plisio_webhook.go:121-133`); `FinanceService` models revenue as deposit volume and `TotalWalletBalance = SUM(User.Balance)` (`finance.go:123-135`).
- Why it is wrong: flow #1 is unbuilt; combined with the dual-debit the economics invert — customers credit their own wallet and spending it debits the manager.
- Fix: per the recommended design, accrue revenue to the treasury at sale time while top-ups keep crediting customer wallets (a liability), avoiding double-counting.

**[Low] `WalletService.ListTransactions` has no tenant scope (relies entirely on its single admin-only caller)**
- What & where: filters only by optional `user_id`, no `TenantScope` (`wallet.go:249-265`); safe only because the sole caller is `/admin/transactions` under `RequireAdmin` (`admin.go:65,235`).
- Why it is wrong: a latent cross-tenant landmine inconsistent with `FinanceService` (which scopes every read); wiring it to a manager route would leak every tenant's transactions.
- Fix: add a `model.Scope` parameter and `scope.Apply(...)` like `FinanceService`; keep the admin caller passing `GlobalScope`.

**[Low] `tenant_user` mutation authorization is decoupled from the mutation (check-then-raw-id-mutate)**
- What & where: `Update`/`Delete`/`AdjustBalance` authorize via `loadInScope` then mutate the bare id through tenant-blind `AdminUpdateUser`/`DeleteUser`/`CreditWithMeta` (`tenant_user.go:61-73,108-153`; `user.go:516,545,559`; `wallet.go:51-62`).
- Why it is wrong: authorization-by-precheck — any refactor dropping/reordering `loadInScope` silently becomes a cross-tenant write.
- Fix: make the mutations scope-aware (pass `model.Scope` into the WHERE clause) or assert the loaded user's `TenantId == scope.OwnerTenantID()` immediately before each write; add a regression test.

**[Low] Manager can mint customer wallet balance from nothing via `tenant.users` Create (unaudited, no ledger row)**
- What & where: `TenantUserController.create` passes the body's `Balance` into `adminCreateUserTx`, which sets `Balance` directly with no `Transaction` row (`tenant_user.go:54-63`, `service tenant_user.go:77-103`, `user.go:430-466`), bypassing the audited `AdjustBalance` path.
- Why it is wrong: money created outside the ledger is invisible to finance reporting and the consistency check, and lets a manager inflate customer balances with no audit trail — a side door around the deliberately-ledgered `AdjustBalance`.
- Fix: force `in.Balance=0` on the manager Create path (drop the form binding), or route an initial balance through `walletService.CreditWithMeta` inside the create tx so it is ledgered.
- Confirm: `POST /tenant/users {role:reseller, balance:999999999}` → the user has that balance with ZERO `transactions` rows; finance `ConsistencyCheck` shows a non-zero difference.

**[Low] Ticket staff assign/transfer accepts an arbitrary `assignedTo` user id without tenant validation**
- What & where: `assign`/`transfer` pass `form.AssignedTo` straight to the service with only the ticket scoped (`ticket.go:459-496`); `service ticket.go:692-693,721` write it with no validation that the assignee is in the same tenant. The unscoped `LEFT JOIN users a` (`service ticket.go:453-454,535-537`) then resolves a foreign username back.
- Why it is wrong: an unvalidated cross-tenant write into a workspace's records that can leak another tenant's username and create a notification for a foreign user.
- Fix: in `Assign`/`Transfer`, validate that `assignedTo` resolves to a user within the ticket's scope (ideally holding `ticket.manage`) before persisting.
- Confirm: as a manager, `POST /tickets/:id/assign {assignedTo:<foreignUserId>}` succeeds and `GET /tickets/:id` shows the foreign `assigneeName`.

**[Low] `ReconcileWorkspaces` relink ignores its write error and does not reactivate a suspended tenant on re-promotion**
- What & where: the idempotent relink discards the update error (`_ = ...Update(...).Error`, `manager.go:140-141`) and only counts `hadNoTenant` provisions; demote suspends the tenant (`manager.go:213-220`) but re-promotion only relinks `tenant_id` — `GetByManagerUserID` ignores status (`tenant.go:44-52`) and nothing flips it back to active, so `ManagerByApiKey`/storefront (`tenant.go:98`) stay dead.
- Why it is wrong: a swallowed relink error defeats the self-heal silently; demote→re-promote leaves a manager owning a suspended workspace with a dead API key/store and no diagnostic.
- Fix: propagate the relink error into `firstErr`; reactivate the owned tenant on re-promotion (include status in the relink or `SetStatus active`).

**[Low] Partial-unique-index migration is correct but order-fragile and unguarded against a pre-migration duplicate**
- What & where: `migrateTenantPartialUniqueIndexes` (`db.go:137-151`) drops plain indexes and creates partial ones; it returns an error on `CREATE UNIQUE INDEX ... WHERE domain <> ''` if two tenants already share a non-empty domain/api_key_hash, aborting `InitDB` → `log.Fatalf` (`main.go:53-56`).
- Why it is wrong: the failure mode on a real duplicate is a hard startup failure rather than self-heal, opposite the `ReconcileWorkspaces` philosophy; it also relies on AutoMigrate never re-creating a removed-tag index.
- Fix: detect/resolve duplicate non-empty values before creating the partial indexes (null out/suffix losers and log); add an assertion that the `Tenant` model carries no plain `uniqueIndex` tags on domain/api_key_hash.

**[Low] No cross-tenant isolation, privilege-escalation, dual-debit, CAS-concurrency, gateway-idempotency, or core-rule tests exist**
- What & where: a grep across `*_test.go` for `TenantScope`, `loadInScope`, `TenantUserService`, `ResolveTenant`, `ManagerByApiKey`, `DebitWorkspacePurchase`, `tenantManagerID`, `MarkPaid`, `ErrBalanceConflict` (concurrency) returns 0 hits; only `tenant_index_test.go`, `manager_reconcile_test.go`, and single-threaded `wallet_test.go:24-108` exist.
- Why it is wrong: the central tenancy-isolation invariant ("manager A cannot touch tenant B"), the escalation guard, the dual-debit all-or-nothing/refund semantics, the wallet CAS lost-update guard, gateway-replay idempotency, and the CORE PRODUCT RULE separation are all unguarded — any refactor regresses them silently.
- Fix: add table-driven service tests (two managers/tenants) asserting cross-read/cross-write denial, escalation rejection (`ErrTenantRoleForbidden`/`ErrTenantUserForbidden`), dual-debit + refund symmetry, N-goroutine concurrent debit (final balance correct, no negative), `MarkPaid` replay credits exactly once, and the four account-vs-treasury separation cases once the treasury exists.

## Frontend fixes

**[Medium] Manager renaming their own slug locks them out of their workspace (no URL navigation after rename)**
- What & where: `WorkspaceSettingsPage` saves a new slug via `/tenant/settings` and on success invalidates `me`/tenant-settings but never navigates (`WorkspaceSettingsPage.tsx:79-91`, no `useNavigate`). The URL stays at the old slug; once `/me` refetches, `PanelLayout.viewingForeignWorkspace` (`PanelLayout.tsx:142`) becomes true (`me.tenantSlug=newSlug ≠ urlSlug=oldSlug`) and renders the foreign-workspace login wall with no recovery (`PanelLayout.tsx:144-195`).
- Why it is wrong: a manager who renames their workspace is immediately shown a login wall for their own panel — a self-inflicted lockout escapable only by manually editing the URL.
- Fix: after a successful slug change, `navigate`/replace to `/panel/manager/<newSlug>/workspace-settings` (or hard-reload) before/after invalidating `me`; or derive own-workspace identity from `/me` rather than the URL slug.
- Confirm: rename the slug and Save; the URL stays at the old slug and within ~1s the page flips to the foreign-workspace login wall.

**[Medium] Frontend renders the manager's PERSONAL account balance under a "Workspace balance" label — no distinct treasury field exists**
- What & where: `useMe` exposes a single `balance` (`useMe.ts:55,113`) = `/me`'s `balance` = `walletService.GetBalance(user.Id)` (`api.go:167,229`), the manager's personal `User.Balance`. `WorkspaceSettingsPage.tsx:124-130` renders `me?.balance` in a StatCard labelled `pages.managers.workspaceBalance` (comment: "prepaid pool = the manager's own balance"); `ManagersPage.tsx:394-399` renders `row.manager.balance` as "Workspace balance". No `workspaceBalance` data field exists in the SPA.
- Why it is wrong: the core rule violation made visible — account and workspace balance are presented as the same number because they ARE the same field end-to-end; the sidebar chip (`AppSidebar.tsx:508`) shows the same value linking to personal top-up.
- Fix: once a real treasury exists, add a distinct `workspaceBalance` field to `/me` and a typed field in `useMe`; render personal `balance` and the treasury as two clearly-labelled values. Interim honest fix: relabel the StatCard "My account balance" or drop it.
- Confirm: the "Workspace balance" StatCard equals the sidebar "Balance" chip; topping up the personal wallet moves both; admin "Charge workspace balance" raises the same spendable `users.balance`.

**[Low] Manager-visible `/clients` bulk toolbar calls admin-only endpoints the backend rejects**
- What & where: a manager reaches `/clients` (`PanelLayout.tsx:42-43`, `AppSidebar.tsx:241`); the bulk toolbar + More-menu items are gated only by selection, not role (`ClientsPage.tsx:869,1006-1015,1083-1135`). They POST to `/clients/bulkAttach|bulkDetach|groups/bulkAdd|groups/bulkRemove|bulkCreate|bulkAdjust|resetAllTraffics|delDepleted|bulkDel`, all admin-only (`client.go:95-103`, `api.go:91-93`).
- Why it is wrong: the clearest manager-visible-but-rejected mismatch — every bulk action 403s for a manager, contradicting the "mirrors the backend matrix" comment. Not a security hole (backend refuses) but broken UX.
- Fix: gate the bulk toolbar and More-menu bulk items behind `isAdmin` (like the owner column), or give managers tenant-scoped bulk endpoints.
- Confirm: as a manager, select rows and click any bulk action → HTTP 403 "admin role required", no data changed.

**[Low] Referral nav item is shown to managers but the page is a dead end for them**
- What & where: `AppSidebar.tsx:253` shows Referral to managers; `/referral/me` loads (managers hold `customer.view`) but the backend computes `isReseller := CanonicalRole()==RoleReseller` = false for a manager (`referral.go:70`), so `ReferralPage.tsx:110-113` renders the "available to reseller accounts" alert with no code/stats.
- Why it is wrong: the UI advertises an action that produces nothing for the role.
- Fix: drop `me?.isManager` from the referral condition (`AppSidebar.tsx:253`), or make referrals tenant-aware so a manager gets a real workspace code/stats.

**[Low] `PanelLayout.canAccess` has no `/referral` case, so it defaults to allow for every role**
- What & where: the `canAccess` switch has no `/referral` case and falls through to `default: return true` (`PanelLayout.tsx:64-65`); the page-level gate is bypassed for any authenticated user (the sidebar merely hides it from members).
- Why it is wrong: drift from "canAccess mirrors the backend matrix"; `/referral` is the one nav target with no explicit mapping. No data exposure (backend `/referral/me` is `customer.view`-gated).
- Fix: add `case '/referral': return has('customer.view');`.

**[Low] `ReservedSlugs` is NOT mirrored on the frontend despite the in-code contract claiming it is**
- What & where: `model/tenant.go:89` states the list "is mirrored by the frontend reserved-words check"; no such list exists in `frontend/src`. `ManagersPage.tsx:471` validates only the slug pattern; `WorkspaceSettingsPage.tsx:135` has no validation, so reserved slugs (`api`, `store`, `finance`) pass client validation and only fail on the backend `ValidateSlug`.
- Why it is wrong: the documented sync contract is false and misleads maintainers; a future reserved-word addition won't reflect in the UI. Backend `ValidateSlug` is the real gate, so not a security issue.
- Fix: delete the stale "mirrored by the frontend" claim, or generate a shared reserved-words + slug-pattern module from the Go list and import it in both pages.

**[Low] Hardcoded English fetch-error fallbacks on manager pages bypass i18n; no component tests**
- What & where: `ManagersPage.tsx:80` ("Failed to load managers"), `WorkspaceSettingsPage.tsx:40`, `WorkspacePaymentsPage.tsx:39`, `TenantUsersPage.tsx:67` — untranslated literals surfaced when the server returns no `msg.msg`. No `*.test.tsx` covers any manager page (the suite covers only inbound/outbound/xray utilities).
- Why it is wrong: breaks Persian localization in the no-message error path; permission-gating UX and balance-label rendering can regress silently.
- Fix: replace the four literals with an existing i18n key (e.g. `t('fail')` or a new `pages.*.toasts.loadFailed` in both locales); add a light render test per manager page asserting key labels resolve.

**[Low] Foreign-workspace / pre-login branding shows the wrong (home/global) brand, with a brand flash on custom domains**
- What & where: `/me` derives branding from `user.TenantId` (the visitor's home tenant), not the storefront (`api.go:192-209`, `useBranding.ts:13-46`); the served shell injects only `window.Q_UI_WORKSPACE` with no server-side brand meta (`dist.go:147-152`, `internal/web/dist/index.html` has no title/favicon), so an unauthenticated custom-domain visitor sees the default brand until JS resolves via `/getWorkspaceInfo`.
- Why it is wrong: initial paint shows the global panel's title/favicon (brand flash), and the branding source-of-truth is the home tenant rather than the storefront — misaligned with the "separate websites" model.
- Fix: resolve branding from the storefront/domain server-side when rendering the shell (inject brand title/favicon meta from `domainWorkspaceSlug` → `TenantSetting`), and/or expose a storefront-branding lookup keyed on the view tenant.

## Docs vs. reality

The roadmap describes phases 0-7 as built, and most are genuinely present and coherent (RBAC role/scope/models, tenant middleware + `/me`, admin Managers control plane, per-subsystem `TenantScope`, per-tenant settings, `/manager/:tenantSlug` routing, API-key→manager resolution, bandwidth aggregation). The following acceptance-gate items are **NOT actually done despite being described as done**:

- **CORE PRODUCT RULE (workspace treasury) — claimed implicit, actually absent.** No tenant balance/ledger exists; all workspace money flows through the manager's personal `User.Balance` in both directions (`wallet.go:92-138`, `manager.go:139-192,353`). This is the headline divergence (Backend High findings above).
- **Phase 2 "impersonate (audited)" / design §5 "every admin impersonation writes a sync_audit-style audit row" — NOT implemented.** `middleware/tenant.go:44-50,113-129` switches scope on `X-Tenant`/`?tenant` with no audit write anywhere; a grep for `impersonat` over `internal/` finds only the header read and scope switch. An admin can silently change a manager's customer balances, payment-gateway credentials (redirecting revenue), and branding with zero forensic trail — the acceptance check "impersonation works and is audited" cannot be satisfied.
- **Admin oversight scope — silently regressed.** The admin Finance dashboard uses `HomeScopeStrict` = `TenantOnly(0)`, never global (`finance.go:55-209`, `context.go:43-46`), so it shows ONLY tenant-0 financials and excludes every manager workspace, while the legacy income report (`report.go:60-120`) is unscoped/global — two contradictory revenue figures and no consolidated cross-workspace view.
- **Suspend enforcement — described as a manager pause/resume lever but only half-enforced** (session management path bypasses the status check; see Backend Medium).
- **Cross-DB migration completeness — the `migrate-db --dsn` path is documented/advertised as a supported backend migration but silently drops all tenant data** (Backend Critical).
- **Routing diverges from the documented design (benign):** pages mount under `/manager/:tenantSlug` (`routes.tsx:79`) instead of design §6.2's bare `/:tenantSlug` + reserved-words fallthrough. A defensible improvement, but the docs and the `routes.tsx:39-42` comment are now stale.
- **`ReservedSlugs` "mirrored by the frontend" contract (`tenant.go:89`) is false** — no frontend reserved-words list exists (Frontend Low).
- **Final-checklist test gate — not satisfiable as written:** there are no cross-tenant isolation, escalation, dual-debit, concurrency, gateway-idempotency, or core-rule tests (Backend Low); the existing Go tests also need cgo+gcc (absent), so the suite could not be executed in this environment.

## Top 5 — fix these first

1. **Cross-DB migration data loss (Backend Critical)** — `migrate-db --dsn` silently drops `tenants`/`tenant_settings` + 13 tables; a manager install loses its entire workspace economy with a "success" message. Fix `migrationModels()` and add a coverage test before anyone migrates a managed install.
2. **Manager deletion orphans tenant data + Postgres id reuse → cross-tenant data-bleed (Backend High)** — `ManagerService.Delete` leaves dangling `tenant_id` rows and the resynced sequence can reissue a deleted tenant's id to a new manager; archive/re-stamp rows and never reuse ids.
3. **Cross-tenant ticket read/reply/attachment via forged `X-Workspace` (Backend High)** — a manager reads other workspaces' tickets, internal notes, and attachments and injects replies; switch staff ticket reads to `HomeScopeStrict`.
4. **No workspace treasury / personal balance used as treasury (Backend High ×3)** — the CORE PRODUCT RULE is unsatisfiable and self-draining in both directions; build the ledger-first treasury and reroute purchase/top-up/credit flows off `User.Balance`.
5. **Suspend does not lock out a session-authenticated manager (Backend Medium)** — the admin's primary enforcement lever is bypassed via the browser session; enforce tenant status in `ResolveTenant`/`checkLogin`.
