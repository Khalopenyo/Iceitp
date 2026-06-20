package tenant

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
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

	SetScope(c, Scope{OrgID: 7, ConfID: 42})
	s, ok := FromContext(c)
	if !ok || s.OrgID != 7 || s.ConfID != 42 {
		t.Fatalf("FromContext = %+v, ok=%v; want {7 42}, true", s, ok)
	}
	if got := OrgID(c); got != 7 {
		t.Fatalf("OrgID = %d, want 7", got)
	}
}

func TestMiddlewareSetsDefaultOrg(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	Middleware()(c)

	s, ok := FromContext(c)
	if !ok || s.OrgID != DefaultOrgID {
		t.Fatalf("after middleware scope = %+v, ok=%v; want OrgID=%d", s, ok, DefaultOrgID)
	}
}
