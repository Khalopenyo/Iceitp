package handlers

import "testing"

// isolationEnforced gates the cross-tenant isolation suite.
//
// Phase 0: false — tenant scoping and Postgres RLS are not implemented yet, so
// the assertions would fail. The suite is wired and discoverable in CI as SKIP.
// Phase 2 flips this to true (and the suite runs on real Postgres with RLS and an
// app DB role without BYPASSRLS) to make cross-tenant isolation a hard,
// fail-closed gate. See ADR-0001 and docs/phase0-writepath-audit.md.
const isolationEnforced = false

// TestCrossTenantIsolation asserts that a user of organization A can never read
// or mutate organization B's data across the tenant-scoped endpoints (users,
// sections, rooms, feedback, chat list + attachments, program, map markers/routes,
// submissions, consents, schedule). Intentionally skipped until Phase 2; the
// harness (two-org fixture + per-endpoint assertions) is built in Phase 2.
func TestCrossTenantIsolation(t *testing.T) {
	if !isolationEnforced {
		t.Skip("cross-tenant isolation is enforced from Phase 2 (subdomain resolution + GORM scope + Postgres RLS); harness wired, assertions added then")
	}

	// Phase 2: seed two organizations with their own users/sections/data, then for
	// every tenant-scoped endpoint assert the caller from org A receives only org A
	// data (404/403 for org B ids), and direct DB access under tenant A returns 0
	// rows of tenant B (RLS fail-closed).
	t.Fatal("isolation assertions not yet implemented (Phase 2)")
}
