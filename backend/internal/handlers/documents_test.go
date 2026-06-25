package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
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
	router.GET("/api/certificates/:number", handler.VerifyCertificate)
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
	if disposition := first.Header().Get("Content-Disposition"); !strings.HasPrefix(disposition, "attachment;") {
		t.Fatalf("expected attachment disposition by default, got %q", disposition)
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

func TestCertificatePDFSupportsInlineDisposition(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 404B")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "inline-certificate@example.com", models.UserTypeOnline, &section.ID, "Онлайн доклад")

	recorder := performDocumentsRequest(t, router, "/api/documents/certificate?disposition=inline", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if disposition := recorder.Header().Get("Content-Disposition"); !strings.HasPrefix(disposition, "inline;") {
		t.Fatalf("expected inline disposition, got %q", disposition)
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

// TestCrossTenantFullProgramPDFIsolation proves the "full program" PDF is scoped
// to the requesting tenant's conference: an organization whose conference has no
// program assignments must get the "pending" block (409) even when another
// organization has an approved program — it must never render the other tenant's
// program. During tests fullProgramPDFPath() resolves to "" (the static asset is
// not on the relative paths the test working directory exposes), so the handler
// takes the authoritative DB read-model path that carried the leak.
func TestCrossTenantFullProgramPDFIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:doc_full_iso?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Organization{}, &models.Conference{}, &models.User{}, &models.Profile{},
		&models.Section{}, &models.Room{}, &models.ProgramAssignment{}, &models.Certificate{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}

	orgA := models.Organization{Slug: "alpha", DisplayName: "Alpha"}
	orgB := models.Organization{Slug: "beta", DisplayName: "Beta"}
	mustCreateH(t, db, &orgA)
	mustCreateH(t, db, &orgB)

	confA := models.Conference{Title: "Conf A", Status: models.ConferenceStatusLive, OrganizationID: &orgA.ID}
	confB := models.Conference{Title: "Conf B", Status: models.ConferenceStatusLive, OrganizationID: &orgB.ID}
	mustCreateH(t, db, &confA)
	mustCreateH(t, db, &confB)

	userA := models.User{Email: "a@alpha.test", Role: models.RoleParticipant, UserType: models.UserTypeOffline,
		OrganizationID: &orgA.ID, Profile: models.Profile{FullName: "Alpha Speaker"}}
	userB := models.User{Email: "b@beta.test", Role: models.RoleParticipant, UserType: models.UserTypeOffline,
		OrganizationID: &orgB.ID, Profile: models.Profile{FullName: "Beta Speaker"}}
	mustCreateH(t, db, &userA)
	mustCreateH(t, db, &userB)

	sectionA := models.Section{Title: "Sec A", Room: "Room A", ConferenceID: &confA.ID}
	mustCreateH(t, db, &sectionA)

	// Only org A has an approved (section-linked) program. Org B has none.
	mustCreateH(t, db, &models.ProgramAssignment{
		UserID: userA.ID, UserType: models.UserTypeOffline, SectionID: &sectionA.ID,
		TalkTitle: "Talk A", ConferenceID: &confA.ID,
	})

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.Use(func(c *gin.Context) {
		userID, _ := strconv.ParseUint(c.GetHeader("X-User-ID"), 10, 64)
		c.Set("user_id", uint(userID))
		c.Next()
	})
	handler := &DocumentHandler{DB: db, JWTSecret: "test-secret"}
	r.GET("/api/documents/program", handler.ProgramPDF)

	fullProgramReq := func(host string, userID uint) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "http://"+host+"/api/documents/program?type=full", nil)
		req.Header.Set("X-User-ID", strconv.FormatUint(uint64(userID), 10))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// Org B's conference has no program, so its full-program PDF must be blocked
	// as pending — never borrowing org A's approved program.
	beta := fullProgramReq("beta.platform.ru", userB.ID)
	if beta.Code != http.StatusConflict {
		t.Fatalf("beta full program -> %d, want 409 (leak of another tenant's program?): %s", beta.Code, beta.Body.String())
	}
	if !strings.Contains(beta.Body.String(), "Официальная программа") {
		t.Fatalf("beta full program unexpected body %s", beta.Body.String())
	}

	// Sanity: org A still renders its own full-program PDF (scoping is isolation,
	// not a blanket break).
	alpha := fullProgramReq("alpha.platform.ru", userA.ID)
	if alpha.Code != http.StatusOK {
		t.Fatalf("alpha full program -> %d, want 200: %s", alpha.Code, alpha.Body.String())
	}
	if contentType := alpha.Header().Get("Content-Type"); !strings.Contains(contentType, "application/pdf") {
		t.Fatalf("alpha full program expected pdf content type, got %q", contentType)
	}
	if alpha.Body.Len() == 0 {
		t.Fatalf("alpha full program expected a non-empty pdf body")
	}
}

// newCertNumberPattern matches the post-fix issued number: a human-readable
// sequential body plus a 6-char crypto-random base32 suffix (alphabet A–Z, 2–7).
var newCertNumberPattern = regexp.MustCompile(`^CERT-\d{4}-\d{6}-[A-Z2-7]{6}$`)

// issueCertificateNumber drives the certificate PDF endpoint (which mints the
// certificate via ensureCertificate) and returns the stored number.
func issueCertificateNumber(t *testing.T, db *gorm.DB, router *gin.Engine, conf models.Conference, user models.User) string {
	t.Helper()

	recorder := performDocumentsRequest(t, router, "/api/documents/certificate", user)
	if recorder.Code != http.StatusOK {
		t.Fatalf("issue certificate: expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	var cert models.Certificate
	if err := db.Where("conference_id = ? AND user_id = ?", conf.ID, user.ID).First(&cert).Error; err != nil {
		t.Fatalf("load issued certificate: %v", err)
	}
	return cert.Number
}

// TestCertificateNumberIsUnpredictable proves new certificate numbers carry an
// unguessable crypto-random suffix (so sequential ids can't be enumerated to
// harvest holders) and that two issued numbers do not share a suffix.
func TestCertificateNumberIsUnpredictable(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 408")
	conf := seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	userA := seedParticipant(t, db, "cert-suffix-a@example.com", models.UserTypeOnline, &section.ID, "Доклад A")
	userB := seedParticipant(t, db, "cert-suffix-b@example.com", models.UserTypeOnline, &section.ID, "Доклад B")

	numberA := issueCertificateNumber(t, db, router, conf, userA)
	numberB := issueCertificateNumber(t, db, router, conf, userB)

	if !newCertNumberPattern.MatchString(numberA) {
		t.Fatalf("number %q does not match expected unpredictable format", numberA)
	}
	if !newCertNumberPattern.MatchString(numberB) {
		t.Fatalf("number %q does not match expected unpredictable format", numberB)
	}
	suffixA := numberA[strings.LastIndexByte(numberA, '-')+1:]
	suffixB := numberB[strings.LastIndexByte(numberB, '-')+1:]
	if suffixA == suffixB {
		t.Fatalf("expected distinct random suffixes, both were %q", suffixA)
	}
}

// TestVerifyCertificateResolvesLegacyAndNewNumbers proves the public verify still
// resolves both already-issued legacy numbers (no suffix — backward compatibility)
// and the new unpredictable numbers, and that it withholds internal identifiers.
func TestVerifyCertificateResolvesLegacyAndNewNumbers(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 409")
	conf := seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "verify-new@example.com", models.UserTypeOnline, &section.ID, "Доклад")
	// A second holder carries the legacy number — Certificate is unique per
	// (conference, user), so the legacy row needs its own user.
	legacyUser := seedParticipant(t, db, "verify-legacy@example.com", models.UserTypeOnline, &section.ID, "Доклад")

	// New-format number minted by the handler.
	newNumber := issueCertificateNumber(t, db, router, conf, user)

	// Legacy-format number written directly, as if issued before this change.
	legacy := models.Certificate{
		ConferenceID: conf.ID,
		UserID:       legacyUser.ID,
		Number:       "CERT-2025-000007",
		IssuedAt:     time.Date(2025, time.March, 1, 9, 0, 0, 0, time.UTC),
	}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy certificate: %v", err)
	}

	for _, number := range []string{newNumber, legacy.Number} {
		recorder := performDocumentsRequest(t, router, "/api/certificates/"+number, user)
		if recorder.Code != http.StatusOK {
			t.Fatalf("verify %q: expected status %d, got %d: %s", number, http.StatusOK, recorder.Code, recorder.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal verify response: %v", err)
		}
		if payload["number"] != number {
			t.Fatalf("verify %q: response number %v", number, payload["number"])
		}
		if payload["status"] != "valid" {
			t.Fatalf("verify %q: expected valid status, got %v", number, payload["status"])
		}
		userObj, ok := payload["user"].(map[string]any)
		if !ok {
			t.Fatalf("verify %q: missing user object: %v", number, payload["user"])
		}
		if userObj["full_name"] != "Участник" {
			t.Fatalf("verify %q: unexpected full_name %v", number, userObj["full_name"])
		}
		if _, leaked := userObj["id"]; leaked {
			t.Fatalf("verify %q: public response must not expose internal user id", number)
		}
		confObj, ok := payload["conference"].(map[string]any)
		if !ok {
			t.Fatalf("verify %q: missing conference object: %v", number, payload["conference"])
		}
		if _, leaked := confObj["id"]; leaked {
			t.Fatalf("verify %q: public response must not expose internal conference id", number)
		}
	}
}

// TestVerifyCertificateUnknownNumberIsNotFound guards the 404 path for a number
// that does not exist (the enumeration attempt the unpredictable suffix defeats).
func TestVerifyCertificateUnknownNumberIsNotFound(t *testing.T) {
	db := newDocumentsTestDB(t)
	router := newDocumentsTestRouter(db)
	section := seedSection(t, db, "Аудитория 410")
	seedConferenceRecord(t, db, models.ConferenceStatusLive, "")
	user := seedParticipant(t, db, "verify-missing@example.com", models.UserTypeOnline, &section.ID, "Доклад")

	recorder := performDocumentsRequest(t, router, "/api/certificates/CERT-2026-000001", user)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status %d for unknown number, got %d: %s", http.StatusNotFound, recorder.Code, recorder.Body.String())
	}
}

// TestVerifyCertificateIsTenantScoped proves the public verify resolves a
// certificate only on the organization that issued it: org B's public page must
// not confirm — nor disclose the holder of — a certificate issued under org A,
// even though Certificate.Number is globally unique. Exercises the org-scoping
// subquery (skipped by the other handler tests, which run without the resolver).
func TestVerifyCertificateIsTenantScoped(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:cert_verify_iso?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Organization{}, &models.Conference{}, &models.User{}, &models.Profile{},
		&models.Section{}, &models.Certificate{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}

	orgA := models.Organization{Slug: "alpha", DisplayName: "Alpha"}
	orgB := models.Organization{Slug: "beta", DisplayName: "Beta"}
	mustCreateH(t, db, &orgA)
	mustCreateH(t, db, &orgB)

	confA := models.Conference{Title: "Conf A", Status: models.ConferenceStatusFinished, OrganizationID: &orgA.ID}
	confB := models.Conference{Title: "Conf B", Status: models.ConferenceStatusFinished, OrganizationID: &orgB.ID}
	mustCreateH(t, db, &confA)
	mustCreateH(t, db, &confB)

	userA := models.User{Email: "holder@alpha.test", Role: models.RoleParticipant, UserType: models.UserTypeOnline,
		OrganizationID: &orgA.ID, Profile: models.Profile{FullName: "Alpha Holder"}}
	mustCreateH(t, db, &userA)

	cert := models.Certificate{ConferenceID: confA.ID, UserID: userA.ID, Number: "CERT-2026-000042-ABC234"}
	mustCreateH(t, db, &cert)

	r := gin.New()
	r.Use(tenant.Middleware(db))
	handler := &DocumentHandler{DB: db, JWTSecret: "test-secret"}
	r.GET("/api/certificates/:number", handler.VerifyCertificate)

	verify := func(host string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "http://"+host+"/api/certificates/"+cert.Number, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// Issuing org resolves the certificate.
	alpha := verify("alpha.platform.ru")
	if alpha.Code != http.StatusOK {
		t.Fatalf("alpha verify -> %d, want 200: %s", alpha.Code, alpha.Body.String())
	}

	// Another tenant must get a 404 — no cross-tenant disclosure of the holder.
	beta := verify("beta.platform.ru")
	if beta.Code != http.StatusNotFound {
		t.Fatalf("beta verify -> %d, want 404 (cross-tenant leak?): %s", beta.Code, beta.Body.String())
	}
	if strings.Contains(beta.Body.String(), "Alpha Holder") {
		t.Fatalf("beta verify leaked the holder name: %s", beta.Body.String())
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
