package service

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
)

// SyncService is the single, centralized entry point for converging the inbound
// attachments of product-provisioned clients to the database's source of truth.
//
// It does NOT reimplement node synchronization: client attach/detach already
// pushes to each inbound's node and marks the node dirty on failure, and the
// periodic ReconcileNode job converges any node that was offline or failed. This
// service is the missing layer ABOVE that — it makes a PRODUCT change fan out to
// every already-sold client (the bug where existing clients kept stale inbound
// mappings), with a diff engine, bounded retries, and an audit trail.
type SyncService struct {
	clientService  ClientService
	inboundService InboundService
	xrayService    XrayService
}

const (
	syncRetryAttempts = 3
	syncRetryDelay    = 300 * time.Millisecond
)

// ClientSyncResult is the per-client outcome of a reconciliation.
type ClientSyncResult struct {
	Email       string `json:"email"`
	NeedRestart bool   `json:"needRestart"`
	OK          bool   `json:"ok"`
	Err         string `json:"err,omitempty"`
}

// SyncReport summarizes a product reconciliation.
type SyncReport struct {
	ProductID       int                `json:"productId"`
	Added           []int              `json:"added"`
	Removed         []int              `json:"removed"`
	AffectedClients int                `json:"affectedClients"`
	Synced          int                `json:"synced"`
	Failed          int                `json:"failed"`
	NeedRestart     bool               `json:"needRestart"`
	Results         []ClientSyncResult `json:"results,omitempty"`
}

// InboundDiff is the pure set-difference engine: given a client/product's old
// and new inbound id lists it returns which inbounds to ADD and which to REMOVE.
// Order-independent, duplicate-safe, and only ever reports genuinely changed ids
// (so unchanged inbounds are never touched — no full client recreation).
func InboundDiff(oldIDs, newIDs []int) (add, remove []int) {
	oldSet := make(map[int]struct{}, len(oldIDs))
	for _, id := range oldIDs {
		oldSet[id] = struct{}{}
	}
	newSet := make(map[int]struct{}, len(newIDs))
	for _, id := range newIDs {
		newSet[id] = struct{}{}
	}
	for id := range newSet {
		if _, ok := oldSet[id]; !ok {
			add = append(add, id)
		}
	}
	for id := range oldSet {
		if _, ok := newSet[id]; !ok {
			remove = append(remove, id)
		}
	}
	sort.Ints(add)
	sort.Ints(remove)
	return add, remove
}

// ReconcileProductClients applies an inbound diff (add/remove) to EVERY client
// sold from the given product. It is the fix for "existing clients keep old
// inbound assignments after a product update": new purchases already get the
// new inbounds; this re-syncs the ones provisioned before the change.
//
// Each client is attached/detached through the node-aware primitives (which push
// to the inbound's node and mark it dirty on failure), with a bounded retry per
// client. Every operation is audited. The whole thing is best-effort per client:
// one client's failure never aborts the others, and a failed node push is picked
// up later by ReconcileNode.
func (s *SyncService) ReconcileProductClients(actor string, productID int, add, remove []int) (SyncReport, error) {
	report := SyncReport{ProductID: productID, Added: add, Removed: remove}
	if len(add) == 0 && len(remove) == 0 {
		return report, nil
	}
	emails, err := s.productClientEmails(productID)
	if err != nil {
		return report, err
	}
	report.AffectedClients = len(emails)

	for _, email := range emails {
		res := s.reconcileClient(actor, productID, email, add, remove)
		report.Results = append(report.Results, res)
		if res.NeedRestart {
			report.NeedRestart = true
		}
		if res.OK {
			report.Synced++
		} else {
			report.Failed++
		}
	}
	if report.NeedRestart {
		s.xrayService.SetToNeedRestart()
	}
	logger.Infof("sync: product %d reconcile by %q — clients=%d synced=%d failed=%d add=%v remove=%v",
		productID, actorOrSystem(actor), report.AffectedClients, report.Synced, report.Failed, add, remove)
	return report, nil
}

// reconcileClient attaches the added inbounds and detaches the removed ones for a
// single client, with retry + audit on each side.
func (s *SyncService) reconcileClient(actor string, productID int, email string, add, remove []int) ClientSyncResult {
	res := ClientSyncResult{Email: email, OK: true}
	if len(add) > 0 {
		nr, err := s.withRetry(func() (bool, error) {
			return s.clientService.AttachByEmail(&s.inboundService, email, add)
		})
		res.NeedRestart = res.NeedRestart || nr
		s.audit(actor, productID, email, model.SyncActionAttach, add, err)
		if err != nil {
			res.OK = false
			res.Err = err.Error()
		}
	}
	if len(remove) > 0 {
		nr, err := s.withRetry(func() (bool, error) {
			return s.clientService.DetachByEmailMany(&s.inboundService, email, remove)
		})
		res.NeedRestart = res.NeedRestart || nr
		s.audit(actor, productID, email, model.SyncActionDetach, remove, err)
		if err != nil {
			res.OK = false
			if res.Err != "" {
				res.Err += "; "
			}
			res.Err += err.Error()
		}
	}
	return res
}

// ReconcileAllProducts is the periodic drift-repair pass. For every active
// product it finds clients that are MISSING one or more of the product's current
// inbounds (a single batched query per product — no N+1) and attaches only those.
// It is purely additive (never strips manually-added inbounds), idempotent, and a
// no-op in steady state, so it is safe to run frequently. It catches clients that
// missed an update due to a transient failure or node outage.
func (s *SyncService) ReconcileAllProducts() error {
	var products []model.Product
	if err := database.GetDB().
		Where("status = ?", model.ProductActive).
		Find(&products).Error; err != nil {
		return err
	}
	needRestart := false
	for _, p := range products {
		ids := []int(p.InboundIds)
		if len(ids) == 0 {
			continue
		}
		drifted, err := s.driftedEmails(p.Id, ids)
		if err != nil {
			logger.Warning("sync worker: drift query for product", p.Id, "failed:", err)
			continue
		}
		for _, email := range drifted {
			nr, aerr := s.withRetry(func() (bool, error) {
				return s.clientService.AttachByEmail(&s.inboundService, email, ids)
			})
			s.audit("reconcile-worker", p.Id, email, model.SyncActionReconcile, ids, aerr)
			if nr {
				needRestart = true
			}
		}
		if len(drifted) > 0 {
			logger.Infof("sync worker: product %d repaired %d drifted client(s)", p.Id, len(drifted))
		}
	}
	if needRestart {
		s.xrayService.SetToNeedRestart()
	}
	return nil
}

// productClientEmails returns the distinct config emails provisioned from a
// product (linked via the order's client_email).
func (s *SyncService) productClientEmails(productID int) ([]string, error) {
	var emails []string
	err := database.GetDB().Model(&model.Order{}).
		Where("product_id = ? AND client_email <> ?", productID, "").
		Distinct().Pluck("client_email", &emails).Error
	return emails, err
}

// driftedEmails returns, in three batched queries (no per-client round-trips),
// the product's client emails that are missing at least one of wantIDs.
func (s *SyncService) driftedEmails(productID int, wantIDs []int) ([]string, error) {
	emails, err := s.productClientEmails(productID)
	if err != nil || len(emails) == 0 {
		return nil, err
	}
	db := database.GetDB()

	// email -> record id
	type rec struct {
		Id    int
		Email string
	}
	var records []rec
	if err := db.Model(&model.ClientRecord{}).
		Select("id", "email").Where("email IN ?", emails).Scan(&records).Error; err != nil {
		return nil, err
	}
	idToEmail := make(map[int]string, len(records))
	recordIDs := make([]int, 0, len(records))
	for _, r := range records {
		idToEmail[r.Id] = r.Email
		recordIDs = append(recordIDs, r.Id)
	}
	if len(recordIDs) == 0 {
		return nil, nil
	}

	// client_id -> set(inbound_id)
	var links []model.ClientInbound
	if err := db.Model(&model.ClientInbound{}).
		Where("client_id IN ?", recordIDs).Find(&links).Error; err != nil {
		return nil, err
	}
	attached := make(map[int]map[int]struct{}, len(recordIDs))
	for _, l := range links {
		if attached[l.ClientId] == nil {
			attached[l.ClientId] = make(map[int]struct{})
		}
		attached[l.ClientId][l.InboundId] = struct{}{}
	}

	var drifted []string
	for cid, email := range idToEmail {
		set := attached[cid]
		for _, want := range wantIDs {
			if _, ok := set[want]; !ok {
				drifted = append(drifted, email)
				break
			}
		}
	}
	return drifted, nil
}

// withRetry runs a node-affecting operation up to syncRetryAttempts times. The
// first retry is immediate-ish (short delay); persistent failures return the last
// error, by which point the affected inbound's node has been marked dirty and
// will be repaired by the node ReconcileNode job.
func (s *SyncService) withRetry(op func() (bool, error)) (bool, error) {
	var (
		needRestart bool
		err         error
	)
	for attempt := 0; attempt < syncRetryAttempts; attempt++ {
		needRestart, err = op()
		if err == nil {
			return needRestart, nil
		}
		if attempt < syncRetryAttempts-1 {
			time.Sleep(syncRetryDelay * time.Duration(attempt+1))
		}
	}
	return needRestart, err
}

// audit writes one append-only SyncAudit row. Failures to write the audit are
// logged but never affect the sync itself.
func (s *SyncService) audit(actor string, productID int, email, action string, ids []int, opErr error) {
	result, detail := model.SyncResultOK, ""
	if opErr != nil {
		result, detail = model.SyncResultError, opErr.Error()
	}
	row := &model.SyncAudit{
		Actor:       actorOrSystem(actor),
		ProductId:   productID,
		ClientEmail: email,
		Action:      action,
		InboundIds:  intsToCSV(ids),
		Result:      result,
		Detail:      detail,
	}
	if err := database.GetDB().Create(row).Error; err != nil {
		logger.Warning("sync: audit write failed:", err)
	}
}

// ListRecentAudit returns the most recent sync audit rows (newest first).
func (s *SyncService) ListRecentAudit(limit int) ([]model.SyncAudit, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	var rows []model.SyncAudit
	err := database.GetDB().Order("id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func actorOrSystem(actor string) string {
	if strings.TrimSpace(actor) == "" {
		return "system"
	}
	return actor
}

func intsToCSV(ids []int) string {
	if len(ids) == 0 {
		return ""
	}
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = strconv.Itoa(id)
	}
	return strings.Join(parts, ",")
}
