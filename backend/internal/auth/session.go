package auth

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const DefaultSessionCookieName = "conf_session"

func SetSessionCookie(c *gin.Context, token, appBaseURL string, ttl time.Duration) {
	if ttl <= 0 {
		ttl = 12 * time.Hour
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     DefaultSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure(appBaseURL),
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(ttl),
		MaxAge:   int(ttl.Seconds()),
	})
}

func ClearSessionCookie(c *gin.Context, appBaseURL string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     DefaultSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure(appBaseURL),
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}

func cookieSecure(appBaseURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(appBaseURL))
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Scheme, "https")
}
