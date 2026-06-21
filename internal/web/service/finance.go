package service

import (
	"bytes"
	"encoding/csv"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"

	"gorm.io/gorm"
)

// ErrFinanceUserNotFound is returned when a requested user profile doesn't exist.
var ErrFinanceUserNotFound = errors.New("user not found")

// FinanceService is the read-only financial control center: it aggregates the
// authoritative source tables (payments, manual deposits, orders, referrals,
// transactions ledger, users, clients) into dashboards, analytics, cashflow,
// segmentation, a unified deposit feed, per-user profiles, consistency checks
// and CSV exports. It never mutates money — that only happens through the
// ledger-backed WalletService.
//
// Every public method takes a model.Scope: admins (global) see platform-wide
// figures exactly as before, while a manager sees only their own workspace's
// finance. Because every source table carries tenant_id, scoping is applied by
// deriving the working DB from scope.Apply(...) (a no-op for the global scope);
// JOINed/aliased queries use scope.ApplyCol with a qualified column to stay
// unambiguous.
type FinanceService struct{}

// FinanceHighValueThreshold is the lifetime-deposit cutoff (in credits) above
// which a customer is classed "high value". Documented config point.
const FinanceHighValueThreshold int64 = 5_000_000

// ---- small query helpers -------------------------------------------------

func sumInt64(q *gorm.DB, expr string) int64 {
	var v struct{ V int64 }
	q.Select("COALESCE(SUM(" + expr + "),0) AS v").Scan(&v)
	return v.V
}

func countRows(q *gorm.DB) int64 {
	var n int64
	q.Count(&n)
	return n
}

func startOfMonthMilli() int64 {
	t := time.Now()
	y, m, _ := t.Date()
	return time.Date(y, m, 1, 0, 0, 0, 0, t.Location()).UnixMilli()
}

func startOfYearMilli() int64 {
	t := time.Now()
	return time.Date(t.Year(), 1, 1, 0, 0, 0, 0, t.Location()).UnixMilli()
}

// confirmedDepositVolume returns the gross real-money deposit volume since `since`
// (0 = all time): approved manual card-to-card deposits + paid gateway/crypto
// payments. Bonuses are NOT counted (granted credit, not received money).
func (s *FinanceService) confirmedDepositVolume(since int64, scope model.Scope) int64 {
	db := scope.Apply(database.GetDB())
	manual := db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositApproved)
	gateway := db.Model(&model.Payment{}).Where("status = ?", model.PaymentPaid)
	if since > 0 {
		manual = manual.Where("approved_at >= ?", since)
		gateway = gateway.Where("created_at >= ?", since)
	}
	return sumInt64(manual, "amount") + sumInt64(gateway, "amount")
}

// ---- master dashboard -----------------------------------------------------

// FinanceDashboard is the platform-wide financial snapshot.
type FinanceDashboard struct {
	TotalRevenue    int64 `json:"totalRevenue"`
	TodayRevenue    int64 `json:"todayRevenue"`
	WeekRevenue     int64 `json:"weekRevenue"`
	MonthRevenue    int64 `json:"monthRevenue"`
	YearRevenue     int64 `json:"yearRevenue"`
	GrossRevenue    int64 `json:"grossRevenue"`
	NetRevenue      int64 `json:"netRevenue"`
	LifetimeRevenue int64 `json:"lifetimeRevenue"`

	TotalDeposits      int64 `json:"totalDeposits"`    // volume (confirmed)
	TotalWithdrawals   int64 `json:"totalWithdrawals"` // manual admin debits
	TotalWalletBalance int64 `json:"totalWalletBalance"`

	PendingDeposits  int64 `json:"pendingDeposits"`
	ApprovedDeposits int64 `json:"approvedDeposits"`
	RejectedDeposits int64 `json:"rejectedDeposits"`

	TotalBonuses             int64 `json:"totalBonuses"`
	TotalReferralCommissions int64 `json:"totalReferralCommissions"`
	TotalRefunds             int64 `json:"totalRefunds"`
	TotalProductSales        int64 `json:"totalProductSales"`
	ProductSalesCount        int64 `json:"productSalesCount"`

	TotalUsers  int64 `json:"totalUsers"`
	PayingUsers int64 `json:"payingUsers"`
	ActiveUsers int64 `json:"activeUsers"`
	ARPU        int64 `json:"arpu"`
	AOV         int64 `json:"aov"`

	// Operations (consumption side, ported from the old reports page): total
	// wallet balance consumed via debits, plus client/service counts.
	TotalSpend      int64 `json:"totalSpend"`
	TotalClients    int64 `json:"totalClients"`
	NewClientsMonth int64 `json:"newClientsMonth"`
}

func (s *FinanceService) Dashboard(scope model.Scope) (*FinanceDashboard, error) {
	db := scope.Apply(database.GetDB())
	d := &FinanceDashboard{}

	d.GrossRevenue = s.confirmedDepositVolume(0, scope)
	d.TotalRevenue = d.GrossRevenue
	d.LifetimeRevenue = d.GrossRevenue
	d.TodayRevenue = s.confirmedDepositVolume(startOfDayMilli(0), scope)
	d.WeekRevenue = s.confirmedDepositVolume(startOfDayMilli(7), scope)
	d.MonthRevenue = s.confirmedDepositVolume(startOfMonthMilli(), scope)
	d.YearRevenue = s.confirmedDepositVolume(startOfYearMilli(), scope)
	d.TotalDeposits = d.GrossRevenue

	d.TotalRefunds = sumInt64(db.Model(&model.Transaction{}).Where("source = ?", model.TxSourceRefund), "amount")
	d.NetRevenue = d.GrossRevenue - d.TotalRefunds
	d.TotalWithdrawals = sumInt64(db.Model(&model.Transaction{}).Where("source = ?", model.TxSourceAdminDebit), "amount")
	d.TotalWalletBalance = sumInt64(db.Model(&model.User{}), "balance")
	d.TotalBonuses = sumInt64(db.Model(&model.Payment{}).Where("status = ?", model.PaymentPaid), "bonus_amount")
	d.TotalReferralCommissions = sumInt64(db.Model(&model.Transaction{}).Where("source = ?", model.TxSourceReferral), "amount")

	d.PendingDeposits = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositPending)) +
		countRows(db.Model(&model.Payment{}).Where("status = ?", model.PaymentPending))
	d.ApprovedDeposits = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositApproved)) +
		countRows(db.Model(&model.Payment{}).Where("status = ?", model.PaymentPaid))
	d.RejectedDeposits = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositRejected)) +
		countRows(db.Model(&model.Payment{}).Where("status = ?", model.PaymentFailed))

	d.TotalProductSales = sumInt64(db.Model(&model.Order{}).Where("status = ?", model.OrderCompleted), "amount")
	d.ProductSalesCount = countRows(db.Model(&model.Order{}).Where("status = ?", model.OrderCompleted))

	d.TotalUsers = countRows(db.Model(&model.User{}))
	deposits := s.depositByUser(scope)
	d.PayingUsers = int64(len(deposits))
	// Active = engaged: at least one completed order or one confirmed deposit.
	buyers := s.orderCountByUser(scope)
	active := map[int]bool{}
	for u := range deposits {
		active[u] = true
	}
	for u := range buyers {
		active[u] = true
	}
	d.ActiveUsers = int64(len(active))

	if d.PayingUsers > 0 {
		d.ARPU = d.GrossRevenue / d.PayingUsers
	}
	if d.ProductSalesCount > 0 {
		d.AOV = d.TotalProductSales / d.ProductSalesCount
	}

	// Operations: balance consumed (all debits) + client/service counts.
	d.TotalSpend = sumInt64(db.Model(&model.Transaction{}).Where("type = ?", model.TxDebit), "amount")
	d.TotalClients = countRows(db.Model(&model.ClientRecord{}))
	d.NewClientsMonth = countRows(db.Model(&model.ClientRecord{}).Where("created_at >= ?", startOfMonthMilli()))
	return d, nil
}

// depositByUser maps user id -> lifetime confirmed deposit volume.
func (s *FinanceService) depositByUser(scope model.Scope) map[int]int64 {
	db := scope.Apply(database.GetDB())
	out := map[int]int64{}
	type row struct {
		UserId int
		V      int64
	}
	var rows []row
	db.Model(&model.ManualDepositRequest{}).Select("user_id, COALESCE(SUM(amount),0) AS v").
		Where("status = ?", model.ManualDepositApproved).Group("user_id").Scan(&rows)
	for _, r := range rows {
		out[r.UserId] += r.V
	}
	rows = nil
	db.Model(&model.Payment{}).Select("user_id, COALESCE(SUM(amount),0) AS v").
		Where("status = ?", model.PaymentPaid).Group("user_id").Scan(&rows)
	for _, r := range rows {
		out[r.UserId] += r.V
	}
	return out
}

// orderCountByUser maps user id -> completed-order count.
func (s *FinanceService) orderCountByUser(scope model.Scope) map[int]int64 {
	db := scope.Apply(database.GetDB())
	out := map[int]int64{}
	type row struct {
		UserId int
		C      int64
	}
	var rows []row
	db.Model(&model.Order{}).Select("user_id, COUNT(*) AS c").
		Where("status = ?", model.OrderCompleted).Group("user_id").Scan(&rows)
	for _, r := range rows {
		out[r.UserId] = r.C
	}
	return out
}

// ---- time series (charts) -------------------------------------------------

// FinanceDayPoint is one day's bucket for the dashboard charts.
type FinanceDayPoint struct {
	Date     string `json:"date"` // yyyy-mm-dd
	Revenue  int64  `json:"revenue"`
	Deposits int64  `json:"deposits"`
	Orders   int64  `json:"orders"`
	Users    int64  `json:"users"`
}

// TimeSeries buckets the last `days` days (DB-agnostic: rows are fetched in the
// window and bucketed in Go, so no engine-specific date SQL is needed).
func (s *FinanceService) TimeSeries(days int, scope model.Scope) ([]FinanceDayPoint, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	db := scope.Apply(database.GetDB())
	since := startOfDayMilli(days - 1)
	loc := time.Now().Location()
	dayKey := func(ms int64) string { return time.UnixMilli(ms).In(loc).Format("2006-01-02") }

	points := map[string]*FinanceDayPoint{}
	for i := days - 1; i >= 0; i-- {
		k := time.Now().In(loc).AddDate(0, 0, -i).Format("2006-01-02")
		points[k] = &FinanceDayPoint{Date: k}
	}
	bump := func(ms int64, f func(p *FinanceDayPoint)) {
		if p := points[dayKey(ms)]; p != nil {
			f(p)
		}
	}

	type amtRow struct {
		At  int64
		Amt int64
	}
	var rows []amtRow
	db.Model(&model.ManualDepositRequest{}).Select("approved_at AS at, amount AS amt").
		Where("status = ? AND approved_at >= ?", model.ManualDepositApproved, since).Scan(&rows)
	for _, r := range rows {
		bump(r.At, func(p *FinanceDayPoint) { p.Revenue += r.Amt; p.Deposits += r.Amt })
	}
	rows = nil
	db.Model(&model.Payment{}).Select("created_at AS at, amount AS amt").
		Where("status = ? AND created_at >= ?", model.PaymentPaid, since).Scan(&rows)
	for _, r := range rows {
		bump(r.At, func(p *FinanceDayPoint) { p.Revenue += r.Amt; p.Deposits += r.Amt })
	}
	rows = nil
	db.Model(&model.Order{}).Select("created_at AS at, amount AS amt").
		Where("status = ? AND created_at >= ?", model.OrderCompleted, since).Scan(&rows)
	for _, r := range rows {
		bump(r.At, func(p *FinanceDayPoint) { p.Orders++ })
	}
	var uats []int64
	db.Model(&model.User{}).Where("created_at >= ?", since).Pluck("created_at", &uats)
	for _, at := range uats {
		bump(at, func(p *FinanceDayPoint) { p.Users++ })
	}

	out := make([]FinanceDayPoint, 0, days)
	keys := make([]string, 0, len(points))
	for k := range points {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		out = append(out, *points[k])
	}
	return out, nil
}

// ---- payment-method breakdown --------------------------------------------

type FinanceMethodStat struct {
	Method   string `json:"method"`
	Count    int64  `json:"count"`  // confirmed count
	Volume   int64  `json:"volume"` // confirmed volume
	Bonus    int64  `json:"bonus"`
	Pending  int64  `json:"pending"`
	Rejected int64  `json:"rejected"`
}

func (s *FinanceService) PaymentBreakdown(scope model.Scope) ([]FinanceMethodStat, error) {
	db := scope.Apply(database.GetDB())
	out := []FinanceMethodStat{}

	manual := FinanceMethodStat{Method: "manual"}
	manual.Count = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositApproved))
	manual.Volume = sumInt64(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositApproved), "amount")
	manual.Pending = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositPending))
	manual.Rejected = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ?", model.ManualDepositRejected))
	out = append(out, manual)

	for _, gw := range []string{"zarinpal", "plisio"} {
		m := FinanceMethodStat{Method: gw}
		base := func() *gorm.DB { return db.Model(&model.Payment{}).Where("gateway = ?", gw) }
		m.Count = countRows(base().Where("status = ?", model.PaymentPaid))
		m.Volume = sumInt64(base().Where("status = ?", model.PaymentPaid), "amount")
		m.Bonus = sumInt64(base().Where("status = ?", model.PaymentPaid), "bonus_amount")
		m.Pending = countRows(base().Where("status = ?", model.PaymentPending))
		m.Rejected = countRows(base().Where("status = ?", model.PaymentFailed))
		out = append(out, m)
	}
	return out, nil
}

// ---- segmentation ---------------------------------------------------------

type FinanceSegments struct {
	TotalUsers               int64 `json:"totalUsers"`
	RegisteredNeverDeposited int64 `json:"registeredNeverDeposited"`
	DepositedNeverPurchased  int64 `json:"depositedNeverPurchased"`
	PurchasedOnce            int64 `json:"purchasedOnce"`
	RepeatBuyers             int64 `json:"repeatBuyers"`
	HighValue                int64 `json:"highValue"`
	Inactive90d              int64 `json:"inactive90d"`
	Resellers                int64 `json:"resellers"`
	Members                  int64 `json:"members"`
	Managers                 int64 `json:"managers"`
	Admins                   int64 `json:"admins"`
}

func (s *FinanceService) Segments(scope model.Scope) (*FinanceSegments, error) {
	db := scope.Apply(database.GetDB())
	seg := &FinanceSegments{}
	seg.TotalUsers = countRows(db.Model(&model.User{}))

	deposits := s.depositByUser(scope)
	seg.RegisteredNeverDeposited = seg.TotalUsers - int64(len(deposits))
	if seg.RegisteredNeverDeposited < 0 {
		seg.RegisteredNeverDeposited = 0
	}
	for _, v := range deposits {
		if v >= FinanceHighValueThreshold {
			seg.HighValue++
		}
	}

	// Completed-order aggregates per buyer.
	type ordRow struct {
		UserId int
		C      int64
		LastAt int64
	}
	var ords []ordRow
	db.Model(&model.Order{}).Select("user_id, COUNT(*) AS c, MAX(created_at) AS last_at").
		Where("status = ?", model.OrderCompleted).Group("user_id").Scan(&ords)
	buyers := map[int]bool{}
	cutoff := startOfDayMilli(90)
	for _, r := range ords {
		buyers[r.UserId] = true
		if r.C == 1 {
			seg.PurchasedOnce++
		} else if r.C >= 2 {
			seg.RepeatBuyers++
		}
		if r.LastAt < cutoff {
			seg.Inactive90d++
		}
	}
	for u := range deposits {
		if !buyers[u] {
			seg.DepositedNeverPurchased++
		}
	}

	// Role counts.
	type roleRow struct {
		Role string
		C    int64
	}
	var rr []roleRow
	db.Model(&model.User{}).Select("role, COUNT(*) AS c").Group("role").Scan(&rr)
	for _, r := range rr {
		switch model.NormalizeRole(r.Role) {
		case model.RoleManager:
			seg.Managers += r.C
		case model.RoleReseller:
			seg.Resellers += r.C
		case model.RoleMember:
			seg.Members += r.C
		case model.RoleAdmin:
			seg.Admins += r.C
		}
	}
	return seg, nil
}

// ---- top lists ------------------------------------------------------------

type FinanceTopProduct struct {
	ProductId int    `json:"productId"`
	Name      string `json:"name"`
	Sales     int64  `json:"sales"`
	Revenue   int64  `json:"revenue"`
}

func (s *FinanceService) TopProducts(limit int, scope model.Scope) ([]FinanceTopProduct, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	var rows []FinanceTopProduct
	q := scope.ApplyCol(database.GetDB().Table("orders AS o"), "o.tenant_id")
	err := q.
		Select("o.product_id AS product_id, MAX(o.product_name) AS name, COUNT(*) AS sales, COALESCE(SUM(o.amount),0) AS revenue").
		Where("o.status = ?", model.OrderCompleted).
		Group("o.product_id").Order("revenue DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

type FinanceTopUser struct {
	UserId   int    `json:"userId"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Value    int64  `json:"value"`
	Count    int64  `json:"count"`
}

func (s *FinanceService) TopCustomers(limit int, scope model.Scope) ([]FinanceTopUser, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	var rows []FinanceTopUser
	q := scope.ApplyCol(database.GetDB().Table("orders AS o"), "o.tenant_id")
	err := q.
		Joins("LEFT JOIN users u ON u.id = o.user_id").
		Select("o.user_id AS user_id, MAX(u.username) AS username, MAX(u.role) AS role, COALESCE(SUM(o.amount),0) AS value, COUNT(*) AS count").
		Where("o.status = ?", model.OrderCompleted).
		Group("o.user_id").Order("value DESC").Limit(limit).Scan(&rows).Error
	for i := range rows {
		rows[i].Role = model.NormalizeRole(rows[i].Role)
	}
	return rows, err
}

func (s *FinanceService) TopResellers(limit int, scope model.Scope) ([]FinanceTopUser, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	var rows []FinanceTopUser
	q := scope.ApplyCol(database.GetDB().Table("transactions AS t"), "t.tenant_id")
	err := q.
		Joins("LEFT JOIN users u ON u.id = t.user_id").
		Select("t.user_id AS user_id, MAX(u.username) AS username, MAX(u.role) AS role, COALESCE(SUM(t.amount),0) AS value, COUNT(*) AS count").
		Where("t.source = ?", model.TxSourceReferral).
		Group("t.user_id").Order("value DESC").Limit(limit).Scan(&rows).Error
	for i := range rows {
		rows[i].Role = model.NormalizeRole(rows[i].Role)
	}
	return rows, err
}

// TopDepositors ranks users by lifetime confirmed deposit volume.
func (s *FinanceService) TopDepositors(limit int, scope model.Scope) ([]FinanceTopUser, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	deposits := s.depositByUser(scope)
	rows := make([]FinanceTopUser, 0, len(deposits))
	for uid, v := range deposits {
		rows = append(rows, FinanceTopUser{UserId: uid, Value: v})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Value > rows[j].Value })
	if len(rows) > limit {
		rows = rows[:limit]
	}
	// Resolve usernames for the top slice only.
	ids := make([]int, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.UserId)
	}
	users := map[int]struct {
		Username string
		Role     string
	}{}
	type ur struct {
		Id       int
		Username string
		Role     string
	}
	var urs []ur
	scope.Apply(database.GetDB()).Model(&model.User{}).Select("id, username, role").Where("id IN ?", ids).Scan(&urs)
	for _, u := range urs {
		users[u.Id] = struct {
			Username string
			Role     string
		}{u.Username, model.NormalizeRole(u.Role)}
	}
	for i := range rows {
		rows[i].Username = users[rows[i].UserId].Username
		rows[i].Role = users[rows[i].UserId].Role
	}
	return rows, nil
}

// ---- cashflow -------------------------------------------------------------

type FinanceCashflow struct {
	From         int64 `json:"from"`
	To           int64 `json:"to"`
	Income       int64 `json:"income"`       // confirmed deposits in range
	ProductSales int64 `json:"productSales"` // completed order amount in range
	Bonuses      int64 `json:"bonuses"`
	Refunds      int64 `json:"refunds"`
	Net          int64 `json:"net"` // income - refunds
	Deposits     int64 `json:"deposits"`
	Orders       int64 `json:"orders"`
}

// Cashflow reports money movement within [from, to] (ms). to<=0 means "now".
func (s *FinanceService) Cashflow(from, to int64, scope model.Scope) (*FinanceCashflow, error) {
	if to <= 0 {
		to = time.Now().UnixMilli()
	}
	db := scope.Apply(database.GetDB())
	cf := &FinanceCashflow{From: from, To: to}
	manualA := db.Model(&model.ManualDepositRequest{}).Where("status = ? AND approved_at >= ? AND approved_at <= ?", model.ManualDepositApproved, from, to)
	gatewayP := db.Model(&model.Payment{}).Where("status = ? AND created_at >= ? AND created_at <= ?", model.PaymentPaid, from, to)
	cf.Income = sumInt64(manualA, "amount") + sumInt64(gatewayP, "amount")
	cf.Deposits = countRows(db.Model(&model.ManualDepositRequest{}).Where("status = ? AND approved_at >= ? AND approved_at <= ?", model.ManualDepositApproved, from, to)) +
		countRows(db.Model(&model.Payment{}).Where("status = ? AND created_at >= ? AND created_at <= ?", model.PaymentPaid, from, to))
	cf.Bonuses = sumInt64(db.Model(&model.Payment{}).Where("status = ? AND created_at >= ? AND created_at <= ?", model.PaymentPaid, from, to), "bonus_amount")
	cf.Refunds = sumInt64(db.Model(&model.Transaction{}).Where("source = ? AND created_at >= ? AND created_at <= ?", model.TxSourceRefund, from, to), "amount")
	cf.ProductSales = sumInt64(db.Model(&model.Order{}).Where("status = ? AND created_at >= ? AND created_at <= ?", model.OrderCompleted, from, to), "amount")
	cf.Orders = countRows(db.Model(&model.Order{}).Where("status = ? AND created_at >= ? AND created_at <= ?", model.OrderCompleted, from, to))
	cf.Net = cf.Income - cf.Refunds
	return cf, nil
}

// ---- consistency / accounting checks --------------------------------------

type FinanceConsistency struct {
	SumUserBalances   int64 `json:"sumUserBalances"`
	LedgerNet         int64 `json:"ledgerNet"` // credits - debits
	Difference        int64 `json:"difference"`
	Balanced          bool  `json:"balanced"`
	NegativeBalances  int64 `json:"negativeBalances"`
	DuplicateTracking int64 `json:"duplicateTracking"`
	OrphanedOrders    int64 `json:"orphanedOrders"`
}

// ConsistencyCheck verifies the ledger against current balances and surfaces
// integrity anomalies. A non-zero Difference is expected only when balances were
// seeded directly (e.g. admin-created users with an initial balance) rather than
// via the ledger — that's the documented exception.
func (s *FinanceService) ConsistencyCheck(scope model.Scope) (*FinanceConsistency, error) {
	db := scope.Apply(database.GetDB())
	c := &FinanceConsistency{}
	c.SumUserBalances = sumInt64(db.Model(&model.User{}), "balance")
	credits := sumInt64(db.Model(&model.Transaction{}).Where("type = ?", model.TxCredit), "amount")
	debits := sumInt64(db.Model(&model.Transaction{}).Where("type = ?", model.TxDebit), "amount")
	c.LedgerNet = credits - debits
	c.Difference = c.SumUserBalances - c.LedgerNet
	c.Balanced = c.Difference == 0
	c.NegativeBalances = countRows(db.Model(&model.User{}).Where("balance < 0"))

	// Duplicate tracking numbers among manual deposits (potential double-submit).
	type dupRow struct{ N int64 }
	var dups []dupRow
	db.Model(&model.ManualDepositRequest{}).
		Select("COUNT(*) AS n").Where("tracking_number <> ''").
		Group("tracking_number").Having("COUNT(*) > 1").Scan(&dups)
	c.DuplicateTracking = int64(len(dups))

	// Orders pointing at a product that no longer exists (within scope).
	c.OrphanedOrders = countRows(db.Model(&model.Order{}).
		Where("product_id NOT IN (?)", scope.Apply(database.GetDB()).Model(&model.Product{}).Select("id")))
	return c, nil
}

// ---- unified deposit feed -------------------------------------------------

type FinanceDeposit struct {
	Method    string `json:"method"` // manual | zarinpal | plisio
	RefId     int    `json:"refId"`
	UserId    int    `json:"userId"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	Amount    int64  `json:"amount"`
	Bonus     int64  `json:"bonus"`
	Currency  string `json:"currency"`
	Status    string `json:"status"` // pending | approved | rejected
	CreatedAt int64  `json:"createdAt"`
}

type FinanceDepositFilter struct {
	Method string // manual | zarinpal | plisio | ""
	Status string // pending | approved | rejected | ""
	Role   string
	UserId int
	Search string
	From   int64
	To     int64
	Limit  int
	Offset int
}

// normalizeStatus maps gateway/manual statuses onto a single vocabulary.
func gatewayStatusToUnified(s string) string {
	switch s {
	case model.PaymentPaid:
		return "approved"
	case model.PaymentFailed:
		return "rejected"
	default:
		return "pending"
	}
}

// DepositsFeed merges manual + gateway deposits into one filtered, paginated,
// newest-first feed. Both tables are queried with the filters applied, capped at
// offset+limit each, then merged and sliced — bounded work suitable for an admin
// console. The feed JOINs users, so tenant scoping uses the qualified "d."
// alias to stay unambiguous.
func (s *FinanceService) DepositsFeed(f FinanceDepositFilter, scope model.Scope) ([]FinanceDeposit, int64, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 25
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	db := database.GetDB()
	out := []FinanceDeposit{}
	var total int64

	includeManual := f.Method == "" || f.Method == "manual"
	includeGateway := f.Method == "" || f.Method == "zarinpal" || f.Method == "plisio"

	if includeManual && (f.Status == "" || f.Status == "pending" || f.Status == "approved" || f.Status == "rejected") {
		q := db.Table("manual_deposit_requests AS d").Joins("LEFT JOIN users u ON u.id = d.user_id")
		q = scope.ApplyCol(q, "d.tenant_id")
		switch f.Status {
		case "approved":
			q = q.Where("d.status = ?", model.ManualDepositApproved)
		case "rejected":
			q = q.Where("d.status = ?", model.ManualDepositRejected)
		case "pending":
			q = q.Where("d.status = ?", model.ManualDepositPending)
		}
		q = applyDepositCommonFilters(q, "d", "u", f)
		var cnt int64
		q.Session(&gorm.Session{}).Count(&cnt)
		total += cnt
		type mrow struct {
			Id        int
			UserId    int
			Username  string
			Role      string
			Amount    int64
			Status    string
			CreatedAt int64
		}
		var rows []mrow
		q.Select("d.id, d.user_id, u.username, u.role, d.amount, d.status, d.created_at").
			Order("d.created_at DESC").Limit(f.Offset + f.Limit).Scan(&rows)
		for _, r := range rows {
			status := "pending"
			switch r.Status {
			case model.ManualDepositApproved:
				status = "approved"
			case model.ManualDepositRejected:
				status = "rejected"
			}
			out = append(out, FinanceDeposit{
				Method: "manual", RefId: r.Id, UserId: r.UserId, Username: r.Username,
				Role: model.NormalizeRole(r.Role), Amount: r.Amount, Status: status, CreatedAt: r.CreatedAt,
			})
		}
	}

	if includeGateway {
		q := db.Table("payments AS d").Joins("LEFT JOIN users u ON u.id = d.user_id")
		q = scope.ApplyCol(q, "d.tenant_id")
		if f.Method == "zarinpal" || f.Method == "plisio" {
			q = q.Where("d.gateway = ?", f.Method)
		}
		switch f.Status {
		case "approved":
			q = q.Where("d.status = ?", model.PaymentPaid)
		case "rejected":
			q = q.Where("d.status = ?", model.PaymentFailed)
		case "pending":
			q = q.Where("d.status = ?", model.PaymentPending)
		}
		q = applyDepositCommonFilters(q, "d", "u", f)
		var cnt int64
		q.Session(&gorm.Session{}).Count(&cnt)
		total += cnt
		type grow struct {
			Id          int
			UserId      int
			Username    string
			Role        string
			Gateway     string
			Amount      int64
			BonusAmount int64
			Currency    string
			Status      string
			CreatedAt   int64
		}
		var rows []grow
		q.Select("d.id, d.user_id, u.username, u.role, d.gateway, d.amount, d.bonus_amount, d.currency, d.status, d.created_at").
			Order("d.created_at DESC").Limit(f.Offset + f.Limit).Scan(&rows)
		for _, r := range rows {
			out = append(out, FinanceDeposit{
				Method: r.Gateway, RefId: r.Id, UserId: r.UserId, Username: r.Username,
				Role: model.NormalizeRole(r.Role), Amount: r.Amount, Bonus: r.BonusAmount, Currency: r.Currency,
				Status: gatewayStatusToUnified(r.Status), CreatedAt: r.CreatedAt,
			})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	if f.Offset < len(out) {
		end := f.Offset + f.Limit
		if end > len(out) {
			end = len(out)
		}
		out = out[f.Offset:end]
	} else {
		out = []FinanceDeposit{}
	}
	return out, total, nil
}

func applyDepositCommonFilters(q *gorm.DB, d, u string, f FinanceDepositFilter) *gorm.DB {
	if f.UserId > 0 {
		q = q.Where(d+".user_id = ?", f.UserId)
	}
	if f.Role != "" {
		q = q.Where(u+".role = ?", f.Role)
	}
	if f.From > 0 {
		q = q.Where(d+".created_at >= ?", f.From)
	}
	if f.To > 0 {
		q = q.Where(d+".created_at <= ?", f.To)
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		q = q.Where(u+".username LIKE ? OR CAST("+d+".user_id AS TEXT) = ?", "%"+s+"%", s)
	}
	return q
}

// ---- user financial profile ----------------------------------------------

type FinanceUserProfile struct {
	Id                 int    `json:"id"`
	Username           string `json:"username"`
	FullName           string `json:"fullName"`
	Role               string `json:"role"`
	Balance            int64  `json:"balance"`
	CreatedAt          int64  `json:"createdAt"`
	ReferredByUserId   int    `json:"referredByUserId"`
	ReferredByUsername string `json:"referredByUsername"`
	ReferralCode       string `json:"referralCode"`

	TotalDeposited  int64 `json:"totalDeposited"`
	TotalSpent      int64 `json:"totalSpent"`
	TotalPurchased  int64 `json:"totalPurchased"`
	TotalOrders     int64 `json:"totalOrders"`
	ActiveServices  int64 `json:"activeServices"`
	ExpiredServices int64 `json:"expiredServices"`
	LastPaymentAt   int64 `json:"lastPaymentAt"`
	LTV             int64 `json:"ltv"`

	Ledger    []model.Transaction `json:"ledger"`
	Purchases []model.Order       `json:"purchases"`
}

func (s *FinanceService) UserProfile(userId int, scope model.Scope) (*FinanceUserProfile, error) {
	db := scope.Apply(database.GetDB())
	var u model.User
	// Scoped lookup: a manager requesting a user outside their tenant gets a
	// not-found, never another workspace's customer profile.
	if err := db.Where("id = ?", userId).First(&u).Error; err != nil {
		return nil, ErrFinanceUserNotFound
	}
	p := &FinanceUserProfile{
		Id: u.Id, Username: u.Username, FullName: u.FullName, Role: u.CanonicalRole(),
		Balance: u.Balance, CreatedAt: u.CreatedAt, ReferredByUserId: u.ReferredByUserId,
		ReferralCode: u.ReferralCode,
	}
	if u.ReferredByUserId > 0 {
		var ref model.User
		if db.Select("username").Where("id = ?", u.ReferredByUserId).First(&ref).Error == nil {
			p.ReferredByUsername = ref.Username
		}
	}

	manualDep := sumInt64(db.Model(&model.ManualDepositRequest{}).Where("user_id = ? AND status = ?", userId, model.ManualDepositApproved), "amount")
	gatewayDep := sumInt64(db.Model(&model.Payment{}).Where("user_id = ? AND status = ?", userId, model.PaymentPaid), "amount")
	p.TotalDeposited = manualDep + gatewayDep
	p.LTV = p.TotalDeposited
	p.TotalSpent = sumInt64(db.Model(&model.Order{}).Where("user_id = ? AND status = ?", userId, model.OrderCompleted), "amount")
	p.TotalPurchased = countRows(db.Model(&model.Order{}).Where("user_id = ? AND status = ?", userId, model.OrderCompleted))
	p.TotalOrders = countRows(db.Model(&model.Order{}).Where("user_id = ?", userId))

	now := time.Now().UnixMilli()
	p.ActiveServices = countRows(db.Model(&model.ClientRecord{}).Where("owner_id = ? AND enable = ? AND (expiry_time = 0 OR expiry_time > ?)", userId, true, now))
	p.ExpiredServices = countRows(db.Model(&model.ClientRecord{}).Where("owner_id = ? AND expiry_time > 0 AND expiry_time <= ?", userId, now))

	var lastManual, lastGateway int64
	db.Model(&model.ManualDepositRequest{}).Select("COALESCE(MAX(approved_at),0)").Where("user_id = ? AND status = ?", userId, model.ManualDepositApproved).Scan(&lastManual)
	db.Model(&model.Payment{}).Select("COALESCE(MAX(created_at),0)").Where("user_id = ? AND status = ?", userId, model.PaymentPaid).Scan(&lastGateway)
	p.LastPaymentAt = lastManual
	if lastGateway > p.LastPaymentAt {
		p.LastPaymentAt = lastGateway
	}

	db.Where("user_id = ?", userId).Order("id DESC").Limit(50).Find(&p.Ledger)
	db.Where("user_id = ?", userId).Order("id DESC").Limit(50).Find(&p.Purchases)
	if p.Ledger == nil {
		p.Ledger = []model.Transaction{}
	}
	if p.Purchases == nil {
		p.Purchases = []model.Order{}
	}
	return p, nil
}

// ---- CSV exports ----------------------------------------------------------

func csvBytes(header []string, rows [][]string) []byte {
	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM so Excel reads it correctly
	w := csv.NewWriter(&buf)
	_ = w.Write(header)
	_ = w.WriteAll(rows)
	w.Flush()
	return buf.Bytes()
}

const exportRowCap = 50000

func (s *FinanceService) ExportTransactionsCSV(scope model.Scope) []byte {
	var txs []model.Transaction
	scope.Apply(database.GetDB()).Order("id DESC").Limit(exportRowCap).Find(&txs)
	rows := make([][]string, 0, len(txs))
	for _, t := range txs {
		rows = append(rows, []string{
			strconv.Itoa(t.Id), strconv.Itoa(t.UserId), t.Type, strconv.FormatInt(t.Amount, 10),
			strconv.FormatInt(t.BalanceBefore, 10), strconv.FormatInt(t.BalanceAfter, 10),
			t.Source, t.RefId, t.Actor, t.Description, fmtMilli(t.CreatedAt),
		})
	}
	return csvBytes([]string{"id", "user_id", "type", "amount", "balance_before", "balance_after", "source", "ref_id", "actor", "description", "created_at"}, rows)
}

func (s *FinanceService) ExportOrdersCSV(scope model.Scope) []byte {
	var orders []model.Order
	scope.Apply(database.GetDB()).Order("id DESC").Limit(exportRowCap).Find(&orders)
	rows := make([][]string, 0, len(orders))
	for _, o := range orders {
		rows = append(rows, []string{
			strconv.Itoa(o.Id), strconv.Itoa(o.UserId), strconv.Itoa(o.ProductId), o.ProductName,
			strconv.FormatInt(o.Amount, 10), o.Status, o.ClientEmail, fmtMilli(o.CreatedAt),
		})
	}
	return csvBytes([]string{"id", "user_id", "product_id", "product_name", "amount", "status", "client_email", "created_at"}, rows)
}

func (s *FinanceService) ExportDepositsCSV(f FinanceDepositFilter, scope model.Scope) []byte {
	// Honor the caller's active filters (method/status/search/range) so the export
	// matches what they're looking at, not the whole table.
	f.Limit = 200
	f.Offset = 0
	all, _, _ := s.DepositsFeed(f, scope)
	rows := make([][]string, 0, len(all))
	for _, d := range all {
		rows = append(rows, []string{
			d.Method, strconv.Itoa(d.RefId), strconv.Itoa(d.UserId), d.Username, d.Role,
			strconv.FormatInt(d.Amount, 10), strconv.FormatInt(d.Bonus, 10), d.Currency, d.Status, fmtMilli(d.CreatedAt),
		})
	}
	return csvBytes([]string{"method", "ref_id", "user_id", "username", "role", "amount", "bonus", "currency", "status", "created_at"}, rows)
}

func (s *FinanceService) ExportUsersCSV(scope model.Scope) []byte {
	var users []model.User
	scope.Apply(database.GetDB()).Order("id ASC").Limit(exportRowCap).Find(&users)
	deposits := s.depositByUser(scope)
	rows := make([][]string, 0, len(users))
	for _, u := range users {
		rows = append(rows, []string{
			strconv.Itoa(u.Id), u.Username, u.FullName, u.CanonicalRole(),
			strconv.FormatInt(u.Balance, 10), strconv.FormatInt(deposits[u.Id], 10), fmtMilli(u.CreatedAt),
		})
	}
	return csvBytes([]string{"id", "username", "full_name", "role", "balance", "total_deposited", "created_at"}, rows)
}

func fmtMilli(ms int64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).Format("2006-01-02 15:04:05")
}
