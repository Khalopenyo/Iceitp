package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type badgeTokenContext struct {
	User       models.User
	Conference models.Conference
}

type questionTokenContext struct {
	Conference models.Conference
}

var (
	errInvalidBadgeToken   = errors.New("invalid badge token")
	errInvalidTokenType    = errors.New("invalid token type")
	errInvalidTokenPayload = errors.New("invalid token payload")
	errBadgeNotIssued      = errors.New("badge no longer valid")
)

func loadBadgeTokenContext(c *gin.Context, db *gorm.DB, jwtSecret, rawToken string) (*badgeTokenContext, error) {
	claims, err := parseSignedTokenClaims(jwtSecret, rawToken)
	if err != nil {
		return nil, err
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "badge" {
		return nil, errInvalidTokenType
	}

	userIDFloat, userIDOk := claims["user_id"].(float64)
	confIDFloat, confIDOk := claims["conference_id"].(float64)
	if !userIDOk || !confIDOk {
		return nil, errInvalidTokenPayload
	}

	userID := uint(userIDFloat)
	conferenceID := uint(confIDFloat)

	// Скоупим по тенанту запроса: бейдж-токен, выпущенный для пользователя/
	// конференции ДРУГОГО вуза, не должен валидироваться здесь даже при общем
	// JWT-секрете и RLS_ENFORCED=off. Несовпадение тенанта → ErrRecordNotFound.
	var conf models.Conference
	if err := db.Scopes(tenant.ByOrg(c)).First(&conf, conferenceID).Error; err != nil {
		return nil, err
	}

	var user models.User
	if err := db.Scopes(tenant.ByOrg(c)).Preload("Profile").First(&user, userID).Error; err != nil {
		return nil, err
	}

	return &badgeTokenContext{
		User:       user,
		Conference: conf,
	}, nil
}

func loadQuestionTokenContext(db *gorm.DB, jwtSecret, rawToken string) (*questionTokenContext, error) {
	claims, err := parseSignedTokenClaims(jwtSecret, rawToken)
	if err != nil {
		return nil, err
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "question" {
		return nil, errInvalidTokenType
	}

	confIDFloat, confIDOk := claims["conference_id"].(float64)
	if !confIDOk {
		return nil, errInvalidTokenPayload
	}

	conferenceID := uint(confIDFloat)

	var conf models.Conference
	if err := db.First(&conf, conferenceID).Error; err != nil {
		return nil, err
	}

	return &questionTokenContext{
		Conference: conf,
	}, nil
}

func parseSignedTokenClaims(jwtSecret, rawToken string) (jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(rawToken, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(jwtSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		return nil, errInvalidBadgeToken
	}
	return claims, nil
}
