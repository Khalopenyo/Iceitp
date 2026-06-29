package db

import "testing"

// TestTenantScopedRegistryWellFormed guards the single tenant-table registry:
// no duplicate tables and only the two known tenant columns. Prevents a future
// edit from silently introducing an inconsistent entry.
func TestTenantScopedRegistryWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, e := range tenantScopedTables {
		if seen[e.table] {
			t.Fatalf("duplicate registry entry for table %q", e.table)
		}
		seen[e.table] = true
		if e.column != "conference_id" && e.column != "organization_id" {
			t.Fatalf("table %q has unexpected tenant column %q", e.table, e.column)
		}
		if e.rls && e.setting == "" {
			t.Fatalf("table %q is RLS-scoped but has no session setting", e.table)
		}
	}
}

// TestTenantScopedRegistryCoversNotNullList enforces that every table the NOT-NULL
// flip touches is present in the registry — so adding/removing a tenant table can't
// leave the lists silently diverged (the drift the registry exists to prevent).
func TestTenantScopedRegistryCoversNotNullList(t *testing.T) {
	confTables := map[string]bool{}
	for _, e := range tenantScopedTables {
		if e.column == "conference_id" {
			confTables[e.table] = true
		}
	}
	for _, tbl := range tenantNotNullConfTables {
		if !confTables[tbl] {
			t.Fatalf("NOT-NULL table %q is missing from tenantScopedTables registry", tbl)
		}
	}
}
