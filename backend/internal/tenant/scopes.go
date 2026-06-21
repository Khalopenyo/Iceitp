package tenant

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ByConference returns a GORM scope that filters a query by the request's active
// conference (conference_id). It is a NO-OP when no conference is resolved
// (ConfID == 0) — e.g. in handler unit tests that do not install the tenant
// middleware — so existing tests are unaffected while production requests (which
// always carry a resolved scope) are isolated by conference.
func ByConference(c *gin.Context) func(*gorm.DB) *gorm.DB {
	cid := ConfID(c)
	return func(db *gorm.DB) *gorm.DB {
		if cid != 0 {
			return db.Where("conference_id = ?", cid)
		}
		return db
	}
}

// ByOrg returns a GORM scope filtering by the request's organization
// (organization_id). It is a NO-OP when the request carries no resolved scope
// (so unit tests without the middleware are unaffected); when a scope is present
// it always filters, since OrgID falls back to DefaultOrgID.
func ByOrg(c *gin.Context) func(*gorm.DB) *gorm.DB {
	s, ok := FromContext(c)
	return func(db *gorm.DB) *gorm.DB {
		if ok && s.OrgID != 0 {
			return db.Where("organization_id = ?", s.OrgID)
		}
		return db
	}
}
