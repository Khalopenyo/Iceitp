package tenant

import (
	"strings"

	"conferenceplatforma/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Middleware resolves the tenant for each request from the request Host and
// stores the Scope on the context.
//
// Phase 2.4: the organization is resolved from the leading subdomain label of the
// Host (matched against organizations.slug); the active conference is that
// organization's conference. Requests on a bare domain / IP / localhost (no
// matching subdomain) fall back to DefaultOrgID — the current single-tenant
// deployment. No matching conference for a non-default org yields ConfID 0
// (no data), so a wrong subdomain cannot borrow another tenant's conference.
//
// TODO Phase 2.x: once enforcement (GORM scope + RLS) is in, reject unknown or
// suspended tenants instead of falling back.
func Middleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		host := ""
		if c.Request != nil {
			host = c.Request.Host
		}
		orgID := resolveOrgID(db, host)
		SetScope(c, Scope{OrgID: orgID, ConfID: resolveConfID(db, orgID)})
		c.Next()
	}
}

// resolveOrgID maps the leading subdomain label of host to an organization slug,
// falling back to DefaultOrgID when nothing matches.
func resolveOrgID(db *gorm.DB, host string) uint {
	if label := leadingLabel(host); label != "" {
		var org models.Organization
		if err := db.Where("slug = ?", label).First(&org).Error; err == nil {
			return org.ID
		}
	}
	return DefaultOrgID
}

// resolveConfID returns the organization's active conference. For the default org
// it falls back to the single lowest-id conference (legacy data not yet linked);
// for any other org it returns 0 when no conference belongs to it, so a request
// can never borrow a different tenant's conference.
func resolveConfID(db *gorm.DB, orgID uint) uint {
	var conf models.Conference
	if err := db.Where("organization_id = ?", orgID).Order("id asc").First(&conf).Error; err == nil {
		return conf.ID
	}
	if orgID == DefaultOrgID {
		if err := db.Order("id asc").First(&conf).Error; err == nil {
			return conf.ID
		}
	}
	return 0
}

// leadingLabel returns the first dot-separated label of the host (port stripped),
// or "" when the host has no subdomain (e.g. "localhost", a bare IP).
func leadingLabel(host string) string {
	if i := strings.IndexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	host = strings.ToLower(strings.TrimSpace(host))
	dot := strings.IndexByte(host, '.')
	if dot <= 0 {
		return ""
	}
	return host[:dot]
}
