package db

import (
	"os"
	"testing"

	"conferenceplatforma/internal/models"
)

// TestMigrationsOnPostgres is the Postgres migration gate: it runs the full
// migration set on a real (clean) Postgres database — exercising the
// dialect-specific paths (e.g. the questions ALTER) that SQLite never sees — and
// asserts it is idempotent on a second run.
//
// Skipped unless TEST_DATABASE_URL points at a clean Postgres database, e.g.:
//
//	TEST_DATABASE_URL=postgres://conf:confpass@localhost:5434/conftest?sslmode=disable \
//	  go test ./internal/db/ -run TestMigrationsOnPostgres -v
//
// CI runs it against a postgres service container.
func TestMigrationsOnPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (clean Postgres) to run the Postgres migration gate")
	}
	db, _ := freshScratchDB(t, dsn, "mig_gate")
	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations (idempotent re-run): %v", err)
	}
	if !db.Migrator().HasTable(&models.Organization{}) {
		t.Fatal("organizations table missing after migrations")
	}
}
