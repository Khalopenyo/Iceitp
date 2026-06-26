package handlers

import (
	"conferenceplatforma/internal/auth"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// TestUpdateUserRoleRejectsOperator is the regression gate for the privilege-
// escalation hole: a tenant admin/owner must NOT be able to assign the cross-tenant
// platform-operator role (or any role outside the assignable set) via the console.
func TestUpdateUserRoleRejectsOperator(t *testing.T) {
	db := newAuthTestDB(t)
	one := uint(1)
	target := models.User{Email: "member@vuz.ru", PasswordHash: "x", Role: models.RoleParticipant, UserType: models.UserTypeOffline, OrganizationID: &one}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { tenant.SetScope(c, tenant.Scope{OrgID: 1}); c.Next() })
	h := &UserHandler{DB: db}
	r.PUT("/admin/users/:id/role", h.UpdateUserRole)

	// operator must be rejected.
	if w := doJSON(t, r, http.MethodPut, "/admin/users/"+itoa(target.ID)+"/role", map[string]any{"role": "operator"}); w.Code != http.StatusBadRequest {
		t.Errorf("assign operator -> %d, want 400 (privilege escalation blocked)", w.Code)
	}
	// org also excluded.
	if w := doJSON(t, r, http.MethodPut, "/admin/users/"+itoa(target.ID)+"/role", map[string]any{"role": "org"}); w.Code != http.StatusBadRequest {
		t.Errorf("assign org -> %d, want 400", w.Code)
	}
	// admin (a legitimate tenant-scoped role) is allowed.
	if w := doJSON(t, r, http.MethodPut, "/admin/users/"+itoa(target.ID)+"/role", map[string]any{"role": "admin"}); w.Code != http.StatusOK {
		t.Errorf("assign admin -> %d, want 200", w.Code)
	}
	var got models.User
	db.First(&got, target.ID)
	if got.Role != models.RoleAdmin {
		t.Errorf("role after update = %q, want admin (operator/org never applied)", got.Role)
	}
}

// TestOpsGateRejectsNonOperator wires the REAL auth.Middleware + RequireRole gate
// (ops_test.go's stub bypasses it) and proves only an operator JWT reaches /ops.
func TestOpsGateRejectsNonOperator(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const secret = "test-secret"
	db := newAuthTestDB(t)
	h := &OpsHandler{DB: db}

	build := func() *gin.Engine {
		r := gin.New()
		r.Use(func(c *gin.Context) { tenant.SetScope(c, tenant.Scope{OrgID: tenant.DefaultOrgID}); c.Next() })
		grp := r.Group("/ops")
		grp.Use(auth.Middleware(secret))
		grp.Use(auth.RequireRole("operator"))
		grp.GET("/tenants", h.ListTenants)
		return r
	}
	call := func(role models.Role) int {
		token, _ := auth.GenerateToken(1, role, 0, secret, time.Hour)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/ops/tenants", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		build().ServeHTTP(w, req)
		return w.Code
	}

	for _, role := range []models.Role{models.RoleParticipant, models.RoleOrg, models.RoleAdmin, models.RoleStaff} {
		if code := call(role); code != http.StatusForbidden {
			t.Errorf("role %q on /ops -> %d, want 403", role, code)
		}
	}
	if code := call(models.RoleOperator); code != http.StatusOK {
		t.Errorf("operator on /ops -> %d, want 200", code)
	}
}
