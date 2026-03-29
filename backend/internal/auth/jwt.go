package auth

import (
	"conferenceplatforma/internal/models"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID uint        `json:"user_id"`
	Role   models.Role `json:"role"`
	jwt.RegisteredClaims
}

func GenerateToken(userID uint, role models.Role, secret string) (string, error) {
	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
