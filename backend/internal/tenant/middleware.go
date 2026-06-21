package tenant

import (
	"conferenceplatforma/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Middleware resolves the tenant for each request and stores the Scope on the
// context.
//
// Phase 2.1: organization is the single existing org (DefaultOrgID) and the
// active conference is the one conference in the database. The scope now carries
// ConfID so write paths can stamp conference_id and reads can scope by it
// (wired incrementally in later 2.x sub-steps).
//
// TODO Phase 2.2: resolve the organization from the request subdomain/Host
// (organizations.slug) and the active conference within it; reject unknown or
// suspended tenants.
func Middleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		orgID := DefaultOrgID

		var conf models.Conference
		// Single-tenant reality: the lowest-id conference. ConfID stays 0 if the
		// database has no conference yet (fresh install before bootstrap/seed).
		_ = db.Order("id asc").First(&conf).Error

		SetScope(c, Scope{OrgID: orgID, ConfID: conf.ID})
		c.Next()
	}
}
