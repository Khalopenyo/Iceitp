package tenant

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ByConference returns a GORM scope that filters a query by the request's active
// conference (conference_id), with three cases:
//   - no tenant resolved (FromContext !ok — e.g. handler unit tests without the
//     middleware): NO-OP, so existing tests/call sites are unaffected;
//   - a conference is resolved: filter by it;
//   - a tenant is resolved but has NO active conference (ConfID == 0 — e.g. a
//     freshly created organization with no conference yet): fail CLOSED
//     (WHERE 1 = 0). Returning the query unscoped here would leak every tenant's
//     rows to a conference-less org, so we return zero rows instead.
func ByConference(c *gin.Context) func(*gorm.DB) *gorm.DB {
	s, ok := FromContext(c)
	return func(db *gorm.DB) *gorm.DB {
		switch {
		case !ok:
			return db
		case s.ConfID != 0:
			return db.Where("conference_id = ?", s.ConfID)
		default:
			return db.Where("1 = 0")
		}
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
