package handlers

import (
	"bytes"
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

// twoTenants holds the seeded fixtures for a two-organization isolation test:
// each org has its own conference, participant user, section, question and
// feedback, resolved by subdomain (alpha.* / beta.*).
type twoTenants struct {
	orgA, orgB         models.Organization
	confA, confB       models.Conference
	userA, userB       models.User
	sectionA, sectionB models.Section
	questionA          models.Question
	feedbackA          models.Feedback
}

func setupTwoTenants(t *testing.T, dbName string) (*gorm.DB, twoTenants) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+dbName+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Organization{}, &models.Conference{}, &models.User{}, &models.Profile{},
		&models.Section{}, &models.Room{}, &models.Question{}, &models.Feedback{},
		&models.ProgramAssignment{}, &models.ChatMessage{}, &models.ConsentLog{},
		&models.MapMarker{}, &models.MapRoute{}, &models.ContentBlock{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}

	var f twoTenants
	f.orgA = models.Organization{Slug: "alpha", DisplayName: "Alpha"}
	f.orgB = models.Organization{Slug: "beta", DisplayName: "Beta"}
	mustCreateH(t, db, &f.orgA)
	mustCreateH(t, db, &f.orgB)

	f.confA = models.Conference{Title: "Conf A", OrganizationID: &f.orgA.ID}
	f.confB = models.Conference{Title: "Conf B", OrganizationID: &f.orgB.ID}
	mustCreateH(t, db, &f.confA)
	mustCreateH(t, db, &f.confB)

	f.userA = models.User{Email: "a@alpha.test", Role: models.RoleParticipant, OrganizationID: &f.orgA.ID,
		Profile: models.Profile{FullName: "Alpha User"}}
	f.userB = models.User{Email: "b@beta.test", Role: models.RoleParticipant, OrganizationID: &f.orgB.ID,
		Profile: models.Profile{FullName: "Beta User"}}
	mustCreateH(t, db, &f.userA)
	mustCreateH(t, db, &f.userB)

	f.sectionA = models.Section{Title: "Sec A", Room: "Room", ConferenceID: &f.confA.ID}
	f.sectionB = models.Section{Title: "Sec B", Room: "Room", ConferenceID: &f.confB.ID}
	mustCreateH(t, db, &f.sectionA)
	mustCreateH(t, db, &f.sectionB)

	f.questionA = models.Question{ConferenceID: f.confA.ID, Text: "Q A", AuthorName: "anon", Status: models.QuestionStatusPending}
	mustCreateH(t, db, &f.questionA)
	mustCreateH(t, db, &models.Question{ConferenceID: f.confB.ID, Text: "Q B", AuthorName: "anon", Status: models.QuestionStatusPending})

	f.feedbackA = models.Feedback{UserID: f.userA.ID, Rating: 5, Comment: "great A", ConferenceID: &f.confA.ID}
	mustCreateH(t, db, &f.feedbackA)
	mustCreateH(t, db, &models.Feedback{UserID: f.userB.ID, Rating: 4, Comment: "great B", ConferenceID: &f.confB.ID})

	mustCreateH(t, db, &models.ProgramAssignment{UserID: f.userA.ID, UserType: models.UserTypeOffline, TalkTitle: "Talk A", ConferenceID: &f.confA.ID})
	mustCreateH(t, db, &models.ProgramAssignment{UserID: f.userB.ID, UserType: models.UserTypeOffline, TalkTitle: "Talk B", ConferenceID: &f.confB.ID})

	return db, f
}

func tenantReq(t *testing.T, r *gin.Engine, method, host, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		rdr = bytes.NewReader(raw)
	} else {
		rdr = bytes.NewReader(nil)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, "http://"+host+path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	r.ServeHTTP(w, req)
	return w
}

// TestCrossTenantListIsolation proves the org/conference-scoped list endpoints
// return only the requesting tenant's rows after the Phase 2.4 scoping.
func TestCrossTenantListIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_list")

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/users", (&UserHandler{DB: db}).ListUsers)
	r.GET("/questions", (&QuestionHandler{DB: db}).ListQuestions)
	r.GET("/feedback", (&FeedbackHandler{DB: db}).ListFeedback)
	r.GET("/program", (&ProgramHandler{DB: db}).ListProgram)
	r.GET("/conference", (&ConferenceHandler{DB: db}).GetConference)

	// ListUsers: each tenant sees exactly its own user, with its own org id.
	for _, tc := range []struct {
		host    string
		wantOrg uint
		email   string
	}{
		{"alpha.platform.ru", f.orgA.ID, "a@alpha.test"},
		{"beta.platform.ru", f.orgB.ID, "b@beta.test"},
	} {
		w := tenantReq(t, r, http.MethodGet, tc.host, "/users", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s /users -> %d: %s", tc.host, w.Code, w.Body.String())
		}
		var resp struct {
			Items []models.User `json:"items"`
			Total int64         `json:"total"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode users: %v (%s)", err, w.Body.String())
		}
		if resp.Total != 1 || len(resp.Items) != 1 {
			t.Fatalf("%s /users returned total=%d items=%d, want exactly 1", tc.host, resp.Total, len(resp.Items))
		}
		if resp.Items[0].Email != tc.email {
			t.Errorf("%s /users leaked %s, want %s", tc.host, resp.Items[0].Email, tc.email)
		}
		if resp.Items[0].OrganizationID == nil || *resp.Items[0].OrganizationID != tc.wantOrg {
			t.Errorf("%s /users leaked org %v, want %d", tc.host, resp.Items[0].OrganizationID, tc.wantOrg)
		}
	}

	// ListQuestions / ListFeedback: each tenant sees exactly its single row.
	for _, path := range []string{"/questions", "/feedback"} {
		for _, host := range []string{"alpha.platform.ru", "beta.platform.ru"} {
			w := tenantReq(t, r, http.MethodGet, host, path, nil)
			if w.Code != http.StatusOK {
				t.Fatalf("%s %s -> %d: %s", host, path, w.Code, w.Body.String())
			}
			var resp struct {
				Total int64 `json:"total"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("decode %s: %v (%s)", path, err, w.Body.String())
			}
			if resp.Total != 1 {
				t.Errorf("%s %s returned total=%d, want 1 (own only)", host, path, resp.Total)
			}
		}
	}

	// ListProgram: array of entries, one per own participant.
	for _, tc := range []struct {
		host  string
		email string
	}{
		{"alpha.platform.ru", "a@alpha.test"},
		{"beta.platform.ru", "b@beta.test"},
	} {
		w := tenantReq(t, r, http.MethodGet, tc.host, "/program", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s /program -> %d: %s", tc.host, w.Code, w.Body.String())
		}
		var entries []programEntry
		if err := json.Unmarshal(w.Body.Bytes(), &entries); err != nil {
			t.Fatalf("decode program: %v (%s)", err, w.Body.String())
		}
		if len(entries) != 1 {
			t.Fatalf("%s /program returned %d entries, want 1", tc.host, len(entries))
		}
		if entries[0].Email != tc.email {
			t.Errorf("%s /program leaked %s, want %s", tc.host, entries[0].Email, tc.email)
		}
	}

	// GetConference: each tenant gets its own conference, not the global first.
	for _, tc := range []struct {
		host  string
		title string
		org   uint
	}{
		{"alpha.platform.ru", "Conf A", f.orgA.ID},
		{"beta.platform.ru", "Conf B", f.orgB.ID},
	} {
		w := tenantReq(t, r, http.MethodGet, tc.host, "/conference", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s /conference -> %d: %s", tc.host, w.Code, w.Body.String())
		}
		var conf models.Conference
		if err := json.Unmarshal(w.Body.Bytes(), &conf); err != nil {
			t.Fatalf("decode conference: %v (%s)", err, w.Body.String())
		}
		if conf.Title != tc.title || conf.OrganizationID == nil || *conf.OrganizationID != tc.org {
			t.Errorf("%s /conference leaked %q org %v, want %q org %d", tc.host, conf.Title, conf.OrganizationID, tc.title, tc.org)
		}
	}
}

// TestCrossTenantByIDMutationIsolation proves by-id admin mutations cannot reach
// another tenant's rows: tenant B targeting tenant A's id gets 404 and the row
// is left untouched.
func TestCrossTenantByIDMutationIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_mut")

	uh := &UserHandler{DB: db}
	sh := &SectionHandler{DB: db}
	qh := &QuestionHandler{DB: db}

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.PUT("/users/:id/role", uh.UpdateUserRole)
	r.DELETE("/users/:id", uh.DeleteUser)
	r.PUT("/sections/:id", sh.UpdateSection)
	r.DELETE("/admin/questions/:id", qh.DeleteQuestion)

	idA := func(id uint) string { return "/users/" + uintToStr(id) }

	// beta admin cannot change alpha user's role.
	w := tenantReq(t, r, http.MethodPut, "beta.platform.ru", idA(f.userA.ID)+"/role", map[string]string{"role": "admin"})
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-tenant UpdateUserRole -> %d, want 404 (%s)", w.Code, w.Body.String())
	}
	var checkUser models.User
	if err := db.First(&checkUser, f.userA.ID).Error; err != nil {
		t.Fatalf("reload userA: %v", err)
	}
	if checkUser.Role != models.RoleParticipant {
		t.Errorf("cross-tenant UpdateUserRole mutated role to %q", checkUser.Role)
	}

	// beta admin cannot delete alpha user.
	w = tenantReq(t, r, http.MethodDelete, "beta.platform.ru", idA(f.userA.ID), nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-tenant DeleteUser -> %d, want 404 (%s)", w.Code, w.Body.String())
	}
	if err := db.First(&models.User{}, f.userA.ID).Error; err != nil {
		t.Errorf("cross-tenant DeleteUser removed userA: %v", err)
	}

	// beta admin cannot update alpha section.
	w = tenantReq(t, r, http.MethodPut, "beta.platform.ru", "/sections/"+uintToStr(f.sectionA.ID),
		map[string]string{"title": "HACKED", "room": "x"})
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-tenant UpdateSection -> %d, want 404 (%s)", w.Code, w.Body.String())
	}
	var checkSection models.Section
	if err := db.First(&checkSection, f.sectionA.ID).Error; err != nil {
		t.Fatalf("reload sectionA: %v", err)
	}
	if checkSection.Title != "Sec A" {
		t.Errorf("cross-tenant UpdateSection mutated title to %q", checkSection.Title)
	}

	// beta admin cannot delete alpha question.
	w = tenantReq(t, r, http.MethodDelete, "beta.platform.ru", "/admin/questions/"+uintToStr(f.questionA.ID), nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-tenant DeleteQuestion -> %d, want 404 (%s)", w.Code, w.Body.String())
	}
	if err := db.First(&models.Question{}, f.questionA.ID).Error; err != nil {
		t.Errorf("cross-tenant DeleteQuestion removed questionA: %v", err)
	}

	// Sanity: the owning tenant CAN mutate its own row (404 is isolation, not a
	// blanket break).
	w = tenantReq(t, r, http.MethodPut, "alpha.platform.ru", idA(f.userA.ID)+"/role", map[string]string{"role": "admin"})
	if w.Code != http.StatusOK {
		t.Errorf("same-tenant UpdateUserRole -> %d, want 200 (%s)", w.Code, w.Body.String())
	}
}

// TestCrossTenantReplaceMarkersIsolation proves a bulk marker replace by one
// tenant does not wipe another tenant's markers (the global DELETE bug).
func TestCrossTenantReplaceMarkersIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_markers")
	mustCreateH(t, db, &models.MapMarker{Key: "a", Label: "A", Color: "primary", ConferenceID: &f.confA.ID})
	mustCreateH(t, db, &models.MapMarker{Key: "b", Label: "B", Color: "primary", ConferenceID: &f.confB.ID})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.PUT("/markers", (&MapMarkerHandler{DB: db}).ReplaceMarkers)

	// beta replaces its own markers.
	w := tenantReq(t, r, http.MethodPut, "beta.platform.ru", "/markers",
		[]map[string]any{{"key": "b2", "label": "B2", "color": "#4f46e5"}})
	if w.Code != http.StatusOK {
		t.Fatalf("beta ReplaceMarkers -> %d: %s", w.Code, w.Body.String())
	}

	// alpha's marker must survive; beta now has exactly its new one.
	var alphaCount, betaCount int64
	db.Model(&models.MapMarker{}).Where("conference_id = ?", f.confA.ID).Count(&alphaCount)
	db.Model(&models.MapMarker{}).Where("conference_id = ?", f.confB.ID).Count(&betaCount)
	if alphaCount != 1 {
		t.Errorf("alpha markers wiped by beta replace: count=%d, want 1", alphaCount)
	}
	if betaCount != 1 {
		t.Errorf("beta markers count=%d, want 1 after replace", betaCount)
	}
}

// TestConferenceLessOrgReadsFailClosed proves a resolved organization that has no
// active conference yet (a normal onboarding state) sees ZERO conference-scoped
// rows — not every tenant's rows. Guards the ByConference fail-closed behaviour.
func TestConferenceLessOrgReadsFailClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := setupTwoTenants(t, "iso_confless")
	// A real organization with no conference (resolves to a scope with ConfID==0).
	mustCreateH(t, db, &models.Organization{Slug: "gamma", DisplayName: "Gamma"})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/sections", (&SectionHandler{DB: db}).ListSections)

	w := tenantReq(t, r, http.MethodGet, "gamma.platform.ru", "/sections", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("gamma /sections -> %d: %s", w.Code, w.Body.String())
	}
	var items []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode: %v (%s)", err, w.Body.String())
	}
	if len(items) != 0 {
		t.Errorf("conference-less org saw %d sections, want 0 (fail-closed) — other tenants' data leaked", len(items))
	}
}

// TestGetConferenceNoSideEffectOnFreshOrg proves the read-only GET /conference is
// side-effect free: a freshly provisioned org with no conference gets a 404 and NO
// stub row is created (the bug was that the anonymous read auto-created one).
func TestGetConferenceNoSideEffectOnFreshOrg(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := setupTwoTenants(t, "iso_conf_noside")
	// A real organization with no conference yet (a normal pre-onboarding state).
	mustCreateH(t, db, &models.Organization{Slug: "gamma", DisplayName: "Gamma"})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/conference", (&ConferenceHandler{DB: db}).GetConference)

	var before int64
	db.Model(&models.Conference{}).Count(&before)

	w := tenantReq(t, r, http.MethodGet, "gamma.platform.ru", "/conference", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("fresh-org GET /conference -> %d, want 404 (%s)", w.Code, w.Body.String())
	}

	var after int64
	db.Model(&models.Conference{}).Count(&after)
	if after != before {
		t.Errorf("GET /conference created a row: count %d -> %d (read endpoint must not mutate)", before, after)
	}
}

// TestConferenceLessOrgReplaceMarkers409 proves a conference-less org gets a 409
// from ReplaceMarkers instead of triggering the legacy global delete that would
// wipe other tenants' markers.
func TestConferenceLessOrgReplaceMarkers409(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_markers_confless")
	mustCreateH(t, db, &models.MapMarker{Key: "a", Label: "A", Color: "primary", ConferenceID: &f.confA.ID})
	mustCreateH(t, db, &models.Organization{Slug: "gamma", DisplayName: "Gamma"})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.PUT("/markers", (&MapMarkerHandler{DB: db}).ReplaceMarkers)

	w := tenantReq(t, r, http.MethodPut, "gamma.platform.ru", "/markers",
		[]map[string]any{{"key": "x", "label": "X", "color": "#4f46e5"}})
	if w.Code != http.StatusConflict {
		t.Fatalf("conf-less ReplaceMarkers -> %d, want 409 (%s)", w.Code, w.Body.String())
	}
	var count int64
	db.Model(&models.MapMarker{}).Count(&count)
	if count != 1 {
		t.Errorf("conf-less ReplaceMarkers touched markers: total=%d, want 1 (alpha's untouched)", count)
	}
}

// TestCrossTenantAdminBadgePDFIsolation proves AdminBadgePDF cannot mint a badge
// for another tenant's user: a cross-tenant id is rejected with 404 at the
// org-scoped user load, before any token/PDF is generated.
func TestCrossTenantAdminBadgePDFIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_badge")

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/admin/users/:id/badge", (&DocumentHandler{DB: db, JWTSecret: "test-secret"}).AdminBadgePDF)

	w := tenantReq(t, r, http.MethodGet, "beta.platform.ru", "/admin/users/"+uintToStr(f.userA.ID)+"/badge", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-tenant AdminBadgePDF -> %d, want 404 (org B must not badge org A's user) (%s)", w.Code, w.Body.String())
	}
}

// TestCrossTenantProfileSectionScoping proves a participant cannot attach their
// profile to another conference's section (the section existence check is
// conference-scoped, holding even with RLS off).
func TestCrossTenantProfileSectionScoping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_profile")

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.Use(func(c *gin.Context) { c.Set("user_id", f.userB.ID); c.Next() }) // authenticated as org B's user
	r.PUT("/me/profile", (&UserHandler{DB: db}).UpdateProfile)

	w := tenantReq(t, r, http.MethodPut, "beta.platform.ru", "/me/profile",
		map[string]any{"full_name": "B", "section_id": f.sectionA.ID})
	if w.Code != http.StatusBadRequest {
		t.Errorf("cross-conference section attach -> %d, want 400 (org B user must not pick org A's section) (%s)", w.Code, w.Body.String())
	}
}

// TestCrossTenantRegistrationSectionScoping proves a registrant resolved to one
// tenant cannot bind their profile to another tenant's section: the section
// existence check is conference-scoped and rejects a cross-conference section_id
// before the (intentionally global) email/phone uniqueness checks.
func TestCrossTenantRegistrationSectionScoping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_reg")
	h := &AuthHandler{DB: db}

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	tenant.SetScope(c, tenant.Scope{OrgID: f.orgB.ID, ConfID: f.confB.ID}) // resolved to org B

	req := RegisterRequest{
		Email: "newreg@beta.test", Password: "Str0ngPass!", FullName: "X", TalkTitle: "T",
		ConsentVersion: "1", ConsentPersonalData: true, ConsentPublication: true,
		Phone: "+79001234567", UserType: models.UserTypeOnline,
		SectionID: &f.sectionA.ID, // org A's section
	}
	if _, _, err := h.validateRegistrationRequest(c, req); err == nil || err.Error() != "selected section not found" {
		t.Errorf("cross-tenant section at registration -> err=%v, want 'selected section not found'", err)
	}
}

// TestConferenceLessOrgSeedDemo409 proves SeedDemo rejects a conference-less org
// with 409 instead of attempting doomed NULL-conference_id inserts.
func TestConferenceLessOrgSeedDemo409(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := setupTwoTenants(t, "iso_seeddemo")
	mustCreateH(t, db, &models.Organization{Slug: "gamma", DisplayName: "Gamma"})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.POST("/seed-demo", (&ScheduleHandler{DB: db}).SeedDemo)

	w := tenantReq(t, r, http.MethodPost, "gamma.platform.ru", "/seed-demo", nil)
	if w.Code != http.StatusConflict {
		t.Errorf("conf-less SeedDemo -> %d, want 409 (%s)", w.Code, w.Body.String())
	}
}

// TestOrgBrandingPerTenant proves the per-tenant branding API returns each
// tenant's own branding (resolved from the subdomain, not user input) and that an
// admin update touches only the resolved org.
func TestOrgBrandingPerTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_org")
	db.Model(&models.Organization{}).Where("id = ?", f.orgA.ID).Update("primary_color", "#1E4E99")
	db.Model(&models.Organization{}).Where("id = ?", f.orgB.ID).Update("primary_color", "#990000")

	oh := &OrganizationHandler{DB: db}
	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/org", oh.GetOrg)
	r.PUT("/org", oh.UpdateOrg)

	for _, tc := range []struct{ host, name, color string }{
		{"alpha.platform.ru", "Alpha", "#1E4E99"},
		{"beta.platform.ru", "Beta", "#990000"},
	} {
		w := tenantReq(t, r, http.MethodGet, tc.host, "/org", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s /org -> %d: %s", tc.host, w.Code, w.Body.String())
		}
		var b orgBranding
		if err := json.Unmarshal(w.Body.Bytes(), &b); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if b.DisplayName != tc.name || b.PrimaryColor != tc.color {
			t.Errorf("%s /org = %q %q, want %q %q", tc.host, b.DisplayName, b.PrimaryColor, tc.name, tc.color)
		}
	}

	// alpha admin updates only alpha's branding.
	w := tenantReq(t, r, http.MethodPut, "alpha.platform.ru", "/org", map[string]any{"primary_color": "#0A0A0A"})
	if w.Code != http.StatusOK {
		t.Fatalf("alpha update -> %d: %s", w.Code, w.Body.String())
	}
	var betaOrg models.Organization
	db.First(&betaOrg, f.orgB.ID)
	if betaOrg.PrimaryColor != "#990000" {
		t.Errorf("alpha update leaked into beta: %q", betaOrg.PrimaryColor)
	}

	// invalid color rejected.
	w = tenantReq(t, r, http.MethodPut, "alpha.platform.ru", "/org", map[string]any{"primary_color": "red"})
	if w.Code != http.StatusBadRequest {
		t.Errorf("invalid primary_color -> %d, want 400", w.Code)
	}
}

// TestContentBlocksPerTenant proves the CMS content blocks are conference-scoped:
// the public list returns only the tenant's visible blocks, creates stamp the
// resolved conference, invalid kinds are rejected, and a cross-tenant by-id edit
// is 404.
func TestContentBlocksPerTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, f := setupTwoTenants(t, "iso_content")
	mustCreateH(t, db, &models.ContentBlock{Kind: "about", Title: "A about", Visible: true, ConferenceID: &f.confA.ID})
	mustCreateH(t, db, &models.ContentBlock{Kind: "about", Title: "B about", Visible: true, ConferenceID: &f.confB.ID})
	hidden := models.ContentBlock{Kind: "custom", Title: "hidden", Visible: false, ConferenceID: &f.confA.ID}
	mustCreateH(t, db, &hidden)

	ch := &ContentHandler{DB: db}
	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.GET("/content", ch.ListPublic)
	r.POST("/content", ch.Create)
	r.PUT("/content/:id", ch.Update)

	// Public list: alpha sees only its own visible block.
	w := tenantReq(t, r, http.MethodGet, "alpha.platform.ru", "/content", nil)
	var blocks []models.ContentBlock
	if err := json.Unmarshal(w.Body.Bytes(), &blocks); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(blocks) != 1 || blocks[0].Title != "A about" {
		t.Errorf("alpha /content = %d blocks, want 1 (A about); got %+v", len(blocks), blocks)
	}

	// Create on beta succeeds; invalid kind rejected.
	if w := tenantReq(t, r, http.MethodPost, "beta.platform.ru", "/content",
		map[string]any{"kind": "hero", "title": "B hero", "visible": true}); w.Code != http.StatusCreated {
		t.Fatalf("create -> %d: %s", w.Code, w.Body.String())
	}
	if w := tenantReq(t, r, http.MethodPost, "beta.platform.ru", "/content",
		map[string]any{"kind": "bogus", "title": "x"}); w.Code != http.StatusBadRequest {
		t.Errorf("invalid kind -> %d, want 400", w.Code)
	}

	// Cross-tenant by-id edit: beta editing alpha's block → 404.
	if w := tenantReq(t, r, http.MethodPut, "beta.platform.ru", "/content/"+uintToStr(hidden.ID),
		map[string]any{"kind": "custom", "title": "hax", "visible": true}); w.Code != http.StatusNotFound {
		t.Errorf("cross-tenant content update -> %d, want 404 (%s)", w.Code, w.Body.String())
	}
}

// TestConferenceLessOrgContentCreate409 proves Create rejects a conference-less
// org with 409 instead of producing an orphan NULL-conference block.
func TestConferenceLessOrgContentCreate409(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := setupTwoTenants(t, "iso_content_confless")
	mustCreateH(t, db, &models.Organization{Slug: "gamma", DisplayName: "Gamma"})

	ch := &ContentHandler{DB: db}
	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.POST("/content", ch.Create)

	w := tenantReq(t, r, http.MethodPost, "gamma.platform.ru", "/content", map[string]any{"kind": "about", "title": "x"})
	if w.Code != http.StatusConflict {
		t.Errorf("conf-less content create -> %d, want 409 (%s)", w.Code, w.Body.String())
	}
}

func uintToStr(v uint) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}
