package tenant

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// dbContextKey is the gin.Context key under which the request-scoped *gorm.DB
// (the RLS transaction) is stored when enforcement is on.
const dbContextKey = "tenant.db"

// DB returns the request-scoped database handle: the RLS transaction installed by
// RLSMiddleware when present, otherwise the supplied fallback (the global pool).
//
// Tenant-scoped handlers should run their queries through tenant.DB(c, h.DB) so
// they participate in the per-request RLS session when enforcement is on. It is a
// transparent pass-through to the fallback when enforcement is off, so call sites
// are unaffected in the default deployment.
func DB(c *gin.Context, fallback *gorm.DB) *gorm.DB {
	if v, ok := c.Get(dbContextKey); ok {
		if tx, ok := v.(*gorm.DB); ok && tx != nil {
			return tx
		}
	}
	return fallback
}

// RLSMiddleware wraps each request in a transaction that sets the app.org_id /
// app.conf_id Postgres session variables (SET LOCAL, via set_config(..., true)),
// so the fail-closed Row-Level-Security policies (migration 202606200009) filter
// every query by the resolved tenant. The transaction commits on success and
// rolls back on a 5xx response, a handler error, or a panic.
//
// Must run AFTER Middleware (which resolves the scope onto the context). A strict
// no-op when enforced is false, so default deployments are unaffected. Per-request
// transactions are required because connection pooling makes a session-level SET
// unreliable across a request's queries.
func RLSMiddleware(db *gorm.DB, enforced bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !enforced {
			c.Next()
			return
		}

		scope, _ := FromContext(c)
		tx := db.Begin()
		if tx.Error != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to start request transaction"})
			return
		}
		if err := tx.Exec(
			"SELECT set_config('app.org_id', ?, true), set_config('app.conf_id', ?, true)",
			strconv.FormatUint(uint64(scope.OrgID), 10),
			strconv.FormatUint(uint64(scope.ConfID), 10),
		).Error; err != nil {
			tx.Rollback()
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set tenant scope"})
			return
		}

		c.Set(dbContextKey, tx)
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
				panic(r)
			}
		}()

		c.Next()

		if len(c.Errors) > 0 || c.Writer.Status() >= http.StatusInternalServerError {
			tx.Rollback()
			return
		}
		tx.Commit()
	}
}
