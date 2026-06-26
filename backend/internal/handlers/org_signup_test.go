package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newOrgSignupRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := &AuthHandler{DB: db, JWTSecret: "test-secret"}
	r.POST("/org/signup", h.SignupOrganizer)
	return r
}

func postSignup(t *testing.T, r *gin.Engine, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/org/signup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func validSignup() map[string]any {
	return map[string]any{
		"full_name":       "Иван Петров",
		"email":           "organizer@vuz.ru",
		"password":        "Secret123",
		"university_name": "Технический Университет",
		"slug":            "techuni",
	}
}

// TestSignupOrganizerProvisionsTenant proves the self-service front door creates a
// new Organization (free plan, active) and an owner user (role=org) bound to it.
func TestSignupOrganizerProvisionsTenant(t *testing.T) {
	db := newAuthTestDB(t)
	r := newOrgSignupRouter(db)

	w := postSignup(t, r, validSignup())
	if w.Code != http.StatusCreated {
		t.Fatalf("signup -> %d (%s), want 201", w.Code, w.Body.String())
	}

	var org models.Organization
	if err := db.Where("slug = ?", "techuni").First(&org).Error; err != nil {
		t.Fatalf("organization not created: %v", err)
	}
	if org.DisplayName != "Технический Университет" {
		t.Errorf("org display name = %q, want university name", org.DisplayName)
	}
	if org.Plan != models.OrganizationPlanFree {
		t.Errorf("org plan = %q, want free (deploy gated until paid)", org.Plan)
	}
	if org.Status != models.OrganizationStatusActive {
		t.Errorf("org status = %q, want active", org.Status)
	}

	var user models.User
	if err := db.Preload("Profile").Where("LOWER(email) = ?", "organizer@vuz.ru").First(&user).Error; err != nil {
		t.Fatalf("owner not created: %v", err)
	}
	if user.Role != models.RoleOrg {
		t.Errorf("owner role = %q, want org", user.Role)
	}
	if user.OrganizationID == nil || *user.OrganizationID != org.ID {
		t.Errorf("owner not bound to the new org (got %v, want %d)", user.OrganizationID, org.ID)
	}
	if user.Profile.FullName != "Иван Петров" {
		t.Errorf("owner full name = %q", user.Profile.FullName)
	}
}

// TestSignupOrganizerRejectsBadSlug rejects reserved, malformed, and too-short
// subdomains before touching the database.
func TestSignupOrganizerRejectsBadSlug(t *testing.T) {
	db := newAuthTestDB(t)
	r := newOrgSignupRouter(db)

	for _, slug := range []string{"api", "ab", "-bad", "bad-", "with space", "ПРИВЕТ", "123", "00"} {
		p := validSignup()
		p["slug"] = slug
		p["email"] = slug + "@vuz.ru"
		if w := postSignup(t, r, p); w.Code != http.StatusBadRequest {
			t.Errorf("slug %q -> %d, want 400", slug, w.Code)
		}
	}

	var count int64
	db.Model(&models.Organization{}).Count(&count)
	if count != 0 {
		t.Errorf("rejected signups created %d orgs, want 0", count)
	}
}

// TestSignupOrganizerRejectsBadEmail rejects a malformed owner email (it is the
// only login + recovery channel) before provisioning anything.
func TestSignupOrganizerRejectsBadEmail(t *testing.T) {
	db := newAuthTestDB(t)
	r := newOrgSignupRouter(db)

	for _, email := range []string{"not-an-email", "x@", "@vuz.ru", "a b@vuz.ru"} {
		p := validSignup()
		p["email"] = email
		if w := postSignup(t, r, p); w.Code != http.StatusBadRequest {
			t.Errorf("email %q -> %d, want 400", email, w.Code)
		}
	}

	var count int64
	db.Model(&models.Organization{}).Count(&count)
	if count != 0 {
		t.Errorf("malformed-email signups created %d orgs, want 0", count)
	}
}

// TestSignupOrganizerRejectsDuplicates blocks a taken subdomain and a taken email,
// each with a distinct 409.
func TestSignupOrganizerRejectsDuplicates(t *testing.T) {
	db := newAuthTestDB(t)
	r := newOrgSignupRouter(db)

	if w := postSignup(t, r, validSignup()); w.Code != http.StatusCreated {
		t.Fatalf("first signup -> %d, want 201", w.Code)
	}

	// Same slug, different email.
	dupSlug := validSignup()
	dupSlug["email"] = "other@vuz.ru"
	if w := postSignup(t, r, dupSlug); w.Code != http.StatusConflict {
		t.Errorf("duplicate slug -> %d, want 409", w.Code)
	}

	// Same email, different slug.
	dupEmail := validSignup()
	dupEmail["slug"] = "techuni2"
	if w := postSignup(t, r, dupEmail); w.Code != http.StatusConflict {
		t.Errorf("duplicate email -> %d, want 409", w.Code)
	}

	var orgs int64
	db.Model(&models.Organization{}).Count(&orgs)
	if orgs != 1 {
		t.Errorf("after duplicate attempts orgs = %d, want 1 (rollback on conflict)", orgs)
	}
}
