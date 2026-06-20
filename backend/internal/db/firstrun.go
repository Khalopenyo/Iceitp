package db

import (
	"log"

	"gorm.io/gorm"
)

// EnsureFirstRun is the bootstrap hook invoked once at startup, after migrations
// and before seeding.
//
// Phase 0: a no-op placeholder (logs and returns nil).
//
// Phase 1 will, on an EMPTY database, create organization #1 (the existing
// institute) FIRST and attach the bootstrap conference / sections / rooms /
// markers to it, so the new NOT NULL tenant columns hold (see ADR-0004 and
// docs/phase0-writepath-audit.md). On an already-populated database it stays a
// no-op, leaving the live conference untouched.
func EnsureFirstRun(db *gorm.DB) error {
	log.Printf("db: EnsureFirstRun — no-op (Phase 0)")
	return nil
}
