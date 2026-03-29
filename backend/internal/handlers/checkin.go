package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type CheckInHandler struct {
	DB        *gorm.DB
	JWTSecret string
}

type verifyBadgePayload struct {
	Token string `json:"token"`
}

func (h *CheckInHandler) VerifyBadge(c *gin.Context) {
	var payload verifyBadgePayload
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(payload.Token, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(h.JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid badge token"})
		return
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "badge" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token type"})
		return
	}

	userIDFloat, userIDOk := claims["user_id"].(float64)
	confIDFloat, confIDOk := claims["conference_id"].(float64)
	if !userIDOk || !confIDOk {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token payload"})
		return
	}

	userID := uint(userIDFloat)
	conferenceID := uint(confIDFloat)
	verifierID := c.GetUint("user_id")

	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var conf models.Conference
	if err := h.DB.First(&conf, conferenceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "conference not found"})
		return
	}

	var checkIn models.CheckIn
	err = h.DB.Where("conference_id = ? AND user_id = ?", conferenceID, userID).First(&checkIn).Error
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"status":             "ok",
			"already_checked_in": true,
			"checked_in_at":      checkIn.CheckedInAt,
			"user": gin.H{
				"id":        user.ID,
				"full_name": user.Profile.FullName,
				"email":     user.Email,
			},
			"conference": gin.H{
				"id":    conf.ID,
				"title": conf.Title,
			},
		})
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify check-in"})
		return
	}

	checkIn = models.CheckIn{
		ConferenceID:     conferenceID,
		UserID:           userID,
		CheckedInAt:      time.Now(),
		VerifiedByUserID: &verifierID,
		Source:           "badge_qr",
	}
	if err := h.DB.Create(&checkIn).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save check-in"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":             "ok",
		"already_checked_in": false,
		"checked_in_at":      checkIn.CheckedInAt,
		"user": gin.H{
			"id":        user.ID,
			"full_name": user.Profile.FullName,
			"email":     user.Email,
		},
		"conference": gin.H{
			"id":    conf.ID,
			"title": conf.Title,
		},
	})
}
