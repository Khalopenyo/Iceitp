package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func seedOrgOwner(t *testing.T, db *gorm.DB, orgID uint, email, name string) models.User {
	t.Helper()
	oid := orgID
	owner := models.User{
		Email:          email,
		PasswordHash:   "x",
		Role:           models.RoleOrg,
		UserType:       models.UserTypeOnline,
		OrganizationID: &oid,
		Profile:        models.Profile{FullName: name},
	}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	return owner
}

// newTeamRouter wires the team routes under a stub that pins the tenant scope to
// orgID (standing in for IdentityScope), so the handlers run org-scoped.
func newTeamRouter(db *gorm.DB, orgID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		tenant.SetScope(c, tenant.Scope{OrgID: orgID})
		c.Next()
	})
	h := &TeamHandler{DB: db, AppBaseURL: "http://localhost:5173"}
	r.GET("/admin/team", h.List)
	r.POST("/admin/team", h.Invite)
	r.PUT("/admin/team/:id", h.UpdateRole)
	r.DELETE("/admin/team/:id", h.Remove)
	return r
}

func doJSON(t *testing.T, r *gin.Engine, method, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	var body []byte
	if payload != nil {
		body, _ = json.Marshal(payload)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// TestTeamInviteAndList proves an invite creates a staff user + membership bound to
// the org and returns an invite link, and the roster lists the owner first.
func TestTeamInviteAndList(t *testing.T) {
	db := newAuthTestDB(t)
	seedOrgOwner(t, db, 1, "owner@vuz.ru", "Владелец Орг")
	r := newTeamRouter(db, 1)

	w := doJSON(t, r, http.MethodPost, "/admin/team", map[string]any{
		"email": "moderator@vuz.ru", "name": "Тимур Х", "role": "moderator",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("invite -> %d (%s), want 201", w.Code, w.Body.String())
	}
	var inv struct {
		InviteURL string `json:"invite_url"`
		Member    struct {
			Role string `json:"role"`
		} `json:"member"`
	}
	json.Unmarshal(w.Body.Bytes(), &inv)
	if inv.Member.Role != "moderator" {
		t.Errorf("member role = %q, want moderator", inv.Member.Role)
	}
	if inv.InviteURL == "" || !bytes.Contains([]byte(inv.InviteURL), []byte("/reset-password?token=")) {
		t.Errorf("invite_url = %q, want a reset-password link", inv.InviteURL)
	}

	var staff models.User
	if err := db.Where("LOWER(email) = ?", "moderator@vuz.ru").First(&staff).Error; err != nil {
		t.Fatalf("staff user not created: %v", err)
	}
	if staff.Role != models.RoleStaff {
		t.Errorf("staff role = %q, want staff", staff.Role)
	}
	if staff.OrganizationID == nil || *staff.OrganizationID != 1 {
		t.Errorf("staff not bound to org 1 (got %v)", staff.OrganizationID)
	}
	var mcount int64
	db.Model(&models.Membership{}).Where("organization_id = ? AND user_id = ?", 1, staff.ID).Count(&mcount)
	if mcount != 1 {
		t.Errorf("membership count = %d, want 1", mcount)
	}

	// List: owner first (owner=true), then the invited moderator.
	lw := doJSON(t, r, http.MethodGet, "/admin/team", nil)
	if lw.Code != http.StatusOK {
		t.Fatalf("list -> %d", lw.Code)
	}
	var list struct {
		Members []teamMemberView `json:"members"`
	}
	json.Unmarshal(lw.Body.Bytes(), &list)
	if len(list.Members) != 2 {
		t.Fatalf("roster = %d members, want 2 (owner + moderator)", len(list.Members))
	}
	if !list.Members[0].Owner || list.Members[0].Email != "owner@vuz.ru" {
		t.Errorf("first row should be the owner, got %+v", list.Members[0])
	}
	if list.Members[1].Owner || list.Members[1].Role != "moderator" {
		t.Errorf("second row should be the moderator, got %+v", list.Members[1])
	}
}

// TestTeamInviteValidation rejects a duplicate email (409), a bad role (400), and a
// malformed email (400) without provisioning a user.
func TestTeamInviteValidation(t *testing.T) {
	db := newAuthTestDB(t)
	seedOrgOwner(t, db, 1, "owner2@vuz.ru", "O")
	r := newTeamRouter(db, 1)

	// Duplicate of the owner's email.
	if w := doJSON(t, r, http.MethodPost, "/admin/team", map[string]any{
		"email": "owner2@vuz.ru", "name": "X", "role": "editor"}); w.Code != http.StatusConflict {
		t.Errorf("duplicate email -> %d, want 409", w.Code)
	}
	// Unknown role.
	if w := doJSON(t, r, http.MethodPost, "/admin/team", map[string]any{
		"email": "new@vuz.ru", "name": "X", "role": "superadmin"}); w.Code != http.StatusBadRequest {
		t.Errorf("bad role -> %d, want 400", w.Code)
	}
	// Malformed email.
	if w := doJSON(t, r, http.MethodPost, "/admin/team", map[string]any{
		"email": "nope", "name": "X", "role": "editor"}); w.Code != http.StatusBadRequest {
		t.Errorf("bad email -> %d, want 400", w.Code)
	}

	var staffCount int64
	db.Model(&models.User{}).Where("role = ?", models.RoleStaff).Count(&staffCount)
	if staffCount != 0 {
		t.Errorf("rejected invites created %d staff users, want 0", staffCount)
	}
}

// TestTeamUpdateAndRemove changes a member's role then removes them (membership +
// staff user gone).
func TestTeamUpdateAndRemove(t *testing.T) {
	db := newAuthTestDB(t)
	seedOrgOwner(t, db, 1, "owner3@vuz.ru", "O")
	r := newTeamRouter(db, 1)

	doJSON(t, r, http.MethodPost, "/admin/team", map[string]any{
		"email": "booth@vuz.ru", "name": "Стенд", "role": "booth"})
	var m models.Membership
	db.Where("organization_id = ?", 1).First(&m)

	if w := doJSON(t, r, http.MethodPut, "/admin/team/"+itoa(m.ID), map[string]any{"role": "editor"}); w.Code != http.StatusOK {
		t.Fatalf("update role -> %d", w.Code)
	}
	var updated models.Membership
	db.First(&updated, m.ID)
	if updated.Role != models.MembershipRoleEditor {
		t.Errorf("role after update = %q, want editor", updated.Role)
	}

	if w := doJSON(t, r, http.MethodDelete, "/admin/team/"+itoa(m.ID), nil); w.Code != http.StatusOK {
		t.Fatalf("remove -> %d", w.Code)
	}
	var left int64
	db.Model(&models.Membership{}).Count(&left)
	if left != 0 {
		t.Errorf("memberships after remove = %d, want 0", left)
	}
	var staffLeft int64
	db.Model(&models.User{}).Where("role = ?", models.RoleStaff).Count(&staffLeft)
	if staffLeft != 0 {
		t.Errorf("staff users after remove = %d, want 0 (account removed with membership)", staffLeft)
	}
}

// TestTeamCrossTenantIsolation proves an owner pinned to org 1 cannot read, change,
// or remove org 2's team — the membership id resolves to 0 rows under org 1.
func TestTeamCrossTenantIsolation(t *testing.T) {
	db := newAuthTestDB(t)
	seedOrgOwner(t, db, 1, "o1@vuz.ru", "Org1")
	seedOrgOwner(t, db, 2, "o2@vuz.ru", "Org2")

	// Org 2 invites a staff member (router pinned to org 2).
	r2 := newTeamRouter(db, 2)
	if w := doJSON(t, r2, http.MethodPost, "/admin/team", map[string]any{
		"email": "staff2@vuz.ru", "name": "S2", "role": "editor"}); w.Code != http.StatusCreated {
		t.Fatalf("org2 invite -> %d", w.Code)
	}
	var m2 models.Membership
	if err := db.Where("organization_id = ?", 2).First(&m2).Error; err != nil {
		t.Fatalf("org2 membership missing: %v", err)
	}

	// Org 1's console must NOT see, update, or delete org 2's membership.
	r1 := newTeamRouter(db, 1)
	var list1 struct {
		Members []teamMemberView `json:"members"`
	}
	lw := doJSON(t, r1, http.MethodGet, "/admin/team", nil)
	json.Unmarshal(lw.Body.Bytes(), &list1)
	for _, mm := range list1.Members {
		if mm.Email == "staff2@vuz.ru" {
			t.Errorf("org1 roster leaked org2 staff: %+v", mm)
		}
	}
	if w := doJSON(t, r1, http.MethodPut, "/admin/team/"+itoa(m2.ID), map[string]any{"role": "booth"}); w.Code != http.StatusNotFound {
		t.Errorf("org1 PUT on org2 membership -> %d, want 404", w.Code)
	}
	if w := doJSON(t, r1, http.MethodDelete, "/admin/team/"+itoa(m2.ID), nil); w.Code != http.StatusNotFound {
		t.Errorf("org1 DELETE on org2 membership -> %d, want 404", w.Code)
	}

	// Org 2's membership + staff user survive untouched.
	var still models.Membership
	if err := db.First(&still, m2.ID).Error; err != nil {
		t.Errorf("org2 membership was deleted cross-tenant: %v", err)
	}
	if still.Role != models.MembershipRoleEditor {
		t.Errorf("org2 membership role changed cross-tenant to %q", still.Role)
	}
}

func itoa(u uint) string {
	return strconv.FormatUint(uint64(u), 10)
}
