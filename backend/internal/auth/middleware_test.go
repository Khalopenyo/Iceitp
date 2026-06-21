package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
)

// TestMiddlewareBindsTokenOrgToResolvedTenant proves a token minted for one
// organization cannot operate under a different tenant's resolved scope: a
// cross-org request is rejected with 403, while a same-org request passes. This
// closes the cross-tenant escalation where scope came purely from the (spoofable)
// Host subdomain.
func TestMiddlewareBindsTokenOrgToResolvedTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const secret = "test-secret"

	token, err := GenerateToken(1, models.RoleAdmin, 7, secret, time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}

	do := func(resolvedOrg uint) int {
		r := gin.New()
		r.Use(func(c *gin.Context) { tenant.SetScope(c, tenant.Scope{OrgID: resolvedOrg}); c.Next() })
		r.Use(Middleware(secret))
		r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		r.ServeHTTP(w, req)
		return w.Code
	}

	if code := do(7); code != http.StatusOK {
		t.Errorf("same-org request -> %d, want 200", code)
	}
	if code := do(9); code != http.StatusForbidden {
		t.Errorf("cross-org request -> %d, want 403 (token for org 7 must not act under org 9)", code)
	}
}

// TestMiddlewareToleratesTokenWithoutOrgClaim ensures pre-migration tokens (no
// org claim) still authenticate, so the rollout does not invalidate live sessions.
func TestMiddlewareToleratesTokenWithoutOrgClaim(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const secret = "test-secret"

	token, err := GenerateToken(1, models.RoleParticipant, 0, secret, time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}

	r := gin.New()
	r.Use(func(c *gin.Context) { tenant.SetScope(c, tenant.Scope{OrgID: 9}); c.Next() })
	r.Use(Middleware(secret))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("token without org claim -> %d, want 200 (must remain tolerated)", w.Code)
	}
}
