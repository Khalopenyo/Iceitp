package handlers

import (
	"bytes"
	"conferenceplatforma/internal/mail"
	"conferenceplatforma/internal/models"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type passwordResetSenderStub struct {
	messages []mail.PasswordResetMessage
}

func (s *passwordResetSenderStub) SendPasswordReset(_ context.Context, message mail.PasswordResetMessage) error {
	s.messages = append(s.messages, message)
	return nil
}

func newPasswordResetTestRouter(db *gorm.DB, sender *passwordResetSenderStub, now time.Time) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &AuthHandler{
		DB:               db,
		JWTSecret:        "test-secret",
		AppBaseURL:       "https://conference.test",
		PasswordResetTTL: 2 * time.Hour,
		MailSender:       sender,
		Now: func() time.Time {
			return now
		},
	}
	router.POST("/forgot-password", handler.ForgotPassword)
	return router
}

func performJSONRequest(t *testing.T, router *gin.Engine, method, path string, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func seedLoginUser(t *testing.T, db *gorm.DB, email, password string) models.User {
	t.Helper()

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), passwordHashCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	user := models.User{
		Email:        email,
		PasswordHash: string(passwordHash),
		Role:         models.RoleParticipant,
		UserType:     models.UserTypeOnline,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func extractResetToken(t *testing.T, rawURL string) string {
	t.Helper()

	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse reset url: %v", err)
	}
	token := parsed.Query().Get("token")
	if token == "" {
		t.Fatalf("reset url does not contain token: %s", rawURL)
	}
	return token
}

func TestForgotPasswordReturnsUniformResponse(t *testing.T) {
	db := newAuthTestDB(t)
	if err := db.AutoMigrate(&models.PasswordResetToken{}); err != nil {
		t.Fatalf("auto migrate password reset token: %v", err)
	}
	now := time.Date(2026, time.April, 4, 8, 0, 0, 0, time.UTC)
	sender := &passwordResetSenderStub{}
	router := newPasswordResetTestRouter(db, sender, now)
	seedLoginUser(t, db, "existing@example.com", "secret123")

	existing := performJSONRequest(t, router, http.MethodPost, "/forgot-password", map[string]any{
		"email": "existing@example.com",
	})
	missing := performJSONRequest(t, router, http.MethodPost, "/forgot-password", map[string]any{
		"email": "missing@example.com",
	})

	if existing.Code != http.StatusOK {
		t.Fatalf("expected existing status %d, got %d: %s", http.StatusOK, existing.Code, existing.Body.String())
	}
	if missing.Code != http.StatusOK {
		t.Fatalf("expected missing status %d, got %d: %s", http.StatusOK, missing.Code, missing.Body.String())
	}
	if existing.Body.String() != missing.Body.String() {
		t.Fatalf("expected uniform body, got existing=%q missing=%q", existing.Body.String(), missing.Body.String())
	}
}

func TestForgotPasswordCreatesResetTokenForExistingUser(t *testing.T) {
	db := newAuthTestDB(t)
	if err := db.AutoMigrate(&models.PasswordResetToken{}); err != nil {
		t.Fatalf("auto migrate password reset token: %v", err)
	}
	now := time.Date(2026, time.April, 4, 9, 0, 0, 0, time.UTC)
	sender := &passwordResetSenderStub{}
	router := newPasswordResetTestRouter(db, sender, now)
	user := seedLoginUser(t, db, "speaker@example.com", "secret123")

	recorder := performJSONRequest(t, router, http.MethodPost, "/forgot-password", map[string]any{
		"email": "speaker@example.com",
	})
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var tokens []models.PasswordResetToken
	if err := db.Where("user_id = ?", user.ID).Find(&tokens).Error; err != nil {
		t.Fatalf("load reset tokens: %v", err)
	}
	if len(tokens) != 1 {
		t.Fatalf("expected 1 reset token, got %d", len(tokens))
	}
	if tokens[0].TokenHash == "" {
		t.Fatalf("expected stored token hash")
	}
	if !tokens[0].ExpiresAt.After(now) {
		t.Fatalf("expected future expiry, got %s", tokens[0].ExpiresAt)
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected 1 reset email, got %d", len(sender.messages))
	}
	rawToken := extractResetToken(t, sender.messages[0].ResetURL)
	if hashPasswordResetToken(rawToken) != tokens[0].TokenHash {
		t.Fatalf("expected raw token from email to match stored hash")
	}
}
