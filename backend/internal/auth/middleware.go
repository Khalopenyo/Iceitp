package auth

import (
	"conferenceplatforma/internal/models"
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
