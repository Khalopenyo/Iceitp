package handlers

import (
	"conferenceplatforma/internal/auth"
	"conferenceplatforma/internal/mail"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/sms"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log"
	"math"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	passwordHashCost                 = 12
	passwordMinLength                = 8
	passwordMaxBytes                 = 72
	defaultPasswordResetTTL          = 2 * time.Hour
	defaultPhoneAuthCodeTTL          = 10 * time.Minute
	defaultPhoneAuthResendCooldown   = 60 * time.Second
	defaultPhoneAuthMaxAttempts      = 5
	phoneAuthCodeDigits              = 5
	forgotPasswordResponseMessage    = "reset instructions sent if the email exists"
	resetPasswordSuccessMessage      = "password updated successfully"
	resetPasswordInvalidTokenMessage = "invalid or expired reset token"
	defaultAppBaseURL                = "http://localhost:5173"
)

var errInvalidResetToken = errors.New(resetPasswordInvalidTokenMessage)
var errAmbiguousPhone = errors.New("phone is used by multiple accounts")

type AuthHandler struct {
	DB                      *gorm.DB
	JWTSecret               string
	AppBaseURL              string
	PasswordResetTTL        time.Duration
	PhoneAuthCodeTTL        time.Duration
	PhoneAuthResendCooldown time.Duration
	PhoneAuthMaxAttempts    int
	MailSender              mail.PasswordResetSender
	AuthCodeSender          sms.AuthCodeSender
	Now                     func() time.Time
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

type RequestPhoneCodeRequest struct {
	Phone string `json:"phone"`
}

type VerifyPhoneCodeRequest struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token           string `json:"token"`
	Password        string `json:"password"`
	PasswordConfirm string `json:"password_confirm"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	req.Email = normalizeEmail(req.Email)
	req.FullName = strings.TrimSpace(req.FullName)
	req.Organization = strings.TrimSpace(req.Organization)
	req.Position = strings.TrimSpace(req.Position)
	req.City = strings.TrimSpace(req.City)
	req.Degree = strings.TrimSpace(req.Degree)
	req.TalkTitle = strings.TrimSpace(req.TalkTitle)
	req.ConsentVersion = strings.TrimSpace(req.ConsentVersion)
	if strings.TrimSpace(req.Phone) != "" {
		phone, err := formatPhoneForStorage(req.Phone)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid phone"})
			return
		}
		req.Phone = phone
	}
	if req.SectionID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "section is required"})
		return
	}
	if req.Email == "" || req.Password == "" || req.FullName == "" || req.TalkTitle == "" || req.ConsentVersion == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required fields or consent"})
		return
	}
	password, err := validatePassword(req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	passwordHash, err := hashPassword(password)
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
	req.Email = normalizeEmail(req.Email)
	req.Password = strings.TrimSpace(req.Password)

	user, err := h.findUserByEmail(h.DB.Preload("Profile"), req.Email)
	if err != nil {
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

func (h *AuthHandler) RequestPhoneCode(c *gin.Context) {
	var req RequestPhoneCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	phoneDigits, err := normalizePhoneDigits(req.Phone)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid phone"})
		return
	}

	user, err := h.findUserByPhone(h.DB.Preload("Profile"), phoneDigits)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "user with this phone was not found"})
		return
	}
	if errors.Is(err, errAmbiguousPhone) {
		c.JSON(http.StatusConflict, gin.H{"error": "this phone is assigned to multiple accounts"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to find user"})
		return
	}

	now := h.currentTime()
	var activeCode models.PhoneAuthCode
	if err := h.DB.
		Where("user_id = ? AND phone = ? AND consumed_at IS NULL AND expires_at > ?", user.ID, phoneDigits, now).
		Order("sent_at desc").
		First(&activeCode).Error; err == nil {
		retryAfter := activeCode.SentAt.Add(h.phoneAuthResendCooldown()).Sub(now)
		if retryAfter > 0 {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":               "Повторную отправку пока нельзя запрашивать",
				"retry_after_seconds": secondsCeil(retryAfter),
			})
			return
		}
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue phone code"})
		return
	}

	code, err := generateNumericAuthCode(phoneAuthCodeDigits)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate phone code"})
		return
	}

	record := models.PhoneAuthCode{
		UserID:             user.ID,
		Phone:              phoneDigits,
		CodeHash:           hashPhoneAuthCode(code),
		ExpiresAt:          now.Add(h.phoneAuthCodeTTL()),
		SentAt:             now,
		RequestedIP:        c.ClientIP(),
		RequestedUserAgent: c.GetHeader("User-Agent"),
	}

	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND phone = ? AND consumed_at IS NULL", user.ID, phoneDigits).Delete(&models.PhoneAuthCode{}).Error; err != nil {
			return err
		}
		return tx.Create(&record).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue phone code"})
		return
	}

	delivery, err := h.phoneAuthSender().SendAuthCode(c.Request.Context(), sms.AuthCodeMessage{
		Phone: phoneDigits,
		Code:  code,
	})
	if err != nil {
		_ = h.DB.Delete(&models.PhoneAuthCode{}, record.ID).Error
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(delivery.RequestID) != "" {
		_ = h.DB.Model(&models.PhoneAuthCode{}).Where("id = ?", record.ID).Update("provider_request_id", delivery.RequestID).Error
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "Код отправлен по SMS",
		"cooldown_seconds":   int(h.phoneAuthResendCooldown() / time.Second),
		"expires_in_seconds": int(h.phoneAuthCodeTTL() / time.Second),
	})
}

func (h *AuthHandler) VerifyPhoneCode(c *gin.Context) {
	var req VerifyPhoneCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	phoneDigits, err := normalizePhoneDigits(req.Phone)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid phone"})
		return
	}
	code := strings.TrimSpace(req.Code)
	if len(code) != phoneAuthCodeDigits {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid confirmation code"})
		return
	}

	now := h.currentTime()
	maxAttempts := h.phoneAuthMaxAttempts()
	var token string

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var authCode models.PhoneAuthCode
		if err := tx.
			Where("phone = ? AND consumed_at IS NULL", phoneDigits).
			Order("sent_at desc").
			First(&authCode).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("invalid or expired confirmation code")
			}
			return err
		}
		if !authCode.ExpiresAt.After(now) {
			return errors.New("invalid or expired confirmation code")
		}
		if authCode.VerifyAttempts >= maxAttempts {
			return errors.New("too many confirmation attempts")
		}
		if authCode.CodeHash != hashPhoneAuthCode(code) {
			updates := map[string]any{
				"verify_attempts": authCode.VerifyAttempts + 1,
			}
			if authCode.VerifyAttempts+1 >= maxAttempts {
				updates["consumed_at"] = now
			}
			if err := tx.Model(&models.PhoneAuthCode{}).Where("id = ?", authCode.ID).Updates(updates).Error; err != nil {
				return err
			}
			if authCode.VerifyAttempts+1 >= maxAttempts {
				return errors.New("too many confirmation attempts")
			}
			return errors.New("invalid or expired confirmation code")
		}

		var user models.User
		if err := tx.Preload("Profile").First(&user, authCode.UserID).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.PhoneAuthCode{}).
			Where("user_id = ? AND phone = ? AND consumed_at IS NULL", authCode.UserID, phoneDigits).
			Update("consumed_at", now).Error; err != nil {
			return err
		}

		issuedToken, err := auth.GenerateToken(user.ID, user.Role, h.JWTSecret)
		if err != nil {
			return err
		}
		token = issuedToken
		return nil
	})
	if err != nil {
		switch err.Error() {
		case "invalid or expired confirmation code":
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case "too many confirmation attempts":
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many confirmation attempts"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify phone code"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	req.Email = normalizeEmail(req.Email)
	if req.Email != "" {
		user, err := h.findUserByEmail(h.DB, req.Email)
		switch {
		case err == nil:
			message, issueErr := h.issuePasswordReset(user, c.ClientIP(), c.GetHeader("User-Agent"))
			if issueErr != nil {
				log.Printf("forgot password: issue reset for %s: %v", req.Email, issueErr)
			} else if sendErr := h.passwordResetSender().SendPasswordReset(c.Request.Context(), message); sendErr != nil {
				log.Printf("forgot password: send reset for %s: %v", req.Email, sendErr)
			}
		case !errors.Is(err, gorm.ErrRecordNotFound):
			log.Printf("forgot password: lookup %s: %v", req.Email, err)
		default:
			// Preserve outward behavior for non-existing accounts.
			_, _ = generateRawPasswordResetToken()
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": forgotPasswordResponseMessage})
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": resetPasswordInvalidTokenMessage})
		return
	}
	if strings.TrimSpace(req.Password) != strings.TrimSpace(req.PasswordConfirm) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password confirmation does not match"})
		return
	}

	password, err := validatePassword(req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	passwordHash, err := hashPassword(password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	now := h.currentTime()
	tokenHash := hashPasswordResetToken(req.Token)
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var resetToken models.PasswordResetToken
		if err := tx.Where("token_hash = ?", tokenHash).First(&resetToken).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errInvalidResetToken
			}
			return err
		}
		if resetToken.UsedAt != nil || !resetToken.ExpiresAt.After(now) {
			return errInvalidResetToken
		}
		if err := tx.Model(&models.User{}).
			Where("id = ?", resetToken.UserID).
			Update("password_hash", passwordHash).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.PasswordResetToken{}).
			Where("user_id = ? AND used_at IS NULL", resetToken.UserID).
			Update("used_at", now).Error; err != nil {
			return err
		}
		return nil
	})
	if errors.Is(err, errInvalidResetToken) {
		c.JSON(http.StatusBadRequest, gin.H{"error": resetPasswordInvalidTokenMessage})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": resetPasswordSuccessMessage})
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

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizePhoneDigits(phone string) (string, error) {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if digits == "" {
		return "", errors.New("phone is required")
	}
	if len(digits) == 10 {
		digits = "7" + digits
	}
	if len(digits) == 11 && strings.HasPrefix(digits, "8") {
		digits = "7" + digits[1:]
	}
	if len(digits) < 11 || len(digits) > 14 {
		return "", errors.New("invalid phone")
	}
	return digits, nil
}

func formatPhoneForStorage(phone string) (string, error) {
	digits, err := normalizePhoneDigits(phone)
	if err != nil {
		return "", err
	}
	return "+" + digits, nil
}

func validatePassword(password string) (string, error) {
	password = strings.TrimSpace(password)
	switch {
	case password == "":
		return "", errors.New("password is required")
	case len(password) < passwordMinLength:
		return "", errors.New("password must be at least 8 characters")
	case len([]byte(password)) > passwordMaxBytes:
		return "", errors.New("password must be 72 bytes or fewer")
	default:
		return password, nil
	}
}

func hashPassword(password string) (string, error) {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), passwordHashCost)
	if err != nil {
		return "", err
	}
	return string(passwordHash), nil
}

func (h *AuthHandler) findUserByEmail(query *gorm.DB, email string) (models.User, error) {
	var user models.User
	err := query.Where("LOWER(email) = ?", normalizeEmail(email)).First(&user).Error
	return user, err
}

func (h *AuthHandler) findUserByPhone(query *gorm.DB, phoneDigits string) (models.User, error) {
	var users []models.User
	if err := query.Find(&users).Error; err != nil {
		return models.User{}, err
	}

	var match *models.User
	for i := range users {
		normalized, err := normalizePhoneDigits(users[i].Profile.Phone)
		if err != nil {
			continue
		}
		if normalized != phoneDigits {
			continue
		}
		if match != nil {
			return models.User{}, errAmbiguousPhone
		}
		user := users[i]
		match = &user
	}
	if match == nil {
		return models.User{}, gorm.ErrRecordNotFound
	}
	return *match, nil
}

func (h *AuthHandler) issuePasswordReset(user models.User, requestedIP, requestedUserAgent string) (mail.PasswordResetMessage, error) {
	now := h.currentTime()
	rawToken, err := generateRawPasswordResetToken()
	if err != nil {
		return mail.PasswordResetMessage{}, err
	}
	expiresAt := now.Add(h.passwordResetTTL())
	resetURL, err := buildPasswordResetURL(h.appBaseURL(), rawToken)
	if err != nil {
		return mail.PasswordResetMessage{}, err
	}

	resetToken := models.PasswordResetToken{
		UserID:             user.ID,
		TokenHash:          hashPasswordResetToken(rawToken),
		ExpiresAt:          expiresAt,
		RequestedIP:        requestedIP,
		RequestedUserAgent: requestedUserAgent,
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND used_at IS NULL", user.ID).Delete(&models.PasswordResetToken{}).Error; err != nil {
			return err
		}
		return tx.Create(&resetToken).Error
	}); err != nil {
		return mail.PasswordResetMessage{}, err
	}

	return mail.PasswordResetMessage{
		To:        user.Email,
		ResetURL:  resetURL,
		ExpiresAt: expiresAt,
	}, nil
}

func generateRawPasswordResetToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func hashPasswordResetToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

func buildPasswordResetURL(baseURL, token string) (string, error) {
	parsed, err := neturl.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("app base url must be absolute")
	}
	basePath := strings.TrimSuffix(parsed.Path, "/")
	parsed.Path = basePath + "/reset-password"
	values := parsed.Query()
	values.Set("token", token)
	parsed.RawQuery = values.Encode()
	parsed.Fragment = ""
	return parsed.String(), nil
}

func (h *AuthHandler) appBaseURL() string {
	if strings.TrimSpace(h.AppBaseURL) == "" {
		return defaultAppBaseURL
	}
	return strings.TrimSpace(h.AppBaseURL)
}

func (h *AuthHandler) passwordResetTTL() time.Duration {
	if h.PasswordResetTTL <= 0 {
		return defaultPasswordResetTTL
	}
	return h.PasswordResetTTL
}

func (h *AuthHandler) phoneAuthCodeTTL() time.Duration {
	if h.PhoneAuthCodeTTL <= 0 {
		return defaultPhoneAuthCodeTTL
	}
	return h.PhoneAuthCodeTTL
}

func (h *AuthHandler) phoneAuthResendCooldown() time.Duration {
	if h.PhoneAuthResendCooldown <= 0 {
		return defaultPhoneAuthResendCooldown
	}
	return h.PhoneAuthResendCooldown
}

func (h *AuthHandler) phoneAuthMaxAttempts() int {
	if h.PhoneAuthMaxAttempts <= 0 {
		return defaultPhoneAuthMaxAttempts
	}
	return h.PhoneAuthMaxAttempts
}

func (h *AuthHandler) passwordResetSender() mail.PasswordResetSender {
	if h.MailSender == nil {
		return &mail.LogPasswordResetSender{}
	}
	return h.MailSender
}

func (h *AuthHandler) phoneAuthSender() sms.AuthCodeSender {
	if h.AuthCodeSender == nil {
		return &sms.LogAuthCodeSender{}
	}
	return h.AuthCodeSender
}

func (h *AuthHandler) currentTime() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now()
}

func generateNumericAuthCode(length int) (string, error) {
	if length <= 0 {
		return "", errors.New("invalid code length")
	}
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := range buf {
		buf[i] = '0' + (buf[i] % 10)
	}
	return string(buf), nil
}

func hashPhoneAuthCode(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(sum[:])
}

func secondsCeil(duration time.Duration) int {
	return int(math.Ceil(duration.Seconds()))
}
