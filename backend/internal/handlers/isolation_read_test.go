package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestCrossTenantReadIsolation seeds two organizations (resolved by subdomain) and
// asserts that the conference-scoped catalog read endpoints return only the
// requesting tenant's rows — no cross-tenant leak.
func TestCrossTenantReadIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:iso_read?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.Organization{}, &models.Conference{}, &models.Section{}, &models.Room{}, &models.MapMarker{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}

	orgA := models.Organization{Slug: "alpha", DisplayName: "Alpha"}
	mustCreateH(t, db, &orgA)
	orgB := models.Organization{Slug: "beta", DisplayName: "Beta"}
	mustCreateH(t, db, &orgB)
	confA := models.Conference{Title: "A", OrganizationID: &orgA.ID}
	mustCreateH(t, db, &confA)
	confB := models.Conference{Title: "B", OrganizationID: &orgB.ID}
	mustCreateH(t, db, &confB)

	mustCreateH(t, db, &models.Section{Title: "Секция A", Room: "Зал", ConferenceID: &confA.ID})
	mustCreateH(t, db, &models.Section{Title: "Секция B", Room: "Зал", ConferenceID: &confB.ID})
	mustCreateH(t, db, &models.Room{Name: "Зал A", ConferenceID: &confA.ID})
	mustCreateH(t, db, &models.Room{Name: "Зал B", ConferenceID: &confB.ID})
	mustCreateH(t, db, &models.MapMarker{Key: "a", Label: "A", Color: "primary", ConferenceID: &confA.ID})
	mustCreateH(t, db, &models.MapMarker{Key: "b", Label: "B", Color: "primary", ConferenceID: &confB.ID})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/sections", (&SectionHandler{DB: db}).ListSections)
	r.GET("/rooms", (&RoomHandler{DB: db}).ListRooms)
	r.GET("/markers", (&MapMarkerHandler{DB: db}).ListMarkers)

	assertOnlyConf := func(host, path string, wantConf uint) {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "http://"+host+path, nil)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("%s%s → %d: %s", host, path, w.Code, w.Body.String())
		}
		var items []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
			t.Fatalf("%s%s decode: %v (%s)", host, path, err, w.Body.String())
		}
		if len(items) != 1 {
			t.Fatalf("%s%s returned %d items, want exactly 1 (its own)", host, path, len(items))
		}
		cid, _ := items[0]["conference_id"].(float64)
		if uint(cid) != wantConf {
			t.Errorf("%s%s leaked conference_id=%v, want %d", host, path, items[0]["conference_id"], wantConf)
		}
	}

	for _, p := range []string{"/sections", "/rooms", "/markers"} {
		assertOnlyConf("alpha.platform.ru", p, confA.ID)
		assertOnlyConf("beta.platform.ru", p, confB.ID)
	}
}

func mustCreateH(t *testing.T, db *gorm.DB, v any) {
	t.Helper()
	if err := db.Create(v).Error; err != nil {
		t.Fatalf("create %T: %v", v, err)
	}
}
