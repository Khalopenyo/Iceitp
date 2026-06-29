package tenant

import (
	"net/http"
	"strings"
	"time"

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
func Middleware(db *gorm.DB, cacheTTL time.Duration) gin.HandlerFunc {
	cache := newResolveCache(cacheTTL)
	return func(c *gin.Context) {
		host := ""
		if c.Request != nil {
			host = c.Request.Host
		}
		label := leadingLabel(host)
		orgID, confID, matched, ok := cache.get(label)
		if !ok {
			orgID, matched = resolveOrgID(db, host)
			confID = resolveConfID(db, orgID)
			// Кэшируем только совпавшие поддомены и apex-фолбэк (label==""), чтобы
			// поток случайных/несуществующих поддоменов не раздувал кэш без пользы.
			if matched || label == "" {
				cache.put(label, orgID, confID, matched)
			}
		}
		SetScope(c, Scope{OrgID: orgID, ConfID: confID, HostMatched: matched})
		c.Next()
	}
}

// IdentityScope rescopes an authenticated request to the organization named by the
// principal's JWT (stored as "jwt_org_id" by auth.Middleware), re-resolving that
// org's active conference. The organizer console — and a signed-in user's own
// pages — must follow WHO is authenticated, not the Host: the console is served
// from the bare app / marketing domain, where the Host resolves to no specific
// tenant (DefaultOrgID fallback). auth.Middleware has already rejected a token
// presented on a *different* tenant's real subdomain, so by the time we get here
// the principal is operating on their own org (or on the bare domain) — adopt it.
// No-op for unauthenticated requests and pre-migration tokens (no org claim).
func IdentityScope(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if v, ok := c.Get("jwt_org_id"); ok {
			if orgID, _ := v.(uint); orgID != 0 {
				confID := resolveConfID(db, orgID)
				// Preserve HostMatched: the cross-tenant 403 in auth.Middleware keys on
				// it, and a later re-check must still see the real Host-resolved value.
				prev, _ := FromContext(c)
				SetScope(c, Scope{OrgID: orgID, ConfID: confID, HostMatched: prev.HostMatched})
				// Re-pin the RLS session to the adopted identity. RLSMiddleware ran
				// earlier with the Host-resolved org, so without this the request tx
				// would stay bound to the wrong tenant and RLS would filter every query
				// by the Host org instead of the principal's org. No-op when RLS is off.
				if err := RepinRLS(c, orgID, confID); err != nil {
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set tenant scope"})
					return
				}
			}
		}
		c.Next()
	}
}

// RequireActiveOrg rejects an authenticated request whose organization is missing
// or not active (suspended / archived). Applied to the console (/admin) group so a
// suspended or deleted tenant cannot keep mutating data with a still-valid token
// (JWTs live for their full TTL with no revocation). Must run after IdentityScope
// so it gates the principal's adopted org. No-op for requests with no org claim.
func RequireActiveOrg(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("jwt_org_id")
		if !ok {
			c.Next()
			return
		}
		orgID, _ := v.(uint)
		if orgID == 0 {
			c.Next()
			return
		}
		var org models.Organization
		if err := db.Select("id", "status").First(&org, orgID).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "organization not found"})
			return
		}
		if org.Status != models.OrganizationStatusActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "organization is not active"})
			return
		}
		c.Next()
	}
}

// resolveOrgID maps the leading subdomain label of host to an organization slug.
// The bool is true only on an explicit slug match; it is false (with DefaultOrgID)
// when the host has no subdomain or no organization owns that label.
func resolveOrgID(db *gorm.DB, host string) (uint, bool) {
	if label := leadingLabel(host); label != "" {
		var org models.Organization
		if err := db.Where("slug = ?", label).First(&org).Error; err == nil {
			return org.ID, true
		}
	}
	return DefaultOrgID, false
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
