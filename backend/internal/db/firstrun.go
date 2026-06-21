package db

import "gorm.io/gorm"

// EnsureFirstRun links any not-yet-scoped data to organization #1, running AFTER
// the seeder so that fresh-install rows created by seed() (conference, sections,
// rooms, markers) are attached to org #1 and their conference_id is populated.
//
// It delegates to the same idempotent backfill used by the Phase-1 migration, so
// on an already-linked database (live/prod) it is a no-op, and on an empty
// database it does nothing. This guarantees conference_id is populated everywhere
// before read-scoping and the NOT NULL flip land (Phase 2.x).
func EnsureFirstRun(db *gorm.DB) error {
	return linkExistingToDefaultOrg(db)
}
