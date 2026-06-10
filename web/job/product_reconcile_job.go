package job

import (
	"github.com/mhsanaei/3x-ui/v3/logger"
	"github.com/mhsanaei/3x-ui/v3/web/service"
)

// ProductReconcileJob is the periodic drift-repair worker. It re-asserts that
// every config sold from an active product is attached to all of that product's
// current inbounds, repairing clients that missed an earlier update because of a
// transient failure, a node outage, or a partial sync. It is additive and
// idempotent — a no-op in steady state — so it is safe to run on a short cron.
//
// It complements (does not replace) the node ReconcileNode job: this converges
// CLIENT <-> PRODUCT inbound membership; ReconcileNode converges NODE <-> DB.
type ProductReconcileJob struct {
	syncService service.SyncService
}

// NewProductReconcileJob creates the product reconciliation worker.
func NewProductReconcileJob() *ProductReconcileJob {
	return &ProductReconcileJob{}
}

// Run performs one reconciliation pass over all active products.
func (j *ProductReconcileJob) Run() {
	if err := j.syncService.ReconcileAllProducts(); err != nil {
		logger.Warning("product reconcile job failed:", err)
	}
}
