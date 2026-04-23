package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CheckInHandler struct {
	DB        *gorm.DB
	JWTSecret string
}

type verifyBadgePayload struct {
	Token string `json:"token"`
}

type checkInResponse struct {
	Status           string    `json:"status"`
	AlreadyCheckedIn bool      `json:"already_checked_in"`
	CheckedInAt      time.Time `json:"checked_in_at"`
	User             gin.H     `json:"user"`
	Conference       gin.H     `json:"conference"`
}

func (h *CheckInHandler) ScanBadge(c *gin.Context) {
	payload, ok := bindBadgePayload(c)
	if !ok {
		return
	}

	response, err := h.processBadgeCheckIn(payload.Token, nil, "badge_qr_scan")
	if err != nil {
		writeCheckInError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func (h *CheckInHandler) VerifyBadge(c *gin.Context) {
	payload, ok := bindBadgePayload(c)
	if !ok {
		return
	}

	verifierID := c.GetUint("user_id")
	response, err := h.processBadgeCheckIn(payload.Token, &verifierID, "badge_qr_admin")
	if err != nil {
		writeCheckInError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func bindBadgePayload(c *gin.Context) (verifyBadgePayload, bool) {
	var payload verifyBadgePayload
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return verifyBadgePayload{}, false
	}
	return payload, true
}

func (h *CheckInHandler) processBadgeCheckIn(rawToken string, verifierID *uint, source string) (*checkInResponse, error) {
	context, err := loadBadgeTokenContext(h.DB, h.JWTSecret, rawToken)
	if err != nil {
		return nil, err
	}
	user := context.User
	conf := context.Conference

	var checkIn models.CheckIn
	err = h.DB.Where("conference_id = ? AND user_id = ?", conf.ID, user.ID).First(&checkIn).Error
	if err == nil {
		return buildCheckInResponse(checkIn.CheckedInAt, true, user, conf), nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	checkIn = models.CheckIn{
		ConferenceID:     conf.ID,
		UserID:           user.ID,
		CheckedInAt:      time.Now(),
		VerifiedByUserID: verifierID,
		Source:           source,
	}
	if err := h.DB.Create(&checkIn).Error; err != nil {
		return nil, err
	}

	return buildCheckInResponse(checkIn.CheckedInAt, false, user, conf), nil
}
func buildCheckInResponse(checkedInAt time.Time, alreadyCheckedIn bool, user models.User, conf models.Conference) *checkInResponse {
	return &checkInResponse{
		Status:           "ok",
		AlreadyCheckedIn: alreadyCheckedIn,
		CheckedInAt:      checkedInAt,
		User: gin.H{
			"id":        user.ID,
			"full_name": user.Profile.FullName,
			"email":     user.Email,
		},
		Conference: gin.H{
			"id":    conf.ID,
			"title": conf.Title,
		},
	}
}

func writeCheckInError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errInvalidBadgeToken):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid badge token"})
	case errors.Is(err, errInvalidTokenType):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token type"})
	case errors.Is(err, errInvalidTokenPayload):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token payload"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "user or conference not found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify check-in"})
	}
}
