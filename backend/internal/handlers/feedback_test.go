package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newFeedbackTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Profile{},
		&models.Feedback{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newFeedbackTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		userID, _ := strconv.ParseUint(c.GetHeader("X-User-ID"), 10, 64)
		role := models.Role(strings.TrimSpace(c.GetHeader("X-User-Role")))
		if role == "" {
			role = models.RoleParticipant
		}
		c.Set("user_id", uint(userID))
		c.Set("role", role)
		c.Next()
	})

	handler := &FeedbackHandler{DB: db}
	router.POST("/api/feedback", handler.CreateFeedback)
	router.GET("/api/admin/feedback", func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != models.RoleAdmin && role != models.RoleOrg {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		handler.ListFeedback(c)
	})
	return router
}

func seedFeedbackUser(t *testing.T, db *gorm.DB, email string, role models.Role, fullName string) models.User {
	t.Helper()

	user := models.User{
		Email:        email,
		PasswordHash: "hash",
		Role:         role,
		UserType:     models.UserTypeOffline,
		Profile: models.Profile{
			FullName:     fullName,
			Organization: "Организация",
			Position:     "Докладчик",
			ConsentGiven: true,
		},
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func performFeedbackJSONRequest(
	t *testing.T,
	router *gin.Engine,
	method, path string,
	payload any,
	user models.User,
) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", strconv.FormatUint(uint64(user.ID), 10))
	req.Header.Set("X-User-Role", string(user.Role))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestCreateFeedback(t *testing.T) {
	db := newFeedbackTestDB(t)
	router := newFeedbackTestRouter(db)
	user := seedFeedbackUser(t, db, "participant@example.com", models.RoleParticipant, "Мария Иванова")

	recorder := performFeedbackJSONRequest(t, router, http.MethodPost, "/api/feedback", map[string]any{
		"rating":  5,
		"comment": "  Спасибо за удобную программу и навигацию.  ",
	}, user)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var response models.Feedback
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Comment != "Спасибо за удобную программу и навигацию." {
		t.Fatalf("expected trimmed comment, got %q", response.Comment)
	}
	if response.UserID != user.ID {
		t.Fatalf("expected user id %d, got %d", user.ID, response.UserID)
	}
}

func TestCreateFeedbackRejectsInvalidPayload(t *testing.T) {
	db := newFeedbackTestDB(t)
	router := newFeedbackTestRouter(db)
	user := seedFeedbackUser(t, db, "participant@example.com", models.RoleParticipant, "Мария Иванова")

	recorder := performFeedbackJSONRequest(t, router, http.MethodPost, "/api/feedback", map[string]any{
		"rating":  4,
		"comment": "   ",
	}, user)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "comment is required") {
		t.Fatalf("expected validation error, got %s", recorder.Body.String())
	}
}

func TestListFeedbackIncludesAuthorContext(t *testing.T) {
	db := newFeedbackTestDB(t)
	router := newFeedbackTestRouter(db)
	admin := seedFeedbackUser(t, db, "admin@example.com", models.RoleAdmin, "Администратор")
	participant := seedFeedbackUser(t, db, "participant@example.com", models.RoleParticipant, "Мария Иванова")

	if err := db.Create(&models.Feedback{
		UserID:  participant.ID,
		Rating:  4,
		Comment: "Добавьте больше времени на обсуждение после докладов.",
	}).Error; err != nil {
		t.Fatalf("create feedback: %v", err)
	}

	recorder := performFeedbackJSONRequest(t, router, http.MethodGet, "/api/admin/feedback", map[string]any{}, admin)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response []feedbackEntry
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(response) != 1 {
		t.Fatalf("expected 1 feedback item, got %d", len(response))
	}
	if response[0].UserName != "Мария Иванова" {
		t.Fatalf("expected user name %q, got %q", "Мария Иванова", response[0].UserName)
	}
	if response[0].UserEmail != "participant@example.com" {
		t.Fatalf("expected participant email, got %q", response[0].UserEmail)
	}
	if response[0].CreatedAt == "" {
		t.Fatalf("expected created_at to be set")
	}
}
