package db

import (
	"net/url"
	"os"
	"strconv"
	"testing"

	"conferenceplatforma/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// TestRLSEnforcement is the fail-closed Row-Level-Security gate. It runs the full
// migration set (which installs the tenant_isolation policies), provisions a
// restricted role WITHOUT BYPASSRLS, then proves end-to-end that, connecting as
// that role:
//   - with no app.conf_id set, a scoped table returns ZERO rows (fail-closed);
//   - with app.conf_id set to conference A, only A's rows are visible;
//   - a WITH CHECK violation (writing another conference's row) is rejected.
//
// Skipped unless TEST_DATABASE_URL points at a clean Postgres database the
// connecting role OWNS (so it can CREATE ROLE / GRANT), e.g.:
//
//	TEST_DATABASE_URL=postgres://conf:confpass@localhost:5434/conftest?sslmode=disable \
//	  go test ./internal/db/ -run TestRLSEnforcement -v
func TestRLSEnforcement(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (clean Postgres) to run the RLS gate")
	}

	owner, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open owner: %v", err)
	}
	if err := RunMigrations(owner); err != nil {
		t.Fatalf("migrations: %v", err)
	}

	// Provision a restricted, non-BYPASSRLS role (idempotent).
	const appRole = "conf_app_rlstest"
	const appPass = "rlstest"
	for _, stmt := range []string{
		"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '" + appRole + "') THEN " +
			"CREATE ROLE " + appRole + " LOGIN PASSWORD '" + appPass + "' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF; END $$;",
		"GRANT USAGE ON SCHEMA public TO " + appRole,
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO " + appRole,
		"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO " + appRole,
	} {
		if err := owner.Exec(stmt).Error; err != nil {
			t.Fatalf("provision role (%s): %v", stmt, err)
		}
	}

	// Seed two tenants as owner (owner bypasses RLS).
	orgA := models.Organization{Slug: "rls-a", DisplayName: "A"}
	orgB := models.Organization{Slug: "rls-b", DisplayName: "B"}
	mustCreate(t, owner, &orgA)
	mustCreate(t, owner, &orgB)
	confA := models.Conference{Title: "RLS A", OrganizationID: &orgA.ID}
	confB := models.Conference{Title: "RLS B", OrganizationID: &orgB.ID}
	mustCreate(t, owner, &confA)
	mustCreate(t, owner, &confB)
	mustCreate(t, owner, &models.Section{Title: "Sec A", Room: "R", ConferenceID: &confA.ID})
	mustCreate(t, owner, &models.Section{Title: "Sec B", Room: "R", ConferenceID: &confB.ID})

	// Connect as the restricted role.
	appDSN, err := withUser(dsn, appRole, appPass)
	if err != nil {
		t.Fatalf("build app dsn: %v", err)
	}
	app, err := gorm.Open(postgres.Open(appDSN), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open app role: %v", err)
	}

	// 1) Fail-closed: no app.conf_id set → zero rows visible.
	var count int64
	if err := app.Table("sections").Count(&count).Error; err != nil {
		t.Fatalf("count without scope: %v", err)
	}
	if count != 0 {
		t.Errorf("fail-closed violated: restricted role saw %d sections with no app.conf_id set, want 0", count)
	}

	// 2) Scoped read: within a tx that sets app.conf_id = confA, only A is visible.
	if err := app.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT set_config('app.conf_id', ?, true)", strconv.FormatUint(uint64(confA.ID), 10)).Error; err != nil {
			return err
		}
		var secs []models.Section
		if err := tx.Find(&secs).Error; err != nil {
			return err
		}
		if len(secs) != 1 {
			t.Errorf("scoped read returned %d sections, want exactly 1 (conf A)", len(secs))
		}
		for _, s := range secs {
			if s.ConferenceID == nil || *s.ConferenceID != confA.ID {
				t.Errorf("RLS leaked section from conference %v, want %d", s.ConferenceID, confA.ID)
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("scoped read tx: %v", err)
	}

	// 3) WITH CHECK: while scoped to conf A, writing a conf-B row must be rejected.
	werr := app.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT set_config('app.conf_id', ?, true)", strconv.FormatUint(uint64(confA.ID), 10)).Error; err != nil {
			return err
		}
		return tx.Exec("INSERT INTO sections (conference_id, title, room, created_at, updated_at) VALUES (?, 'x', 'y', now(), now())", confB.ID).Error
	})
	if werr == nil {
		t.Error("WITH CHECK violated: restricted role inserted a section into another tenant's conference")
	}
}

// withUser returns the DSN with its username/password replaced — used to connect
// as the restricted RLS role against the same database.
func withUser(dsn, user, pass string) (string, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return "", err
	}
	u.User = url.UserPassword(user, pass)
	return u.String(), nil
}
