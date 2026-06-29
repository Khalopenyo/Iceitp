package handlers

import (
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// normalizeRFC3339 reformats an RFC3339Nano timestamp string to plain RFC3339,
// leaving empty or unparseable input untouched. Centralizes the per-field reformat
// loop previously copy-pasted across the question/feedback list handlers.
func normalizeRFC3339(s string) string {
	if s == "" {
		return s
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.Format(time.RFC3339)
	}
	return s
}

// signTokenClaims signs a public-token claim set with HS256 — the single place the
// signing method and secret handling live (badge / question public links).
func signTokenClaims(secret string, claims jwt.MapClaims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// appURL joins the app base URL with an already-escaped path (which must start with
// "/"). An empty base yields a relative URL, matching the previous per-handler
// builders exactly.
func appURL(base, path string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		return path
	}
	return strings.TrimSuffix(base, "/") + path
}
