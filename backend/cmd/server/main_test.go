package main

import (
	"net/url"
	"os"
	"testing"

	"conferenceplatforma/internal/db"
	"conferenceplatforma/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestFreshInstallSeedStampsTenantColumns runs the real fresh-install bootstrap
// (migrations → EnsureDefaultOrg → seed → EnsureFirstRun) and asserts every
// seeded row carries its tenant column. On Postgres the NOT NULL flip migration
// is active, so an unstamped insert would fail the run — making this the guard
// that the bootstrap is NOT NULL-safe on a clean database.
func TestFreshInstallSeedStampsTenantColumns(t *testing.T) {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		runFreshInstallPostgres(t, dsn)
		return
	}
	gdb, err := gorm.Open(sqlite.Open("file:seedtest?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	runFreshInstall(t, gdb)
}

// runFreshInstallPostgres provisions a throwaway database so the assertions see a
// guaranteed-clean slate (TEST_DATABASE_URL's database is shared with the
// db-package gates and is not empty).
func runFreshInstallPostgres(t *testing.T, dsn string) {
	admin, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open admin: %v", err)
	}
	const scratch = "freshinstall_scratch"
	admin.Exec("DROP DATABASE IF EXISTS " + scratch)
	if err := admin.Exec("CREATE DATABASE " + scratch).Error; err != nil {
		t.Fatalf("create scratch db: %v", err)
	}

	scratchDSN, err := withDBName(dsn, scratch)
	if err != nil {
		t.Fatalf("scratch dsn: %v", err)
	}
	gdb, err := gorm.Open(postgres.Open(scratchDSN), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open scratch: %v", err)
	}
	if sqlDB, err := gdb.DB(); err == nil {
		sqlDB.SetMaxOpenConns(1) // single conn so DROP DATABASE has no lingering sessions
	}
	t.Cleanup(func() {
		if sqlDB, err := gdb.DB(); err == nil {
			_ = sqlDB.Close()
		}
		admin.Exec("DROP DATABASE IF EXISTS " + scratch)
	})

	runFreshInstall(t, gdb)
}

func runFreshInstall(t *testing.T, gdb *gorm.DB) {
	t.Helper()
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	org, err := db.EnsureDefaultOrg(gdb)
	if err != nil {
		t.Fatalf("ensure default org: %v", err)
	}
	seed(gdb, org.ID)
	if err := db.EnsureFirstRun(gdb); err != nil {
		t.Fatalf("first run: %v", err)
	}

	var conf models.Conference
	if err := gdb.Order("id asc").First(&conf).Error; err != nil {
		t.Fatalf("load conference: %v", err)
	}
	if conf.OrganizationID == nil || *conf.OrganizationID != org.ID {
		t.Errorf("conference.organization_id = %v, want %d", conf.OrganizationID, org.ID)
	}

	for _, tc := range []struct {
		name  string
		model any
	}{
		{"sections", &models.Section{}},
		{"rooms", &models.Room{}},
		{"map_markers", &models.MapMarker{}},
	} {
		var total, nulls int64
		gdb.Model(tc.model).Count(&total)
		gdb.Model(tc.model).Where("conference_id IS NULL").Count(&nulls)
		if total == 0 {
			t.Errorf("%s: nothing seeded", tc.name)
		}
		if nulls != 0 {
			t.Errorf("%s: %d/%d rows have NULL conference_id, want 0 (seeder must stamp)", tc.name, nulls, total)
		}
	}
}

// withDBName returns dsn with its database name (URL path) replaced.
func withDBName(dsn, name string) (string, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return "", err
	}
	u.Path = "/" + name
	return u.String(), nil
}
