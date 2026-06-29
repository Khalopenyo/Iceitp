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

func TestScopeRoundTrip(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	if _, ok := FromContext(c); ok {
		t.Fatal("expected no scope on a fresh context")
	}
	if got := OrgID(c); got != DefaultOrgID {
		t.Fatalf("OrgID on empty context = %d, want DefaultOrgID %d", got, DefaultOrgID)
	}
	if got := ConfID(c); got != 0 {
		t.Fatalf("ConfID on empty context = %d, want 0", got)
	}

	SetScope(c, Scope{OrgID: 7, ConfID: 42})
	s, ok := FromContext(c)
	if !ok || s.OrgID != 7 || s.ConfID != 42 {
		t.Fatalf("FromContext = %+v, ok=%v; want {7 42}, true", s, ok)
	}
	if got := OrgID(c); got != 7 {
		t.Fatalf("OrgID = %d, want 7", got)
	}
	if got := ConfID(c); got != 42 {
		t.Fatalf("ConfID = %d, want 42", got)
	}
}

func TestMiddlewareResolvesScope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:tenant_mw?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.Conference{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	conf := models.Conference{Title: "Активная"}
	if err := db.Create(&conf).Error; err != nil {
		t.Fatalf("create conference: %v", err)
	}

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	Middleware(db, 0)(c)

	s, ok := FromContext(c)
	if !ok || s.OrgID != DefaultOrgID || s.ConfID != conf.ID {
		t.Fatalf("scope = %+v, ok=%v; want OrgID=%d ConfID=%d", s, ok, DefaultOrgID, conf.ID)
	}
}

func TestMiddlewareSubdomainResolution(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:tenant_sub?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.Organization{}, &models.Conference{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	orgA := models.Organization{Slug: "alpha", DisplayName: "Alpha"}
	mustCreate(t, db, &orgA)
	orgB := models.Organization{Slug: "beta", DisplayName: "Beta"}
	mustCreate(t, db, &orgB)
	confA := models.Conference{Title: "A", OrganizationID: &orgA.ID}
	mustCreate(t, db, &confA)
	confB := models.Conference{Title: "B", OrganizationID: &orgB.ID}
	mustCreate(t, db, &confB)

	resolve := func(host string) Scope {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "http://"+host+"/api/x", nil)
		Middleware(db, 0)(c)
		s, _ := FromContext(c)
		return s
	}

	if s := resolve("alpha.platform.ru"); s.OrgID != orgA.ID || s.ConfID != confA.ID {
		t.Errorf("alpha.* → %+v, want org=%d conf=%d", s, orgA.ID, confA.ID)
	}
	if s := resolve("beta.platform.ru"); s.OrgID != orgB.ID || s.ConfID != confB.ID {
		t.Errorf("beta.* → %+v, want org=%d conf=%d", s, orgB.ID, confB.ID)
	}
	if s := resolve("localhost"); s.OrgID != DefaultOrgID {
		t.Errorf("localhost → org %d, want DefaultOrgID %d", s.OrgID, DefaultOrgID)
	}
	if s := resolve("unknown.platform.ru"); s.OrgID != DefaultOrgID {
		t.Errorf("unknown.* → org %d, want DefaultOrgID %d", s.OrgID, DefaultOrgID)
	}
}

func mustCreate(t *testing.T, db *gorm.DB, v any) {
	t.Helper()
	if err := db.Create(v).Error; err != nil {
		t.Fatalf("create %T: %v", v, err)
	}
}
