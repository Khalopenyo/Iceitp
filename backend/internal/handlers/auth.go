package handlers

import (
	"conferenceplatforma/internal/auth"
	"conferenceplatforma/internal/models"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB        *gorm.DB
	JWTSecret string
}

type RegisterRequest struct {
	Email               string          `json:"email"`
	Password            string          `json:"password"`
	UserType            models.UserType `json:"user_type"`
	FullName            string          `json:"full_name"`
	Organization        string          `json:"organization"`
	Position            string          `json:"position"`
	City                string          `json:"city"`
	Degree              string          `json:"degree"`
	SectionID           *uint           `json:"section_id"`
	TalkTitle           string          `json:"talk_title"`
	Phone               string          `json:"phone"`
	ConsentPersonalData bool            `json:"consent_personal_data"`
	ConsentPublication  bool            `json:"consent_publication"`
	ConsentVersion      string          `json:"consent_version"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)
	req.FullName = strings.TrimSpace(req.FullName)
	req.Organization = strings.TrimSpace(req.Organization)
	req.Position = strings.TrimSpace(req.Position)
	req.City = strings.TrimSpace(req.City)
	req.Degree = strings.TrimSpace(req.Degree)
	req.TalkTitle = strings.TrimSpace(req.TalkTitle)
	req.Phone = strings.TrimSpace(req.Phone)
	req.ConsentVersion = strings.TrimSpace(req.ConsentVersion)
	if req.SectionID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "section is required"})
		return
	}
	if req.Email == "" || req.Password == "" || req.FullName == "" || req.TalkTitle == "" || req.ConsentVersion == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required fields or consent"})
		return
	}
	if !req.ConsentPersonalData || !req.ConsentPublication {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required fields or consent"})
		return
	}
	if req.UserType == "" {
		req.UserType = models.UserTypeOnline
	}
	if req.UserType != models.UserTypeOnline && req.UserType != models.UserTypeOffline {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user type"})
		return
	}
	var section models.Section
	if err := h.DB.First(&section, *req.SectionID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "selected section not found"})
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	user := models.User{
		Email:        req.Email,
		PasswordHash: string(passwordHash),
		Role:         models.RoleParticipant,
		UserType:     req.UserType,
		Profile: models.Profile{
			FullName:     req.FullName,
			Organization: req.Organization,
			Position:     req.Position,
			City:         req.City,
			Degree:       req.Degree,
			SectionID:    req.SectionID,
			TalkTitle:    req.TalkTitle,
			Phone:        req.Phone,
			ConsentGiven: req.ConsentPersonalData && req.ConsentPublication,
		},
	}
	if err := h.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
		return
	}
	h.logConsent(c, user.ID, req.ConsentVersion)
	token, err := auth.GenerateToken(user.ID, user.Role, h.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"token": token})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	var user models.User
	if err := h.DB.Preload("Profile").Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	token, err := auth.GenerateToken(user.ID, user.Role, h.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "reset instructions sent if the email exists"})
}

func (h *AuthHandler) logConsent(c *gin.Context, userID uint, consentVersion string) {
	consents := []models.ConsentLog{
		{
			UserID:         userID,
			ConsentType:    models.ConsentTypePersonalData,
			ConsentURL:     "/personal-data",
			ConsentVersion: consentVersion,
			IP:             c.ClientIP(),
			UserAgent:      c.GetHeader("User-Agent"),
		},
		{
			UserID:         userID,
			ConsentType:    models.ConsentTypePublication,
			ConsentURL:     "/consent-authors",
			ConsentVersion: consentVersion,
			IP:             c.ClientIP(),
			UserAgent:      c.GetHeader("User-Agent"),
		},
	}
	_ = h.DB.Create(&consents).Error
}
