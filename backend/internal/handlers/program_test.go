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
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newProgramTestDB(t *testing.T) *gorm.DB {
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
		&models.ConsentLog{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newProgramTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &ProgramHandler{DB: db}
	router.GET("/admin/program", handler.ListProgram)
	router.PUT("/admin/program/:userID", handler.UpsertProgramAssignment)
	return router
}

func seedParticipant(t *testing.T, db *gorm.DB, email string, userType models.UserType, sectionID *uint, talkTitle string) models.User {
	t.Helper()

	user := models.User{
		Email:        email,
		PasswordHash: "hash",
		Role:         models.RoleParticipant,
		UserType:     userType,
		Profile: models.Profile{
			FullName:     "Участник",
			Organization: "Организация",
			Position:     "Докладчик",
			City:         "Москва",
			Degree:       "Кандидат наук",
			SectionID:    sectionID,
			TalkTitle:    talkTitle,
			Phone:        "+79990000000",
			ConsentGiven: true,
		},
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create participant: %v", err)
	}
	return user
}

func seedRoom(t *testing.T, db *gorm.DB, name string) models.Room {
	t.Helper()

	room := models.Room{Name: name, Floor: 1}
	if err := db.Create(&room).Error; err != nil {
		t.Fatalf("create room: %v", err)
	}
	return room
}

func performProgramRequest(t *testing.T, router *gin.Engine, method, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()

	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(encoded)
	}

	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestUpsertProgramAssignment(t *testing.T) {
	db := newProgramTestDB(t)
	router := newProgramTestRouter(db)
	section := seedSection(t, db, "Аудитория 201")
	room := seedRoom(t, db, "Зал 301")
	user := seedParticipant(t, db, "speaker@example.com", models.UserTypeOffline, &section.ID, "Черновой доклад")
	startsAt := time.Date(2026, time.April, 24, 11, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(90 * time.Minute)

	recorder := performProgramRequest(t, router, http.MethodPut, "/admin/program/"+jsonNumber(user.ID), map[string]any{
		"user_type":  models.UserTypeOnline,
		"section_id": section.ID,
		"talk_title": "Утвержденный доклад",
		"room_id":    room.ID,
		"starts_at":  startsAt.Format(time.RFC3339),
		"ends_at":    endsAt.Format(time.RFC3339),
		"join_url":   "https://meet.example.com/session-1",
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var assignment models.ProgramAssignment
	if err := db.Where("user_id = ?", user.ID).First(&assignment).Error; err != nil {
		t.Fatalf("load program assignment: %v", err)
	}
	if assignment.UserType != models.UserTypeOnline {
		t.Fatalf("expected user type %q, got %q", models.UserTypeOnline, assignment.UserType)
	}
	if assignment.RoomID == nil || *assignment.RoomID != room.ID {
		t.Fatalf("expected room id %d, got %#v", room.ID, assignment.RoomID)
	}
	if assignment.JoinURL != "https://meet.example.com/session-1" {
		t.Fatalf("unexpected join url %q", assignment.JoinURL)
	}
	if assignment.TalkTitle != "Утвержденный доклад" {
		t.Fatalf("unexpected talk title %q", assignment.TalkTitle)
	}
}

func TestUpsertProgramAssignmentRejectsInvalidJoinURL(t *testing.T) {
	db := newProgramTestDB(t)
	router := newProgramTestRouter(db)
	section := seedSection(t, db, "Аудитория 202")
	user := seedParticipant(t, db, "speaker-invalid-url@example.com", models.UserTypeOffline, &section.ID, "Доклад")

	recorder := performProgramRequest(t, router, http.MethodPut, "/admin/program/"+jsonNumber(user.ID), map[string]any{
		"user_type":  models.UserTypeOffline,
		"section_id": section.ID,
		"talk_title": "Утвержденный доклад",
		"join_url":   "ftp://meet.example.com/session-2",
	})

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, recorder.Code, recorder.Body.String())
	}
}

func TestListProgramReturnsSubmittedAndApprovedData(t *testing.T) {
	db := newProgramTestDB(t)
	router := newProgramTestRouter(db)
	submittedSection := seedSection(t, db, "Аудитория 203")
	approvedSection := models.Section{Title: "Утвержденная секция", Room: "Аудитория 204"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	room := seedRoom(t, db, "Зал 302")
	user := seedParticipant(t, db, "speaker-list@example.com", models.UserTypeOffline, &submittedSection.ID, "Исходный доклад")

	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOnline,
		SectionID: &approvedSection.ID,
		TalkTitle: "Официальный доклад",
		RoomID:    &room.ID,
		JoinURL:   "https://meet.example.com/session-3",
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}

	recorder := performProgramRequest(t, router, http.MethodGet, "/admin/program", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var entries []programEntry
	if err := json.Unmarshal(recorder.Body.Bytes(), &entries); err != nil {
		t.Fatalf("unmarshal program list: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Submitted.SectionTitle != submittedSection.Title {
		t.Fatalf("expected submitted section title %q, got %q", submittedSection.Title, entries[0].Submitted.SectionTitle)
	}
	if entries[0].Assignment == nil {
		t.Fatalf("expected approved assignment")
	}
	if entries[0].Assignment.SectionTitle != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, entries[0].Assignment.SectionTitle)
	}
	if entries[0].Assignment.RoomName != room.Name {
		t.Fatalf("expected room name %q, got %q", room.Name, entries[0].Assignment.RoomName)
	}
}

func jsonNumber(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}
