package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"

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
)

func loadBadgeTokenContext(db *gorm.DB, jwtSecret, rawToken string) (*badgeTokenContext, error) {
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

	var user models.User
	if err := db.Preload("Profile").First(&user, userID).Error; err != nil {
		return nil, err
	}

	var conf models.Conference
	if err := db.First(&conf, conferenceID).Error; err != nil {
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
