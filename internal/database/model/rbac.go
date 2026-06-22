package model

// Permission is a fine-grained capability checked by the authorization layer.
// Permissions are assigned to roles by the rolePermissions matrix below and
// checked via User.Can(). Middleware (RequirePermission) and services both use
// this single source of truth so the backend — never the frontend — decides
// what a caller may do.
type Permission string

const (
	// Infrastructure & system administration (admin only).
	PermInfraManage   Permission = "infra.manage"   // nodes, inbounds, server, xray, settings, custom-geo
	PermUserManage    Permission = "user.manage"    // create/edit/delete users, assign roles, manage mods/resellers
	PermBalanceManage Permission = "balance.manage" // adjust OTHER users' balances
	PermStatsViewAll  Permission = "stats.view_all"
	PermDepositManage Permission = "deposit.manage"   // review/approve/reject manual deposits + manage payment cards
	PermFinanceView   Permission = "finance.view_all" // finance control center: dashboards, analytics, ledger, exports

	// Support ticketing (helpdesk).
	PermTicketCreate  Permission = "ticket.create"   // open + reply to own tickets
	PermTicketViewOwn Permission = "ticket.view_own" // view own tickets
	PermTicketManage  Permission = "ticket.manage"   // staff: view all, reply, assign, transfer, status, notes
	PermTicketAdmin   Permission = "ticket.admin"    // categories, SLA config, audit log, merge

	// Product catalog.
	PermProductManage   Permission = "product.manage"   // create/edit/delete/activate products
	PermProductView     Permission = "product.view"     // browse catalog / store
	PermProductPurchase Permission = "product.purchase" // buy products / top up own balance

	// Clients (VPN services). Non-admins are additionally ownership-scoped.
	PermClientManage Permission = "client.manage" // create/edit/delete clients

	// Customers / orders.
	PermCustomerView   Permission = "customer.view"  // view users/customers (mod=all, reseller=own)
	PermOrderViewAll   Permission = "order.view_all" // see every order
	PermOrderViewOwn   Permission = "order.view_own" // see own orders/services
	PermBalanceViewOwn Permission = "balance.view_own"

	// Multi-tenancy. Manager-scoped capabilities (the tenant middleware confines
	// each to the manager's own workspace), plus the admin-only oversight perm.
	PermTenantSettings Permission = "tenant.settings" // edit own workspace branding/register/domain/subscription
	PermTenantPayments Permission = "tenant.payments" // edit own gateways + bank cards
	PermTenantUsers    Permission = "tenant.users"    // manage member/reseller within own tenant (never manager/admin)
	PermManagerAdmin   Permission = "manager.admin"   // admin only: list/suspend/delete/impersonate managers, allocate bandwidth, rotate keys
)

// rolePermissions is the canonical role -> permission matrix. Admin is handled
// specially in Can() (it has every permission and bypasses ownership), so it is
// intentionally not enumerated here.
var rolePermissions = map[string]map[Permission]bool{
	// Manager: runs a full workspace, but EVERY permission below is confined to
	// the manager's own tenant by the tenant middleware + TenantScope. Manager is
	// intentionally NOT granted infra.manage, user.manage (system role mgmt),
	// stats.view_all or manager.admin — and the
	// tenant.users guard prevents creating/promoting manager/admin accounts.
	RoleManager: {
		PermProductManage:   true,
		PermProductView:     true,
		PermProductPurchase: true,
		PermClientManage:    true,
		PermCustomerView:    true,
		PermOrderViewAll:    true,
		PermOrderViewOwn:    true,
		PermBalanceViewOwn:  true,
		PermBalanceManage:   true, // adjust own tenant users' balances
		PermDepositManage:   true, // own tenant deposits + bank cards
		PermFinanceView:     true, // own tenant finance reports
		PermTicketCreate:    true,
		PermTicketViewOwn:   true,
		PermTicketManage:    true,
		PermTicketAdmin:     true, // own tenant ticket categories/SLA
		PermTenantSettings:  true,
		PermTenantPayments:  true,
		PermTenantUsers:     true,
	},
	// Moderator: workspace STAFF created by a manager. The only privileged thing
	// it can do is create/manage clients (ownership-scoped + tenant-confined like
	// every non-admin), for which it is charged the manager-set per-GB rate from
	// its own balance. It cannot buy products, manage customers, see finance, edit
	// workspace settings, or manage other staff — those perms are deliberately
	// absent. The manager funds the moderator's balance (BalanceManage on the
	// manager side); the moderator only views its own.
	RoleModerator: {
		PermClientManage:   true,
		PermBalanceViewOwn: true,
		PermOrderViewOwn:   true, // see own created services/orders
		PermTicketCreate:   true,
		PermTicketViewOwn:  true,
	},
	RoleReseller: {
		PermProductView:     true,
		PermProductPurchase: true,
		PermCustomerView:    true, // own customers only (ownership-scoped in services)
		PermOrderViewOwn:    true,
		PermBalanceViewOwn:  true,
		PermTicketCreate:    true,
		PermTicketViewOwn:   true,
	},
	RoleMember: {
		PermProductView:     true,
		PermProductPurchase: true,
		PermOrderViewOwn:    true,
		PermBalanceViewOwn:  true,
		PermTicketCreate:    true,
		PermTicketViewOwn:   true,
	},
}

// Can reports whether the user holds the given permission. Admin holds every
// permission unconditionally. Note this answers "may the caller use this
// capability at all" — resource-level ownership (e.g. *which* clients/orders)
// is enforced separately in the services and is bypassed only for admin.
func (u *User) Can(p Permission) bool {
	if u == nil {
		return false
	}
	role := u.CanonicalRole()
	if role == RoleAdmin {
		return true
	}
	return rolePermissions[role][p]
}

// Permissions returns the sorted-by-insertion set of permissions granted to the
// user, for surfacing to the frontend via /panel/api/me so the SPA can gate
// navigation. The backend still enforces every one independently.
func (u *User) Permissions() []Permission {
	if u == nil {
		return nil
	}
	role := u.CanonicalRole()
	if role == RoleAdmin {
		out := make([]Permission, 0, len(allPermissions))
		out = append(out, allPermissions...)
		return out
	}
	perms := rolePermissions[role]
	out := make([]Permission, 0, len(perms))
	for _, p := range allPermissions {
		if perms[p] {
			out = append(out, p)
		}
	}
	return out
}

// allPermissions is the full ordered list, used to give admin every permission
// and to keep Permissions() output deterministic.
var allPermissions = []Permission{
	PermInfraManage, PermUserManage, PermBalanceManage, PermStatsViewAll,
	PermDepositManage, PermFinanceView,
	PermTicketCreate, PermTicketViewOwn, PermTicketManage, PermTicketAdmin,
	PermProductManage, PermProductView, PermProductPurchase,
	PermClientManage, PermCustomerView, PermOrderViewAll, PermOrderViewOwn, PermBalanceViewOwn,
	PermTenantSettings, PermTenantPayments, PermTenantUsers, PermManagerAdmin,
}
