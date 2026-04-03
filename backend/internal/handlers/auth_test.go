package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newAuthTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	testDBName := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", testDBName)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Profile{}, &models.Section{}, &models.ConsentLog{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newRegisterTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &AuthHandler{DB: db, JWTSecret: "test-secret"}
	router.POST("/register", handler.Register)
	return router
}

func seedSection(t *testing.T, db *gorm.DB, room string) models.Section {
	t.Helper()

	section := models.Section{Title: "Тестовая секция", Room: room}
	if err := db.Create(&section).Error; err != nil {
		t.Fatalf("create section: %v", err)
	}
	return section
}

func performRegisterRequest(t *testing.T, router *gin.Engine, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "auth-test")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestRegisterAllowsSectionWithoutRoom(t *testing.T) {
	db := newAuthTestDB(t)
	router := newRegisterTestRouter(db)
	section := seedSection(t, db, "")

	recorder := performRegisterRequest(t, router, map[string]any{
		"email":                 "without-room@example.com",
		"password":              "secret123",
		"user_type":             models.UserTypeOffline,
		"full_name":             "Иван Иванов",
		"organization":          "ВУЗ",
		"position":              "Доцент",
		"city":                  "Москва",
		"degree":                "Кандидат наук",
		"section_id":            section.ID,
		"talk_title":            "Цифровая трансформация конференций",
		"phone":                 "+79990000000",
		"consent_personal_data": true,
		"consent_publication":   true,
		"consent_version":       "registration-consent-v1",
	})

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var user models.User
	if err := db.Preload("Profile").Where("email = ?", "without-room@example.com").First(&user).Error; err != nil {
		t.Fatalf("load created user: %v", err)
	}
	if user.Profile.SectionID == nil || *user.Profile.SectionID != section.ID {
		t.Fatalf("expected profile section %d, got %#v", section.ID, user.Profile.SectionID)
	}
	if !user.Profile.ConsentGiven {
		t.Fatalf("expected consent_given compatibility field to be true")
	}
}

func TestRegisterRequiresExplicitConsents(t *testing.T) {
	db := newAuthTestDB(t)
	router := newRegisterTestRouter(db)
	section := seedSection(t, db, "Аудитория 101")

	testCases := []struct {
		name                string
		consentPersonalData bool
		consentPublication  bool
	}{
		{
			name:                "personal data consent missing",
			consentPersonalData: false,
			consentPublication:  true,
		},
		{
			name:                "publication consent missing",
			consentPersonalData: true,
			consentPublication:  false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := performRegisterRequest(t, router, map[string]any{
				"email":                 tc.name + "@example.com",
				"password":              "secret123",
				"full_name":             "Пользователь",
				"section_id":            section.ID,
				"talk_title":            "Тестовый доклад",
				"consent_personal_data": tc.consentPersonalData,
				"consent_publication":   tc.consentPublication,
				"consent_version":       "registration-consent-v1",
			})

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestRegisterLogsConsentVersion(t *testing.T) {
	db := newAuthTestDB(t)
	router := newRegisterTestRouter(db)
	section := seedSection(t, db, "Аудитория 102")
	version := "registration-consent-v2"

	recorder := performRegisterRequest(t, router, map[string]any{
		"email":                 "consents@example.com",
		"password":              "secret123",
		"full_name":             "Мария Петрова",
		"section_id":            section.ID,
		"talk_title":            "Проверка версионного consent",
		"consent_personal_data": true,
		"consent_publication":   true,
		"consent_version":       version,
	})

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var logs []models.ConsentLog
	if err := db.Order("consent_type asc").Find(&logs).Error; err != nil {
		t.Fatalf("load consent logs: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("expected 2 consent logs, got %d", len(logs))
	}

	expected := map[string]string{
		models.ConsentTypePersonalData: "/personal-data",
		models.ConsentTypePublication:  "/consent-authors",
	}
	for _, log := range logs {
		if log.ConsentVersion != version {
			t.Fatalf("expected consent version %q, got %q", version, log.ConsentVersion)
		}
		expectedURL, ok := expected[log.ConsentType]
		if !ok {
			t.Fatalf("unexpected consent type %q", log.ConsentType)
		}
		if log.ConsentURL != expectedURL {
			t.Fatalf("expected consent url %q for type %q, got %q", expectedURL, log.ConsentType, log.ConsentURL)
		}
	}
}
