package model

// This file defines the WORKSPACE TREASURY: a Manager workspace's business funds,
// kept PHYSICALLY SEPARATE from any personal User.Balance so a workspace's money
// and a manager's personal account can never mix. A workspace SELLS its products
// using its treasury balance (sale revenue accrues here), never the manager's
// personal wallet. The treasury exists only for real tenants (tenant_id > 0); the
// global/admin scope (tenant 0) has no treasury.
//
//   - WorkspaceWallet      — one treasury balance-of-record per tenant.
//   - WorkspaceTransaction — the treasury's double-entry ledger (twin of
//                            model.Transaction, but tenant-keyed).

// WorkspaceWallet is a workspace's treasury balance-of-record: exactly one row per
// tenant (tenant_id unique). Mutated only by the WorkspaceWalletService via a
// compare-and-swap, with a matching WorkspaceTransaction written for every change,
// so the balance can never be oversold and the ledger is always reconcilable.
type WorkspaceWallet struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TenantId  int    `json:"tenantId" gorm:"column:tenant_id;uniqueIndex;not null"`
	Balance   int64  `json:"balance" gorm:"default:0"`       // minor units; never negative under normal ops
	Status    string `json:"status" gorm:"default:'active'"` // active | frozen
	CreatedAt int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
	UpdatedAt int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
}

func (WorkspaceWallet) TableName() string { return "workspace_wallets" }

// Workspace wallet status constants.
const (
	WorkspaceWalletActive = "active"
	WorkspaceWalletFrozen = "frozen"
)

// WorkspaceTransaction is the treasury's auditable ledger: the tenant-keyed twin
// of Transaction, recording every credit/debit against a WorkspaceWallet with the
// before/after snapshot. It reuses the TxCredit/TxDebit type constants.
type WorkspaceTransaction struct {
	Id            int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TenantId      int    `json:"tenantId" gorm:"column:tenant_id;index;not null"`
	Amount        int64  `json:"amount" gorm:"not null"` // always positive; Type carries the sign
	Type          string `json:"type" gorm:"not null"`   // "credit" | "debit"
	Description   string `json:"description"`
	BalanceBefore int64  `json:"balanceBefore" gorm:"column:balance_before"`
	BalanceAfter  int64  `json:"balanceAfter" gorm:"column:balance_after"`
	// Accounting attribution, mirroring Transaction: WHY (Source), WHAT it points
	// at (RefId, e.g. an order id) and WHO caused it (Actor).
	Source string `json:"source" gorm:"index;default:''"`
	RefId  string `json:"refId" gorm:"column:ref_id;default:''"`
	Actor  string `json:"actor" gorm:"default:''"`
	// CounterpartyUserId is the user on the OTHER leg of a cross-ledger transfer
	// (the buyer/customer whose User.Balance moved opposite this entry); 0 when the
	// treasury moved on its own (admin top-up, settlement, manual adjust).
	CounterpartyUserId int   `json:"counterpartyUserId" gorm:"column:counterparty_user_id;default:0"`
	CreatedAt          int64 `json:"createdAt" gorm:"autoCreateTime:milli;index"`
}

func (WorkspaceTransaction) TableName() string { return "workspace_transactions" }

// Workspace treasury ledger source constants — the canonical reason a treasury
// entry exists. Distinct from the per-user TxSource* set so the two ledgers stay
// unambiguous.
const (
	WsSourceSale           = "ws_sale"            // storefront revenue from a customer purchase
	WsSourceRefund         = "ws_refund"          // reversal of a sale (order/provisioning failed)
	WsSourceQuotaBuy       = "ws_quota_buy"       // manager bought bandwidth/quota from admin
	WsSourceSettlement     = "ws_settlement"      // payout to the manager / externally
	WsSourceTopup          = "ws_topup"           // admin funded the treasury
	WsSourceAdjust         = "ws_adjust"          // admin manual adjustment (set)
	WsSourceCustomerAdjust = "ws_customer_adjust" // manager credited/charged a customer's wallet
)
