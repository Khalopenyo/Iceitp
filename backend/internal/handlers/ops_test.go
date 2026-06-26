package handlers

import (
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newOpsRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", uint(1)); c.Next() })
	h := &OpsHandler{DB: db}
	r.GET("/ops/stats", h.Stats)
	r.GET("/ops/tenants", h.ListTenants)
	r.PUT("/ops/tenants/:id/status", h.SetTenantStatus)
	r.PUT("/ops/tenants/:id/plan", h.SetTenantPlan)
	return r
}

func seedOpsTenants(t *testing.T, db *gorm.DB) (a, b models.Organization) {
	t.Helper()
	// Occupy id=1 (DefaultOrgID, platform org) so the real tenants get ids >= 2 and
	// don't collide with the platform-org guard in SetTenantStatus.
	if err := db.Create(&models.Organization{Slug: "ops-platform", DisplayName: "Платформа", Status: models.OrganizationStatusActive, Plan: models.OrganizationPlanFree}).Error; err != nil {
		t.Fatalf("create platform org: %v", err)
	}
	a = models.Organization{Slug: "ops-a", DisplayName: "Вуз А", Status: models.OrganizationStatusActive, Plan: models.OrganizationPlanInstitut}
	b = models.Organization{Slug: "ops-b", DisplayName: "Вуз Б", Status: models.OrganizationStatusSuspended, Plan: models.OrganizationPlanFree}
	if err := db.Create(&a).Error; err != nil {
		t.Fatalf("create org a: %v", err)
	}
	if err := db.Create(&b).Error; err != nil {
		t.Fatalf("create org b: %v", err)
	}
	// org A: 1 conference + 2 participants; org B: nothing.
	if err := db.Create(&models.Conference{OrganizationID: &a.ID, Title: "Конф А"}).Error; err != nil {
		t.Fatalf("create conf: %v", err)
	}
	for i := 0; i < 2; i++ {
		email := "p" + string(rune('a'+i)) + "@ops-a.ru"
		if err := db.Create(&models.User{Email: email, PasswordHash: "x", Role: models.RoleParticipant, UserType: models.UserTypeOffline, OrganizationID: &a.ID}).Error; err != nil {
			t.Fatalf("create participant: %v", err)
		}
	}
	// a staff user in org A must NOT be counted as a participant.
	if err := db.Create(&models.User{Email: "staff@ops-a.ru", PasswordHash: "x", Role: models.RoleStaff, UserType: models.UserTypeOnline, OrganizationID: &a.ID}).Error; err != nil {
		t.Fatalf("create staff: %v", err)
	}
	return a, b
}

func TestOpsListTenants(t *testing.T) {
	db := newAuthTestDB(t)
	a, b := seedOpsTenants(t, db)
	r := newOpsRouter(db)

	w := doJSON(t, r, http.MethodGet, "/ops/tenants", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list -> %d", w.Code)
	}
	var body struct {
		Tenants []opsTenantView `json:"tenants"`
	}
	json.Unmarshal(w.Body.Bytes(), &body)
	if len(body.Tenants) != 3 {
		t.Fatalf("tenants = %d, want 3 (platform + 2)", len(body.Tenants))
	}
	byID := map[uint]opsTenantView{}
	for _, tn := range body.Tenants {
		byID[tn.ID] = tn
	}
	if byID[a.ID].Conferences != 1 || byID[a.ID].Participants != 2 {
		t.Errorf("org A aggregates = %d conf / %d part, want 1/2", byID[a.ID].Conferences, byID[a.ID].Participants)
	}
	if byID[a.ID].Plan != "institut" || byID[a.ID].Status != "active" {
		t.Errorf("org A plan/status = %s/%s", byID[a.ID].Plan, byID[a.ID].Status)
	}
	if byID[b.ID].Conferences != 0 || byID[b.ID].Participants != 0 || byID[b.ID].Status != "suspended" {
		t.Errorf("org B = %+v, want 0/0/suspended", byID[b.ID])
	}
}

func TestOpsStats(t *testing.T) {
	db := newAuthTestDB(t)
	seedOpsTenants(t, db)
	r := newOpsRouter(db)

	w := doJSON(t, r, http.MethodGet, "/ops/stats", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("stats -> %d", w.Code)
	}
	var s struct {
		Tenants struct{ Total, Active, Suspended, Archived int64 } `json:"tenants"`
		Plans   struct{ Paid, Free int64 }                        `json:"plans"`
		Conferences  int64 `json:"conferences"`
		Participants int64 `json:"participants"`
	}
	json.Unmarshal(w.Body.Bytes(), &s)
	if s.Tenants.Total != 3 || s.Tenants.Active != 2 || s.Tenants.Suspended != 1 {
		t.Errorf("tenant stats = %+v, want total3/active2/suspended1", s.Tenants)
	}
	if s.Plans.Paid != 1 || s.Plans.Free != 2 {
		t.Errorf("plan stats = %+v, want paid1/free2", s.Plans)
	}
	if s.Conferences != 1 || s.Participants != 2 {
		t.Errorf("conf/part = %d/%d, want 1/2", s.Conferences, s.Participants)
	}
}

func TestOpsSetTenantStatusAndPlan(t *testing.T) {
	db := newAuthTestDB(t)
	a, _ := seedOpsTenants(t, db)
	r := newOpsRouter(db)

	// Suspend org A.
	if w := doJSON(t, r, http.MethodPut, "/ops/tenants/"+itoa(a.ID)+"/status", map[string]any{"status": "suspended", "reason": "неоплата"}); w.Code != http.StatusOK {
		t.Fatalf("suspend -> %d", w.Code)
	}
	var org models.Organization
	db.First(&org, a.ID)
	if org.Status != models.OrganizationStatusSuspended {
		t.Errorf("status after suspend = %s, want suspended", org.Status)
	}
	// Invalid status.
	if w := doJSON(t, r, http.MethodPut, "/ops/tenants/"+itoa(a.ID)+"/status", map[string]any{"status": "frozen"}); w.Code != http.StatusBadRequest {
		t.Errorf("invalid status -> %d, want 400", w.Code)
	}
	// Missing tenant.
	if w := doJSON(t, r, http.MethodPut, "/ops/tenants/99999/status", map[string]any{"status": "active"}); w.Code != http.StatusNotFound {
		t.Errorf("missing tenant -> %d, want 404", w.Code)
	}
	// Change plan.
	if w := doJSON(t, r, http.MethodPut, "/ops/tenants/"+itoa(a.ID)+"/plan", map[string]any{"plan": "universitet"}); w.Code != http.StatusOK {
		t.Fatalf("set plan -> %d", w.Code)
	}
	db.First(&org, a.ID)
	if org.Plan != models.OrganizationPlanUniversitet {
		t.Errorf("plan after change = %s, want universitet", org.Plan)
	}
	// Invalid plan.
	if w := doJSON(t, r, http.MethodPut, "/ops/tenants/"+itoa(a.ID)+"/plan", map[string]any{"plan": "enterprise"}); w.Code != http.StatusBadRequest {
		t.Errorf("invalid plan -> %d, want 400", w.Code)
	}
	// Platform org (DefaultOrgID=1) must not be suspendable/archivable.
	if w := doJSON(t, r, http.MethodPut, "/ops/tenants/1/status", map[string]any{"status": "suspended"}); w.Code != http.StatusBadRequest {
		t.Errorf("suspend platform org -> %d, want 400 (protected)", w.Code)
	}
}
