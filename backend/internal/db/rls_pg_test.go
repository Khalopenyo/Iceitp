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

	provisionRLSTestRole(t, owner)

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
	appDSN, err := withUser(dsn, rlsTestRole, rlsTestPass)
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

const (
	rlsTestRole = "conf_app_rlstest"
	rlsTestPass = "rlstest"
)

// provisionRLSTestRole creates (idempotently) the restricted, non-BYPASSRLS role
// the RLS gates connect as, and grants it table/sequence access.
func provisionRLSTestRole(t *testing.T, owner *gorm.DB) {
	t.Helper()
	for _, stmt := range []string{
		"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '" + rlsTestRole + "') THEN " +
			"CREATE ROLE " + rlsTestRole + " LOGIN PASSWORD '" + rlsTestPass + "' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF; END $$;",
		"GRANT USAGE ON SCHEMA public TO " + rlsTestRole,
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO " + rlsTestRole,
		"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO " + rlsTestRole,
	} {
		if err := owner.Exec(stmt).Error; err != nil {
			t.Fatalf("provision role (%s): %v", stmt, err)
		}
	}
}

// TestRLSOrgScopedAndOwnerBypass proves the two-pool rollout model:
//   - the OWNER connection sees every org's users (so auth's global login /
//     uniqueness queries keep working when the app pool is RLS-restricted);
//   - the restricted app role is fail-closed on the org-scoped users table with
//     no app.org_id, and sees only its org's users once app.org_id is set.
func TestRLSOrgScopedAndOwnerBypass(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (clean Postgres) to run the RLS org-scoped gate")
	}
	owner, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open owner: %v", err)
	}
	if err := RunMigrations(owner); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	provisionRLSTestRole(t, owner)

	orgA := models.Organization{Slug: "rls-own-a", DisplayName: "OA"}
	orgB := models.Organization{Slug: "rls-own-b", DisplayName: "OB"}
	mustCreate(t, owner, &orgA)
	mustCreate(t, owner, &orgB)
	mustCreate(t, owner, &models.User{Email: "own-a@x.test", Role: models.RoleParticipant, OrganizationID: &orgA.ID})
	mustCreate(t, owner, &models.User{Email: "own-b@x.test", Role: models.RoleParticipant, OrganizationID: &orgB.ID})

	emails := []string{"own-a@x.test", "own-b@x.test"}

	// Owner bypasses RLS → sees both users (this is how auth/login works on the
	// owner pool while the app pool is restricted).
	var ownerCount int64
	if err := owner.Model(&models.User{}).Where("email IN ?", emails).Count(&ownerCount).Error; err != nil {
		t.Fatalf("owner count: %v", err)
	}
	if ownerCount != 2 {
		t.Errorf("owner pool saw %d users, want 2 (auth needs the global view)", ownerCount)
	}

	appDSN, err := withUser(dsn, rlsTestRole, rlsTestPass)
	if err != nil {
		t.Fatalf("app dsn: %v", err)
	}
	app, err := gorm.Open(postgres.Open(appDSN), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open app role: %v", err)
	}

	// Fail-closed: no app.org_id set → zero users visible to the restricted role.
	var appCount int64
	if err := app.Model(&models.User{}).Where("email IN ?", emails).Count(&appCount).Error; err != nil {
		t.Fatalf("app count: %v", err)
	}
	if appCount != 0 {
		t.Errorf("app pool saw %d users with no app.org_id, want 0 (fail-closed org RLS)", appCount)
	}

	// Scoped: app.org_id = orgA → only org A's user.
	if err := app.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT set_config('app.org_id', ?, true)", strconv.FormatUint(uint64(orgA.ID), 10)).Error; err != nil {
			return err
		}
		var us []models.User
		if err := tx.Where("email IN ?", emails).Find(&us).Error; err != nil {
			return err
		}
		if len(us) != 1 || us[0].OrganizationID == nil || *us[0].OrganizationID != orgA.ID {
			t.Errorf("scoped app read = %d users, want exactly org A's one", len(us))
		}
		return nil
	}); err != nil {
		t.Fatalf("scoped read tx: %v", err)
	}
}

// TestRLSParentTableScoping proves the parent-scoped tables (no own tenant
// column) are isolated through their parent: consent_logs is invisible to the
// restricted role with no app.org_id, and scoped to its org's users once set.
func TestRLSParentTableScoping(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (clean Postgres) to run the RLS parent-table gate")
	}
	owner, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open owner: %v", err)
	}
	if err := RunMigrations(owner); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	provisionRLSTestRole(t, owner)

	orgA := models.Organization{Slug: "rls-par-a", DisplayName: "PA"}
	orgB := models.Organization{Slug: "rls-par-b", DisplayName: "PB"}
	mustCreate(t, owner, &orgA)
	mustCreate(t, owner, &orgB)
	userA := models.User{Email: "par-a@x.test", Role: models.RoleParticipant, OrganizationID: &orgA.ID}
	userB := models.User{Email: "par-b@x.test", Role: models.RoleParticipant, OrganizationID: &orgB.ID}
	mustCreate(t, owner, &userA)
	mustCreate(t, owner, &userB)
	mustCreate(t, owner, &models.ConsentLog{UserID: userA.ID, ConsentType: "personal_data", ConsentURL: "x", ConsentVersion: "1"})
	mustCreate(t, owner, &models.ConsentLog{UserID: userB.ID, ConsentType: "personal_data", ConsentURL: "x", ConsentVersion: "1"})

	appDSN, err := withUser(dsn, rlsTestRole, rlsTestPass)
	if err != nil {
		t.Fatalf("app dsn: %v", err)
	}
	app, err := gorm.Open(postgres.Open(appDSN), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open app role: %v", err)
	}

	ours := []uint{userA.ID, userB.ID}

	// Fail-closed: no app.org_id → no consent_logs visible.
	var c0 int64
	if err := app.Table("consent_logs").Where("user_id IN ?", ours).Count(&c0).Error; err != nil {
		t.Fatalf("app count: %v", err)
	}
	if c0 != 0 {
		t.Errorf("parent table fail-closed: saw %d consent_logs with no app.org_id, want 0", c0)
	}

	// Scoped: app.org_id = orgA → only org A's user's consent log.
	if err := app.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT set_config('app.org_id', ?, true)", strconv.FormatUint(uint64(orgA.ID), 10)).Error; err != nil {
			return err
		}
		var n int64
		if err := tx.Table("consent_logs").Where("user_id IN ?", ours).Count(&n).Error; err != nil {
			return err
		}
		if n != 1 {
			t.Errorf("parent table scoped: saw %d consent_logs for org A, want 1", n)
		}
		return nil
	}); err != nil {
		t.Fatalf("scoped read tx: %v", err)
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
