package database

import (
	"path/filepath"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// TestTenantPartialUniqueIndexes guards the fix for the bug that stranded every
// manager after the first at tenant_id 0: the plain unique index on
// tenants.domain / tenants.api_key_hash treated the empty string as a real value, so only ONE
// workspace could have an empty domain or un-minted api key. The migration
// replaces those with PARTIAL unique indexes (on non-empty values only), so multiple
// "unset" workspaces coexist while real values stay unique.
func TestTenantPartialUniqueIndexes(t *testing.T) {
	dbDir := t.TempDir()
	t.Setenv("QUI_DB_FOLDER", dbDir)
	if err := InitDB(filepath.Join(dbDir, "q-ui.db")); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	t.Cleanup(func() { _ = CloseDB() })

	// Two workspaces, both with empty domain AND empty api_key_hash (the state a
	// promotion-created workspace starts in), must BOTH persist.
	a := &model.Tenant{Slug: "ws-a", ManagerUserId: 1001, Name: "A", Status: model.TenantActive}
	b := &model.Tenant{Slug: "ws-b", ManagerUserId: 1002, Name: "B", Status: model.TenantActive}
	if err := db.Create(a).Error; err != nil {
		t.Fatalf("create first empty-domain workspace: %v", err)
	}
	if err := db.Create(b).Error; err != nil {
		t.Fatalf("second empty-domain/empty-apikey workspace must be allowed, got: %v", err)
	}

	// A duplicate NON-empty domain must still be rejected by the partial index.
	a.Domain = "example.com"
	if err := db.Save(a).Error; err != nil {
		t.Fatalf("set domain on first workspace: %v", err)
	}
	dup := &model.Tenant{Slug: "ws-c", ManagerUserId: 1003, Name: "C", Status: model.TenantActive, Domain: "example.com"}
	if err := db.Create(dup).Error; err == nil {
		t.Fatalf("duplicate non-empty domain must be rejected by the partial unique index")
	}

	// A duplicate NON-empty api_key_hash must likewise still be rejected.
	b.ApiKeyHash = "deadbeef"
	if err := db.Save(b).Error; err != nil {
		t.Fatalf("set api_key_hash on second workspace: %v", err)
	}
	dupKey := &model.Tenant{Slug: "ws-d", ManagerUserId: 1004, Name: "D", Status: model.TenantActive, ApiKeyHash: "deadbeef"}
	if err := db.Create(dupKey).Error; err == nil {
		t.Fatalf("duplicate non-empty api_key_hash must be rejected by the partial unique index")
	}
}
