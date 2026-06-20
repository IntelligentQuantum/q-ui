package service

import (
	"path/filepath"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// TestReconcileWorkspaces reproduces the production VPS state — TWO managers
// stranded at tenant_id 0 with no workspace — and asserts ReconcileWorkspaces
// provisions a distinct workspace for each and links it. This exercises the full
// fix chain: before the partial-index migration the SECOND EnsureWorkspaceForUser
// failed (duplicate empty domain/api_key_hash), which is exactly how managers got
// stranded. The run must also be idempotent.
func TestReconcileWorkspaces(t *testing.T) {
	dbDir := t.TempDir()
	t.Setenv("QUI_DB_FOLDER", dbDir)
	if err := database.InitDB(filepath.Join(dbDir, "q-ui.db")); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	t.Cleanup(func() { _ = database.CloseDB() })

	db := database.GetDB()
	mgrs := []*model.User{
		{Username: "mehdi", Password: "x", Role: model.RoleManager, TenantId: model.GlobalTenantId},
		{Username: "tester", Password: "x", Role: model.RoleManager, TenantId: model.GlobalTenantId},
	}
	for _, m := range mgrs {
		if err := db.Create(m).Error; err != nil {
			t.Fatalf("create manager %s: %v", m.Username, err)
		}
	}

	if err := (&ManagerService{}).ReconcileWorkspaces(); err != nil {
		t.Fatalf("ReconcileWorkspaces: %v", err)
	}

	seen := map[int]bool{}
	for _, m := range mgrs {
		var reloaded model.User
		if err := db.First(&reloaded, m.Id).Error; err != nil {
			t.Fatalf("reload manager %s: %v", m.Username, err)
		}
		if reloaded.TenantId <= model.GlobalTenantId {
			t.Fatalf("manager %s should own a real workspace, got tenant_id %d", m.Username, reloaded.TenantId)
		}
		var tenant model.Tenant
		if err := db.Where("manager_user_id = ?", m.Id).First(&tenant).Error; err != nil {
			t.Fatalf("expected a workspace for manager %s: %v", m.Username, err)
		}
		if tenant.Id != reloaded.TenantId {
			t.Fatalf("manager %s: user.tenant_id (%d) must point at owned workspace (%d)", m.Username, reloaded.TenantId, tenant.Id)
		}
		if seen[tenant.Id] {
			t.Fatalf("managers must not share a workspace (id %d)", tenant.Id)
		}
		seen[tenant.Id] = true
	}

	// Idempotent: a second run creates nothing new.
	if err := (&ManagerService{}).ReconcileWorkspaces(); err != nil {
		t.Fatalf("second ReconcileWorkspaces: %v", err)
	}
	var count int64
	db.Model(&model.Tenant{}).Count(&count)
	if count != int64(len(mgrs)) {
		t.Fatalf("reconcile must be idempotent: expected %d workspaces, got %d", len(mgrs), count)
	}
}
