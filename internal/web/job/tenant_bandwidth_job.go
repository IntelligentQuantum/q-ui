package job

import (
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

// TenantBandwidthJob rolls each Manager workspace's client traffic up into the
// tenant's bandwidth_used_bytes, so the admin allocation view and the
// provisioning quota guard reflect real consumption.
type TenantBandwidthJob struct {
	tenantService service.TenantService
}

// NewTenantBandwidthJob creates a new tenant-bandwidth aggregation job.
func NewTenantBandwidthJob() *TenantBandwidthJob {
	return new(TenantBandwidthJob)
}

// Run is the cron Job interface method.
func (j *TenantBandwidthJob) Run() {
	if err := j.tenantService.RecalculateBandwidthUsage(); err != nil {
		logger.Warning("tenant bandwidth aggregation failed:", err)
	}
}
