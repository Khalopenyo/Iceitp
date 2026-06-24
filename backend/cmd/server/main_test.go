package main

import (
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
// seeded row carries its tenant column. On Postgres (TEST_DATABASE_URL set) the
// NOT NULL flip migration is active, so an unstamped insert would fail the run —
// making this the guard that the bootstrap is NOT NULL-safe on a clean database.
func TestFreshInstallSeedStampsTenantColumns(t *testing.T) {
	var gdb *gorm.DB
	var err error
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		gdb, err = gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	} else {
		gdb, err = gorm.Open(sqlite.Open("file:seedtest?mode=memory&cache=shared"), &gorm.Config{})
	}
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

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

	// Conference owned by org #1.
	var conf models.Conference
	if err := gdb.Order("id asc").First(&conf).Error; err != nil {
		t.Fatalf("load conference: %v", err)
	}
	if conf.OrganizationID == nil || *conf.OrganizationID != org.ID {
		t.Errorf("conference.organization_id = %v, want %d", conf.OrganizationID, org.ID)
	}

	// Every seeded per-conference row carries conference_id.
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
