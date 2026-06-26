package tenant

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"conferenceplatforma/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func activeOrgTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:require_active_org?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.Organization{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Reset across runs of the shared in-memory db.
	db.Exec("DELETE FROM organizations")
	return db
}

// TestRequireActiveOrg proves the console gate: an active org passes, a suspended
// org is rejected 403, and a token naming a non-existent org is rejected 403, while
// a request with no org claim is left untouched (the gate is a no-op for it).
func TestRequireActiveOrg(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := activeOrgTestDB(t)

	active := models.Organization{Slug: "active-co", DisplayName: "A", Status: models.OrganizationStatusActive}
	suspended := models.Organization{Slug: "suspended-co", DisplayName: "S", Status: models.OrganizationStatusSuspended}
	mustCreateOrg(t, db, &active)
	mustCreateOrg(t, db, &suspended)

	run := func(setClaim func(*gin.Context)) int {
		r := gin.New()
		if setClaim != nil {
			r.Use(func(c *gin.Context) { setClaim(c); c.Next() })
		}
		r.Use(RequireActiveOrg(db))
		r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
		return w.Code
	}

	if code := run(func(c *gin.Context) { c.Set("jwt_org_id", active.ID) }); code != http.StatusOK {
		t.Errorf("active org -> %d, want 200", code)
	}
	if code := run(func(c *gin.Context) { c.Set("jwt_org_id", suspended.ID) }); code != http.StatusForbidden {
		t.Errorf("suspended org -> %d, want 403", code)
	}
	if code := run(func(c *gin.Context) { c.Set("jwt_org_id", uint(99999)) }); code != http.StatusForbidden {
		t.Errorf("missing org -> %d, want 403", code)
	}
	if code := run(nil); code != http.StatusOK {
		t.Errorf("no org claim -> %d, want 200 (gate is a no-op without a claim)", code)
	}
}

func mustCreateOrg(t *testing.T, db *gorm.DB, org *models.Organization) {
	t.Helper()
	if err := db.Create(org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
}
