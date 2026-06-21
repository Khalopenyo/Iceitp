package auth

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func Middleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr, err := tokenFromRequest(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("role", claims.Role)
		c.Set("jwt_org_id", claims.OrganizationID)
		// Bind the authenticated principal to the resolved tenant: a token minted
		// for one organization must not operate under a different tenant's
		// (Host-resolved) scope — otherwise an org-A admin could present their token
		// to orgB.<domain> and act as org B. Enforced only when a tenant scope was
		// actually resolved (production: the tenant middleware ran on /api).
		// Pre-migration tokens with no org claim (OrganizationID == 0) are tolerated.
		if claims.OrganizationID != 0 {
			if s, ok := tenant.FromContext(c); ok && s.OrgID != 0 && s.OrgID != claims.OrganizationID {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "token does not belong to this organization"})
				return
			}
		}
		c.Next()
	}
}

func tokenFromRequest(c *gin.Context) (string, error) {
	authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			return "", errors.New("invalid authorization header")
		}
		return strings.TrimSpace(parts[1]), nil
	}

	cookie, err := c.Cookie(DefaultSessionCookieName)
	if err != nil {
		return "", nil
	}
	return strings.TrimSpace(cookie), nil
}

func RequireRole(roles ...models.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		val, ok := c.Get("role")
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing role"})
			return
		}
		role := val.(models.Role)
		for _, allowed := range roles {
			if role == allowed {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	}
}
