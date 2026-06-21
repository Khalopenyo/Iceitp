package db

import (
	"fmt"
	"strings"
	"testing"

	"conferenceplatforma/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	return db
}

// TestRunMigrationsEmptyDBIdempotent verifies the full migration set (including
// 202606200007) applies on a fresh empty database and is a no-op on re-run.
func TestRunMigrationsEmptyDBIdempotent(t *testing.T) {
	db := newTestDB(t)
	if err := RunMigrations(db); err != nil {
		t.Fatalf("first RunMigrations: %v", err)
	}
	if err := RunMigrations(db); err != nil {
		t.Fatalf("second RunMigrations: %v", err)
	}
	var orgs int64
	if err := db.Model(&models.Organization{}).Count(&orgs).Error; err != nil {
		t.Fatalf("count organizations: %v", err)
	}
	if orgs != 0 {
		t.Errorf("empty DB should have no organization, got %d", orgs)
	}
}

// TestAddOrganizationAndScoping verifies that legacy single-tenant rows are
// backfilled to organization #1 and that the step is idempotent.
func TestAddOrganizationAndScoping(t *testing.T) {
	db := newTestDB(t)
	if err := db.AutoMigrate(
		&models.Conference{}, &models.User{}, &models.Section{}, &models.Room{},
		&models.MapMarker{}, &models.MapRoute{}, &models.ProgramAssignment{},
		&models.ChatMessage{}, &models.Feedback{}, &models.ArticleSubmission{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}

	// Legacy rows with no tenant columns set.
	conf := models.Conference{Title: "Test Conf"}
	mustCreate(t, db, &conf)
	user := models.User{Email: "a@b.c", PasswordHash: "x", Role: models.RoleParticipant, UserType: models.UserTypeOnline}
	mustCreate(t, db, &user)
	sec := models.Section{Title: "Эконометрика"}
	mustCreate(t, db, &sec)
	fb := models.Feedback{UserID: user.ID, Rating: 5}
	mustCreate(t, db, &fb)

	if err := addOrganizationAndScoping(db); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	var org models.Organization
	if err := db.Where("slug = ?", "icetp").First(&org).Error; err != nil {
		t.Fatalf("organization #1 not created: %v", err)
	}
	if org.DisplayName != "Test Conf" {
		t.Errorf("org display_name = %q, want %q", org.DisplayName, "Test Conf")
	}

	assertOrg := func(name string, got *uint) {
		if got == nil || *got != org.ID {
			t.Errorf("%s organization_id = %v, want %d", name, got, org.ID)
		}
	}
	assertConf := func(name string, got *uint) {
		if got == nil || *got != conf.ID {
			t.Errorf("%s conference_id = %v, want %d", name, got, conf.ID)
		}
	}

	var gotConf models.Conference
	db.First(&gotConf, conf.ID)
	assertOrg("conference", gotConf.OrganizationID)
	var gotUser models.User
	db.First(&gotUser, user.ID)
	assertOrg("user", gotUser.OrganizationID)
	var gotSec models.Section
	db.First(&gotSec, sec.ID)
	assertConf("section", gotSec.ConferenceID)
	var gotFb models.Feedback
	db.First(&gotFb, fb.ID)
	assertConf("feedback", gotFb.ConferenceID)

	// Idempotent: a second run must not duplicate organization #1.
	if err := addOrganizationAndScoping(db); err != nil {
		t.Fatalf("second run: %v", err)
	}
	var orgCount int64
	db.Model(&models.Organization{}).Count(&orgCount)
	if orgCount != 1 {
		t.Errorf("organization count = %d, want 1", orgCount)
	}
}

// TestEnsureFirstRunLinksSeedData simulates a fresh install where migrations run
// on an empty DB (no backfill) and the seeder then creates rows without tenant
// columns; EnsureFirstRun (post-seed) must link them to organization #1.
func TestEnsureFirstRunLinksSeedData(t *testing.T) {
	db := newTestDB(t)
	if err := RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	conf := models.Conference{Title: "Seeded Conf"}
	mustCreate(t, db, &conf)
	sec := models.Section{Title: "Секция"}
	mustCreate(t, db, &sec)

	if err := EnsureFirstRun(db); err != nil {
		t.Fatalf("EnsureFirstRun: %v", err)
	}

	var gotConf models.Conference
	db.First(&gotConf, conf.ID)
	if gotConf.OrganizationID == nil {
		t.Errorf("conference not linked to an organization")
	}
	var gotSec models.Section
	db.First(&gotSec, sec.ID)
	if gotSec.ConferenceID == nil || *gotSec.ConferenceID != conf.ID {
		t.Errorf("section.conference_id = %v, want %d", gotSec.ConferenceID, conf.ID)
	}

	// Idempotent: a second run is a no-op and does not duplicate org #1.
	if err := EnsureFirstRun(db); err != nil {
		t.Fatalf("EnsureFirstRun second run: %v", err)
	}
	var orgs int64
	db.Model(&models.Organization{}).Count(&orgs)
	if orgs != 1 {
		t.Errorf("organization count = %d, want 1", orgs)
	}
}

func mustCreate(t *testing.T, db *gorm.DB, v any) {
	t.Helper()
	if err := db.Create(v).Error; err != nil {
		t.Fatalf("create %T: %v", v, err)
	}
}
