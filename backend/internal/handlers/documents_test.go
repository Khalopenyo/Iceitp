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
	router.GET("/api/documents/program", handler.ProgramPDF)
	router.GET("/api/documents/badge", handler.BadgePDF)
	router.GET("/api/admin/users/:id/badge", handler.AdminBadgePDF)
	router.GET("/api/documents/certificate", handler.CertificatePDF)
	router.GET("/api/documents/proceedings", handler.Proceedings)
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
	if response.Certificate.Status != documentStatusAvailable {
		t.Fatalf("expected available certificate, got %q", response.Certificate.Status)
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
	if response.Certificate.Status != documentStatusAvailable {
		t.Fatalf("expected available certificate after conference finish, got %q", response.Certificate.Status)
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
	if offlineResponse.Badge.Status != documentStatusBlocked {
		t.Fatalf("expected offline badge to be blocked before admin preparation, got %q", offlineResponse.Badge.Status)
	}
	if !strings.Contains(offlineResponse.Badge.Message, "админке") {
		t.Fatalf("unexpected offline badge message %q", offlineResponse.Badge.Message)
	}

	if err := db.Model(&models.User{}).Where("id = ?", offlineUser.ID).Update("badge_issued", true).Error; err != nil {
		t.Fatalf("enable badge: %v", err)
	}

	offlineRecorder = performDocumentsRequest(t, router, "/api/documents/status", offlineUser)
	if offlineRecorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, offlineRecorder.Code, offlineRecorder.Body.String())
	}
	if err := json.Unmarshal(offlineRecorder.Body.Bytes(), &offlineResponse); err != nil {
		t.Fatalf("unmarshal offline response after enable: %v", err)
	}
	if offlineResponse.Badge.Status != documentStatusAvailable {
		t.Fatalf("expected offline badge to be available after admin preparation, got %q", offlineResponse.Badge.Status)
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

func TestBadgePDFRejectsOnlineParticipant(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 403")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "online-badge@example.com", models.UserTypeOnline, &section.ID, "Онлайн доклад")

	recorder := performDocumentsRequest(t, router, "/api/documents/badge", user)
	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "только офлайн") {
		t.Fatalf("unexpected body %s", recorder.Body.String())
	}
}

func TestBadgePDFRequiresAdminPreparationForOfflineParticipant(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 403A")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "offline-badge@example.com", models.UserTypeOffline, &section.ID, "Офлайн доклад")

	recorder := performDocumentsRequest(t, router, "/api/documents/badge", user)
	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "админке") {
		t.Fatalf("unexpected body %s", recorder.Body.String())
	}

	if err := db.Model(&models.User{}).Where("id = ?", user.ID).Update("badge_issued", true).Error; err != nil {
		t.Fatalf("enable badge: %v", err)
	}

	recorder = performDocumentsRequest(t, router, "/api/documents/badge", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.Contains(contentType, "application/pdf") {
		t.Fatalf("expected pdf content type, got %q", contentType)
	}
}

func TestAdminBadgePDFAllowsOfflinePreviewWithoutParticipantAccess(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 403B")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "admin-offline-badge@example.com", models.UserTypeOffline, &section.ID, "Офлайн доклад")

	recorder := performDocumentsRequest(t, router, "/api/admin/users/"+strconv.FormatUint(uint64(user.ID), 10)+"/badge", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.Contains(contentType, "application/pdf") {
		t.Fatalf("expected pdf content type, got %q", contentType)
	}
}

func TestAdminBadgePDFRejectsOnlineParticipant(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 403C")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "admin-online-badge@example.com", models.UserTypeOnline, &section.ID, "Онлайн доклад")

	recorder := performDocumentsRequest(t, router, "/api/admin/users/"+strconv.FormatUint(uint64(user.ID), 10)+"/badge", user)
	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "только офлайн") {
		t.Fatalf("unexpected body %s", recorder.Body.String())
	}
}

func TestCertificatePDFAllowsEligibleOnlineParticipant(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 404")
	conf := seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "online-certificate@example.com", models.UserTypeOnline, &section.ID, "Онлайн доклад")

	first := performDocumentsRequest(t, router, "/api/documents/certificate", user)
	if first.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, first.Code, first.Body.String())
	}
	if contentType := first.Header().Get("Content-Type"); !strings.Contains(contentType, "application/pdf") {
		t.Fatalf("expected pdf content type, got %q", contentType)
	}

	second := performDocumentsRequest(t, router, "/api/documents/certificate", user)
	if second.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, second.Code, second.Body.String())
	}

	var certs []models.Certificate
	if err := db.Where("conference_id = ? AND user_id = ?", conf.ID, user.ID).Find(&certs).Error; err != nil {
		t.Fatalf("load certificates: %v", err)
	}
	if len(certs) != 1 {
		t.Fatalf("expected exactly one certificate row, got %d", len(certs))
	}
}

func TestProceedingsEndpointBlocksBeforeConferenceFinish(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 405")
	user := seedParticipant(t, db, "proceedings@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "https://example.com/proceedings.pdf")

	recorder := performDocumentsRequest(t, router, "/api/documents/proceedings", user)
	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "после завершения") {
		t.Fatalf("unexpected body %s", recorder.Body.String())
	}
}

func TestProgramPDFRejectsPendingPersonalProgram(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 406")
	user := seedParticipant(t, db, "program-pending@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")

	recorder := performDocumentsRequest(t, router, "/api/documents/program?type=personal", user)
	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "Официальная программа") {
		t.Fatalf("unexpected body %s", recorder.Body.String())
	}
}

func TestProgramPDFFullServesStaticAssetWhenAvailable(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 407")
	user := seedParticipant(t, db, "program-full@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")

	if fullProgramPDFPath() == "" {
		t.Skip("static full program asset is not available")
	}

	recorder := performDocumentsRequest(t, router, "/api/documents/program?type=full", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.Contains(contentType, "application/pdf") {
		t.Fatalf("expected pdf content type, got %q", contentType)
	}
	if bodyLen := recorder.Body.Len(); bodyLen == 0 {
		t.Fatalf("expected static pdf body, got empty response")
	}
}
