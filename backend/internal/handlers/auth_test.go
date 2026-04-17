package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/sms"
	"context"
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
	if err := db.AutoMigrate(&models.User{}, &models.Profile{}, &models.Section{}, &models.ConsentLog{}, &models.PhoneAuthCode{}, &models.RegistrationAttempt{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newRegisterTestRouter(db *gorm.DB, sender sms.AuthCodeSender) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &AuthHandler{DB: db, JWTSecret: "test-secret", AuthCodeSender: sender}
	router.POST("/register", handler.RequestRegistrationCode)
	router.POST("/register/request-code", handler.RequestRegistrationCode)
	router.POST("/register/verify", handler.VerifyRegistrationCode)
	return router
}

type stubAuthCodeSender struct {
	messages []sms.AuthCodeMessage
}

func (s *stubAuthCodeSender) SendAuthCode(_ context.Context, message sms.AuthCodeMessage) (sms.AuthCodeDelivery, error) {
	s.messages = append(s.messages, message)
	return sms.AuthCodeDelivery{RequestID: "voice-request-id"}, nil
}

func newPhoneAuthTestRouter(db *gorm.DB, sender sms.AuthCodeSender) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &AuthHandler{
		DB:             db,
		JWTSecret:      "test-secret",
		AuthCodeSender: sender,
	}
	router.POST("/request", handler.RequestPhoneCode)
	router.POST("/verify", handler.VerifyPhoneCode)
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

func performPhoneAuthRequest(t *testing.T, router *gin.Engine, path string, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func seedUserWithPhone(t *testing.T, db *gorm.DB, email, phone string) models.User {
	t.Helper()

	passwordHash, err := hashPassword("secret123")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	user := models.User{
		Email:        email,
		PasswordHash: passwordHash,
		Role:         models.RoleParticipant,
		UserType:     models.UserTypeOffline,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	profile := models.Profile{
		UserID:   user.ID,
		FullName: "Тестовый пользователь",
		Phone:    phone,
	}
	if err := db.Create(&profile).Error; err != nil {
		t.Fatalf("create profile: %v", err)
	}
	user.Profile = profile
	return user
}

func TestRegisterAllowsSectionWithoutRoom(t *testing.T) {
	db := newAuthTestDB(t)
	sender := &stubAuthCodeSender{}
	router := newRegisterTestRouter(db, sender)
	section := seedSection(t, db, "")

	requestRecorder := performRegisterRequest(t, router, map[string]any{
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

	if requestRecorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, requestRecorder.Code, requestRecorder.Body.String())
	}

	var requestResponse struct {
		VerificationToken string `json:"verification_token"`
	}
	if err := json.Unmarshal(requestRecorder.Body.Bytes(), &requestResponse); err != nil {
		t.Fatalf("unmarshal request response: %v", err)
	}

	verifyRecorder := performPhoneAuthRequest(t, router, "/register/verify", map[string]any{
		"verification_token": requestResponse.VerificationToken,
		"code":               sender.messages[0].Code,
	})
	if verifyRecorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, verifyRecorder.Code, verifyRecorder.Body.String())
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
	router := newRegisterTestRouter(db, &stubAuthCodeSender{})
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
				"phone":                 "+79990001122",
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
	sender := &stubAuthCodeSender{}
	router := newRegisterTestRouter(db, sender)
	section := seedSection(t, db, "Аудитория 102")
	version := "registration-consent-v2"

	requestRecorder := performRegisterRequest(t, router, map[string]any{
		"email":                 "consents@example.com",
		"password":              "secret123",
		"full_name":             "Мария Петрова",
		"section_id":            section.ID,
		"talk_title":            "Проверка версионного consent",
		"phone":                 "+79990002233",
		"consent_personal_data": true,
		"consent_publication":   true,
		"consent_version":       version,
	})

	if requestRecorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, requestRecorder.Code, requestRecorder.Body.String())
	}

	var requestResponse struct {
		VerificationToken string `json:"verification_token"`
	}
	if err := json.Unmarshal(requestRecorder.Body.Bytes(), &requestResponse); err != nil {
		t.Fatalf("unmarshal request response: %v", err)
	}

	verifyRecorder := performPhoneAuthRequest(t, router, "/register/verify", map[string]any{
		"verification_token": requestResponse.VerificationToken,
		"code":               sender.messages[0].Code,
	})
	if verifyRecorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, verifyRecorder.Code, verifyRecorder.Body.String())
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

func TestRegistrationRequestCodeCreatesPendingAttempt(t *testing.T) {
	db := newAuthTestDB(t)
	section := seedSection(t, db, "Аудитория 103")
	sender := &stubAuthCodeSender{}
	router := gin.New()
	handler := &AuthHandler{DB: db, JWTSecret: "test-secret", AuthCodeSender: sender}
	router.POST("/register/request-code", handler.RequestRegistrationCode)

	recorder := performPhoneAuthRequest(t, router, "/register/request-code", map[string]any{
		"email":                 "pending@example.com",
		"password":              "secret123",
		"user_type":             models.UserTypeOffline,
		"full_name":             "Иван Иванов",
		"organization":          "ВУЗ",
		"position":              "Доцент",
		"city":                  "Москва",
		"degree":                "Кандидат наук",
		"section_id":            section.ID,
		"talk_title":            "SMS регистрация",
		"phone":                 "+79998887766",
		"consent_personal_data": true,
		"consent_publication":   true,
		"consent_version":       "registration-consent-v1",
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected 1 sms auth message, got %d", len(sender.messages))
	}
	var attempts []models.RegistrationAttempt
	if err := db.Find(&attempts).Error; err != nil {
		t.Fatalf("load registration attempts: %v", err)
	}
	if len(attempts) != 1 {
		t.Fatalf("expected 1 registration attempt, got %d", len(attempts))
	}
}

func TestRegistrationVerifyCreatesUser(t *testing.T) {
	db := newAuthTestDB(t)
	section := seedSection(t, db, "Аудитория 104")
	sender := &stubAuthCodeSender{}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &AuthHandler{DB: db, JWTSecret: "test-secret", AuthCodeSender: sender}
	router.POST("/register/request-code", handler.RequestRegistrationCode)
	router.POST("/register/verify", handler.VerifyRegistrationCode)

	requestRecorder := performPhoneAuthRequest(t, router, "/register/request-code", map[string]any{
		"email":                 "verify-registration@example.com",
		"password":              "secret123",
		"user_type":             models.UserTypeOffline,
		"full_name":             "Петр Петров",
		"organization":          "ВУЗ",
		"position":              "Доцент",
		"city":                  "Москва",
		"degree":                "Кандидат наук",
		"section_id":            section.ID,
		"talk_title":            "Подтверждение регистрации",
		"phone":                 "+79991112233",
		"consent_personal_data": true,
		"consent_publication":   true,
		"consent_version":       "registration-consent-v1",
	})
	if requestRecorder.Code != http.StatusOK {
		t.Fatalf("expected request status %d, got %d: %s", http.StatusOK, requestRecorder.Code, requestRecorder.Body.String())
	}

	var requestResponse struct {
		VerificationToken string `json:"verification_token"`
	}
	if err := json.Unmarshal(requestRecorder.Body.Bytes(), &requestResponse); err != nil {
		t.Fatalf("unmarshal request response: %v", err)
	}

	verifyRecorder := performPhoneAuthRequest(t, router, "/register/verify", map[string]any{
		"verification_token": requestResponse.VerificationToken,
		"code":               sender.messages[0].Code,
	})
	if verifyRecorder.Code != http.StatusCreated {
		t.Fatalf("expected verify status %d, got %d: %s", http.StatusCreated, verifyRecorder.Code, verifyRecorder.Body.String())
	}

	var user models.User
	if err := db.Preload("Profile").Where("email = ?", "verify-registration@example.com").First(&user).Error; err != nil {
		t.Fatalf("expected registered user to be created: %v", err)
	}
	if user.Profile.Phone != "+79991112233" {
		t.Fatalf("expected normalized phone to be stored, got %s", user.Profile.Phone)
	}
}

func TestRequestPhoneCodeSendsSMSMessage(t *testing.T) {
	db := newAuthTestDB(t)
	sender := &stubAuthCodeSender{}
	router := newPhoneAuthTestRouter(db, sender)
	user := seedUserWithPhone(t, db, "phone@example.com", "+79991234567")

	recorder := performPhoneAuthRequest(t, router, "/request", map[string]any{
		"phone": "+7 (999) 123-45-67",
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected 1 auth code message, got %d", len(sender.messages))
	}
	if sender.messages[0].Phone != "79991234567" {
		t.Fatalf("expected normalized phone 79991234567, got %s", sender.messages[0].Phone)
	}
	if len(sender.messages[0].Code) != phoneAuthCodeDigits {
		t.Fatalf("expected %d-digit code, got %s", phoneAuthCodeDigits, sender.messages[0].Code)
	}

	var codes []models.PhoneAuthCode
	if err := db.Where("user_id = ?", user.ID).Find(&codes).Error; err != nil {
		t.Fatalf("load auth codes: %v", err)
	}
	if len(codes) != 1 {
		t.Fatalf("expected 1 auth code record, got %d", len(codes))
	}
	if codes[0].ProviderRequestID != "voice-request-id" {
		t.Fatalf("expected provider request id to be stored")
	}
}

func TestVerifyPhoneCodeReturnsJWT(t *testing.T) {
	db := newAuthTestDB(t)
	sender := &stubAuthCodeSender{}
	router := newPhoneAuthTestRouter(db, sender)
	_ = seedUserWithPhone(t, db, "verify@example.com", "+79990000000")

	requestRecorder := performPhoneAuthRequest(t, router, "/request", map[string]any{
		"phone": "+79990000000",
	})
	if requestRecorder.Code != http.StatusOK {
		t.Fatalf("expected request status %d, got %d: %s", http.StatusOK, requestRecorder.Code, requestRecorder.Body.String())
	}

	verifyRecorder := performPhoneAuthRequest(t, router, "/verify", map[string]any{
		"phone": "+79990000000",
		"code":  sender.messages[0].Code,
	})
	if verifyRecorder.Code != http.StatusOK {
		t.Fatalf("expected verify status %d, got %d: %s", http.StatusOK, verifyRecorder.Code, verifyRecorder.Body.String())
	}

	var response struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(verifyRecorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal verify response: %v", err)
	}
	if strings.TrimSpace(response.Token) == "" {
		t.Fatalf("expected JWT token in verify response")
	}

	var codes []models.PhoneAuthCode
	if err := db.Where("phone = ?", "79990000000").Find(&codes).Error; err != nil {
		t.Fatalf("load auth codes after verify: %v", err)
	}
	if len(codes) != 1 || codes[0].ConsumedAt == nil {
		t.Fatalf("expected auth code to be consumed after successful verify")
	}
}

func TestVerifyPhoneCodeRejectsInvalidCode(t *testing.T) {
	db := newAuthTestDB(t)
	sender := &stubAuthCodeSender{}
	router := newPhoneAuthTestRouter(db, sender)
	_ = seedUserWithPhone(t, db, "invalid-code@example.com", "+79995554433")

	requestRecorder := performPhoneAuthRequest(t, router, "/request", map[string]any{
		"phone": "+79995554433",
	})
	if requestRecorder.Code != http.StatusOK {
		t.Fatalf("expected request status %d, got %d: %s", http.StatusOK, requestRecorder.Code, requestRecorder.Body.String())
	}

	verifyRecorder := performPhoneAuthRequest(t, router, "/verify", map[string]any{
		"phone": "+79995554433",
		"code":  "00000",
	})
	if verifyRecorder.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid code status %d, got %d: %s", http.StatusBadRequest, verifyRecorder.Code, verifyRecorder.Body.String())
	}
}
