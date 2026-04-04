package handlers

import (
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newDocumentsTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Profile{},
		&models.Section{},
		&models.Room{},
		&models.ProgramAssignment{},
		&models.Conference{},
		&models.CheckIn{},
		&models.Certificate{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newDocumentsTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		userID, _ := strconv.ParseUint(c.GetHeader("X-User-ID"), 10, 64)
		c.Set("user_id", uint(userID))
		c.Next()
	})

	handler := &DocumentHandler{DB: db, JWTSecret: "test-secret"}
	router.GET("/api/documents/status", handler.DocumentStatus)
	return router
}

func seedConferenceRecord(t *testing.T, db *gorm.DB, status models.ConferenceStatus, proceedingsURL string) models.Conference {
	t.Helper()

	conf := models.Conference{
		Title:          "Тестовая конференция",
		Status:         status,
		ProceedingsURL: proceedingsURL,
		StartsAt:       time.Date(2026, time.April, 24, 10, 0, 0, 0, time.UTC),
		EndsAt:         time.Date(2026, time.April, 25, 18, 0, 0, 0, time.UTC),
	}
	if err := db.Create(&conf).Error; err != nil {
		t.Fatalf("create conference: %v", err)
	}
	return conf
}

func performDocumentsRequest(t *testing.T, router *gin.Engine, path string, user models.User) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-User-ID", strconv.FormatUint(uint64(user.ID), 10))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestDocumentStatusReflectsProgramAndProceedingsState(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 401")
	user := seedParticipant(t, db, "participant@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")

	recorder := performDocumentsRequest(t, router, "/api/documents/status", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response documentStatusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.PersonalProgram.Status != documentStatusBlocked {
		t.Fatalf("expected blocked personal program, got %q", response.PersonalProgram.Status)
	}
	if response.Proceedings.Status != documentStatusBlocked {
		t.Fatalf("expected blocked proceedings, got %q", response.Proceedings.Status)
	}
	if !strings.Contains(response.Proceedings.Message, "после завершения") {
		t.Fatalf("unexpected proceedings message %q", response.Proceedings.Message)
	}

	startsAt := time.Date(2026, time.April, 24, 11, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(45 * time.Minute)
	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOffline,
		SectionID: &section.ID,
		TalkTitle: "Утвержденный доклад",
		StartsAt:  &startsAt,
		EndsAt:    &endsAt,
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}
	if err := db.Model(&models.Conference{}).Where("id = ?", response.ConferenceID).Updates(map[string]any{
		"status":          models.ConferenceStatusFinished,
		"proceedings_url": "https://example.com/proceedings.pdf",
	}).Error; err != nil {
		t.Fatalf("update conference: %v", err)
	}

	recorder = performDocumentsRequest(t, router, "/api/documents/status", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.PersonalProgram.Status != documentStatusAvailable {
		t.Fatalf("expected available personal program, got %q", response.PersonalProgram.Status)
	}
	if response.Proceedings.Status != documentStatusAvailable {
		t.Fatalf("expected available proceedings, got %q", response.Proceedings.Status)
	}
	if response.Proceedings.URL != "https://example.com/proceedings.pdf" {
		t.Fatalf("unexpected proceedings url %q", response.Proceedings.URL)
	}
}

func TestDocumentStatusBadgeAvailabilityByAttendanceMode(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 402")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	offlineUser := seedParticipant(t, db, "offline@example.com", models.UserTypeOffline, &section.ID, "Офлайн доклад")
	onlineUser := seedParticipant(t, db, "online@example.com", models.UserTypeOnline, &section.ID, "Онлайн доклад")

	offlineRecorder := performDocumentsRequest(t, router, "/api/documents/status", offlineUser)
	if offlineRecorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, offlineRecorder.Code, offlineRecorder.Body.String())
	}
	var offlineResponse documentStatusResponse
	if err := json.Unmarshal(offlineRecorder.Body.Bytes(), &offlineResponse); err != nil {
		t.Fatalf("unmarshal offline response: %v", err)
	}
	if offlineResponse.Badge.Status != documentStatusAvailable {
		t.Fatalf("expected offline badge to be available, got %q", offlineResponse.Badge.Status)
	}

	onlineRecorder := performDocumentsRequest(t, router, "/api/documents/status", onlineUser)
	if onlineRecorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, onlineRecorder.Code, onlineRecorder.Body.String())
	}
	var onlineResponse documentStatusResponse
	if err := json.Unmarshal(onlineRecorder.Body.Bytes(), &onlineResponse); err != nil {
		t.Fatalf("unmarshal online response: %v", err)
	}
	if onlineResponse.Badge.Status != documentStatusNotApplicable {
		t.Fatalf("expected online badge to be not applicable, got %q", onlineResponse.Badge.Status)
	}
	if !strings.Contains(onlineResponse.Badge.Message, "только офлайн") {
		t.Fatalf("unexpected online badge message %q", onlineResponse.Badge.Message)
	}
}
