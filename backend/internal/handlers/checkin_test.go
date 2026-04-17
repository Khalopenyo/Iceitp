package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newCheckInTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Profile{},
		&models.Section{},
		&models.Conference{},
		&models.CheckIn{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newCheckInTestRouter(db *gorm.DB, secret string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &CheckInHandler{DB: db, JWTSecret: secret}
	router.POST("/api/checkin/scan", handler.ScanBadge)
	router.POST("/api/admin/checkin/verify", func(c *gin.Context) {
		userID, _ := strconv.ParseUint(c.GetHeader("X-User-ID"), 10, 64)
		c.Set("user_id", uint(userID))
		handler.VerifyBadge(c)
	})
	return router
}

func seedCheckInConference(t *testing.T, db *gorm.DB) models.Conference {
	t.Helper()

	conf := models.Conference{
		Title:    "Тестовая конференция",
		Status:   models.ConferenceStatusLive,
		StartsAt: time.Date(2026, time.April, 24, 10, 0, 0, 0, time.UTC),
		EndsAt:   time.Date(2026, time.April, 25, 18, 0, 0, 0, time.UTC),
	}
	if err := db.Create(&conf).Error; err != nil {
		t.Fatalf("create conference: %v", err)
	}
	return conf
}

func makeBadgeToken(t *testing.T, secret string, userID, conferenceID uint) string {
	t.Helper()

	claims := jwt.MapClaims{
		"type":          "badge",
		"user_id":       userID,
		"conference_id": conferenceID,
		"iat":           time.Now().Unix(),
		"exp":           time.Now().Add(72 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign badge token: %v", err)
	}
	return signed
}

func performCheckInRequest(t *testing.T, router *gin.Engine, path, token string, verifierID *uint) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(map[string]string{"token": token})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if verifierID != nil {
		req.Header.Set("X-User-ID", strconv.FormatUint(uint64(*verifierID), 10))
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestScanBadgeCreatesCheckInWithoutAuth(t *testing.T) {
	db := newCheckInTestDB(t)
	secret := "test-secret"
	router := newCheckInTestRouter(db, secret)
	section := seedSection(t, db, "Хайпарк")
	user := seedParticipant(t, db, "scan@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	conf := seedCheckInConference(t, db)
	token := makeBadgeToken(t, secret, user.ID, conf.ID)

	recorder := performCheckInRequest(t, router, "/api/checkin/scan", token, nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response checkInResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.AlreadyCheckedIn {
		t.Fatalf("expected first scan to create new check-in")
	}

	var checkIn models.CheckIn
	if err := db.Where("conference_id = ? AND user_id = ?", conf.ID, user.ID).First(&checkIn).Error; err != nil {
		t.Fatalf("load check-in: %v", err)
	}
	if checkIn.VerifiedByUserID != nil {
		t.Fatalf("expected public scan to keep verifier nil, got %#v", checkIn.VerifiedByUserID)
	}
	if checkIn.Source != "badge_qr_scan" {
		t.Fatalf("expected public scan source, got %q", checkIn.Source)
	}
}

func TestScanBadgeReturnsAlreadyCheckedInOnRepeat(t *testing.T) {
	db := newCheckInTestDB(t)
	secret := "test-secret"
	router := newCheckInTestRouter(db, secret)
	section := seedSection(t, db, "Хайпарк")
	user := seedParticipant(t, db, "repeat@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	conf := seedCheckInConference(t, db)
	token := makeBadgeToken(t, secret, user.ID, conf.ID)

	first := performCheckInRequest(t, router, "/api/checkin/scan", token, nil)
	if first.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, first.Code, first.Body.String())
	}

	second := performCheckInRequest(t, router, "/api/checkin/scan", token, nil)
	if second.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, second.Code, second.Body.String())
	}

	var response checkInResponse
	if err := json.Unmarshal(second.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal repeat response: %v", err)
	}
	if !response.AlreadyCheckedIn {
		t.Fatalf("expected repeat scan to report already checked in")
	}
}

func TestVerifyBadgeStoresVerifier(t *testing.T) {
	db := newCheckInTestDB(t)
	secret := "test-secret"
	router := newCheckInTestRouter(db, secret)
	section := seedSection(t, db, "Хайпарк")
	user := seedParticipant(t, db, "verify@example.com", models.UserTypeOffline, &section.ID, "Доклад")
	verifier := seedParticipant(t, db, "org@example.com", models.UserTypeOffline, &section.ID, "Организатор")
	if err := db.Model(&models.User{}).Where("id = ?", verifier.ID).Update("role", models.RoleOrg).Error; err != nil {
		t.Fatalf("update verifier role: %v", err)
	}
	conf := seedCheckInConference(t, db)
	token := makeBadgeToken(t, secret, user.ID, conf.ID)

	recorder := performCheckInRequest(t, router, "/api/admin/checkin/verify", token, &verifier.ID)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var checkIn models.CheckIn
	if err := db.Where("conference_id = ? AND user_id = ?", conf.ID, user.ID).First(&checkIn).Error; err != nil {
		t.Fatalf("load admin check-in: %v", err)
	}
	if checkIn.VerifiedByUserID == nil || *checkIn.VerifiedByUserID != verifier.ID {
		t.Fatalf("expected verifier %d, got %#v", verifier.ID, checkIn.VerifiedByUserID)
	}
	if checkIn.Source != "badge_qr_admin" {
		t.Fatalf("expected admin source, got %q", checkIn.Source)
	}
}
