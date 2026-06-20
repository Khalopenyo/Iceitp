// Package tenant carries the per-request tenant scope (organization / conference)
// through a request. In Phase 0 it is populated by a no-op middleware that
// resolves every request to the single existing organization (DefaultOrgID), so
// behaviour is identical to the pre-tenant application. Phase 2 replaces
// resolution with subdomain/Host + JWT-claim lookup and adds enforcement
// (request-scoped GORM scope + Postgres RLS).
package tenant

import "github.com/gin-gonic/gin"

// DefaultOrgID is the single existing organization during Phase 0-1, before the
// multi-tenant data model lands. It lets call sites start reading the scope with
// zero behaviour change.
const DefaultOrgID uint = 1

// contextKey is the gin.Context key under which the resolved Scope is stored.
const contextKey = "tenant.scope"

// Scope is the tenant context resolved for the current request.
type Scope struct {
	OrgID  uint // organization (вуз) — tenant root
	ConfID uint // conference within the organization (0 if not resolved)
}

// SetScope stores the resolved scope on the gin context.
func SetScope(c *gin.Context, s Scope) {
	c.Set(contextKey, s)
}

// FromContext returns the resolved scope and whether one was present.
func FromContext(c *gin.Context) (Scope, bool) {
	v, ok := c.Get(contextKey)
	if !ok {
		return Scope{}, false
	}
	s, ok := v.(Scope)
	return s, ok
}

// OrgID returns the resolved organization id, or DefaultOrgID if none was set.
// Phase 2 tightens this to reject requests without a resolved tenant.
func OrgID(c *gin.Context) uint {
	if s, ok := FromContext(c); ok && s.OrgID != 0 {
		return s.OrgID
	}
	return DefaultOrgID
}
