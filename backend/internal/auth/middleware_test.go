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

	// A real tenant subdomain (HostMatched) resolved org `resolvedOrg`.
	do := func(resolvedOrg uint) int {
		r := gin.New()
		r.Use(func(c *gin.Context) { tenant.SetScope(c, tenant.Scope{OrgID: resolvedOrg, HostMatched: true}); c.Next() })
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
		t.Errorf("cross-org subdomain -> %d, want 403 (token for org 7 must not act under org 9)", code)
	}
}

// TestMiddlewareAllowsTokenOnBareDomain proves the control-plane path: on the bare
// app / marketing domain the Host resolves to the DefaultOrgID fallback
// (HostMatched=false), so an organizer whose token names a different org is NOT
// rejected — IdentityScope adopts their own org downstream. Only a *real* tenant
// subdomain that names a different org triggers the 403.
func TestMiddlewareAllowsTokenOnBareDomain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const secret = "test-secret"

	token, err := GenerateToken(1, models.RoleOrg, 7, secret, time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}

	r := gin.New()
	// DefaultOrgID fallback, not a subdomain match.
	r.Use(func(c *gin.Context) { tenant.SetScope(c, tenant.Scope{OrgID: tenant.DefaultOrgID, HostMatched: false}); c.Next() })
	r.Use(Middleware(secret))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("org token on bare domain -> %d, want 200 (control plane scopes by identity)", w.Code)
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
