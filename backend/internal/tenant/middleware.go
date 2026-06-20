package tenant

import "github.com/gin-gonic/gin"

// Middleware resolves the tenant for each request and stores it on the context.
//
// Phase 0: no-op resolver — every request maps to the single existing
// organization (DefaultOrgID), so behaviour is identical to the pre-tenant app.
// No handler reads the scope yet, so responses are byte-identical.
//
// Phase 2 replaces the body with subdomain/Host + JWT org-claim resolution,
// rejects unknown/suspended tenants, and the scope becomes the basis for the
// request-scoped GORM filter and Postgres RLS session variable.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		SetScope(c, Scope{OrgID: DefaultOrgID})
		c.Next()
	}
}
