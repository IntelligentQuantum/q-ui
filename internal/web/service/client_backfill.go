package service

import (
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
)

// visionFlow is the standard XTLS flow for VLESS over TCP with TLS or REALITY. A
// config on such an inbound must carry it to connect; ClientService.Create strips
// it automatically on inbounds that can't use it (non-VLESS, ws/grpc/etc.).
const visionFlow = "xtls-rprx-vision"

// BackfillVisionFlow is a ONE-TIME repair for store-provisioned configs created
// without a flow. The store used to skip the flow that hand-made configs on the
// Clients page receive, so a VLESS+TCP+(TLS|REALITY) config bought from the store
// could not connect while a hand-made one could. This sets visionFlow on every
// existing config that sits on a Vision-capable inbound but has an empty flow,
// going through the canonical UpdateByEmail path so the inbound JSON, the
// normalized tables and any node copies stay consistent.
//
// Guarded by HistoryOfSeeders so it runs exactly once (it won't fight an operator
// who later deliberately clears a flow). Best-effort: a per-config failure is
// logged and skipped, never blocking startup. Returns whether xray needs a restart.
func (s *ClientService) BackfillVisionFlow(inboundSvc *InboundService) (bool, error) {
	const seeder = "ClientVisionFlowBackfill"
	db := database.GetDB()

	var done int64
	if err := db.Model(&model.HistoryOfSeeders{}).
		Where(&model.HistoryOfSeeders{SeederName: seeder}).Count(&done).Error; err != nil {
		return false, err
	}
	if done > 0 {
		return false, nil
	}

	var inbounds []*model.Inbound
	if err := db.Find(&inbounds).Error; err != nil {
		return false, err
	}

	// Collect the emails of flow-less configs that sit on a Vision-capable inbound.
	targets := make(map[string]struct{})
	for _, ib := range inbounds {
		if !inboundCanEnableTlsFlow(string(ib.Protocol), ib.StreamSettings, ib.Settings) {
			continue
		}
		clients, err := inboundSvc.GetClients(ib)
		if err != nil {
			logger.Warning("vision backfill: read clients for inbound", ib.Id, "failed:", err)
			continue
		}
		for i := range clients {
			email := strings.TrimSpace(clients[i].Email)
			if email != "" && strings.TrimSpace(clients[i].Flow) == "" {
				targets[email] = struct{}{}
			}
		}
	}

	needRestart := false
	fixed := 0
	for email := range targets {
		rec, err := s.GetRecordByEmail(nil, email)
		if err != nil {
			logger.Warning("vision backfill: load", email, "failed:", err)
			continue
		}
		updated := *rec.ToClient()
		updated.Flow = visionFlow
		// Retry on a transient Postgres deadlock (40P01): the per-config update
		// contends with the traffic writer / xray-stats sweeps that run right after
		// startup. A short bounded retry clears it without skipping the config.
		var nr bool
		var uErr error
		for attempt := 0; attempt < 4; attempt++ {
			nr, uErr = s.UpdateByEmail(inboundSvc, email, updated)
			if uErr == nil || !strings.Contains(strings.ToLower(uErr.Error()), "deadlock") {
				break
			}
		}
		if uErr != nil {
			logger.Warning("vision backfill: update", email, "failed:", uErr)
			continue
		}
		needRestart = needRestart || nr
		fixed++
	}

	if err := db.Create(&model.HistoryOfSeeders{SeederName: seeder}).Error; err != nil {
		return needRestart, err
	}
	if fixed > 0 {
		logger.Infof("vision flow backfill: set %s on %d flow-less config(s) on Vision-capable inbounds", visionFlow, fixed)
	}
	return needRestart, nil
}
