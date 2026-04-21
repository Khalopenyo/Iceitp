package handlers

import (
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newScheduleTestRouter(db *gorm.DB, userID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	})

	handler := &ScheduleHandler{DB: db}
	router.GET("/schedule", handler.UserSchedule)
	router.GET("/schedule/with-participants", handler.ParticipantSchedule)
	return router
}

func performScheduleRequest(t *testing.T, router *gin.Engine, path string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, path, nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func seedScheduleParticipant(
	t *testing.T,
	db *gorm.DB,
	email string,
	fullName string,
	userType models.UserType,
	sectionID *uint,
	talkTitle string,
) models.User {
	t.Helper()

	user := models.User{
		Email:        email,
		PasswordHash: "hash",
		Role:         models.RoleParticipant,
		UserType:     userType,
		Profile: models.Profile{
			FullName:     fullName,
			Organization: "Организация",
			Position:     "Докладчик",
			City:         "Москва",
			Degree:       "Кандидат наук",
			SectionID:    sectionID,
			TalkTitle:    talkTitle,
			Phone:        uniqueTestPhoneFromSeed(email),
			ConsentGiven: true,
		},
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create participant: %v", err)
	}
	return user
}

func seedScheduleRoom(t *testing.T, db *gorm.DB, name string, floor int) models.Room {
	t.Helper()

	room := models.Room{Name: name, Floor: floor}
	if err := db.Create(&room).Error; err != nil {
		t.Fatalf("create room: %v", err)
	}
	return room
}

func TestUserScheduleReturnsApprovedOfflinePlacement(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Черновая аудитория")
	approvedSection := models.Section{Title: "Официальная секция", Room: "Игнорировать"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	room := seedScheduleRoom(t, db, "Зал 510", 5)
	user := seedScheduleParticipant(
		t,
		db,
		"offline-approved@example.com",
		"Анна Иванова",
		models.UserTypeOffline,
		&submittedSection.ID,
		"Черновой доклад",
	)
	startsAt := time.Date(2026, time.April, 24, 11, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(45 * time.Minute)

	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOffline,
		SectionID: &approvedSection.ID,
		TalkTitle: "Утвержденный офлайн доклад",
		RoomID:    &room.ID,
		StartsAt:  &startsAt,
		EndsAt:    &endsAt,
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}

	router := newScheduleTestRouter(db, user.ID)
	recorder := performScheduleRequest(t, router, "/schedule")
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		AssignmentStatus string                  `json:"assignment_status"`
		CurrentUserType  models.UserType         `json:"current_user_type"`
		Schedule         participantScheduleView `json:"schedule"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.AssignmentStatus != assignmentStatusApproved {
		t.Fatalf("expected assignment status %q, got %q", assignmentStatusApproved, response.AssignmentStatus)
	}
	if response.CurrentUserType != models.UserTypeOffline {
		t.Fatalf("expected current user type %q, got %q", models.UserTypeOffline, response.CurrentUserType)
	}
	if response.Schedule.SectionTitle != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, response.Schedule.SectionTitle)
	}
	if response.Schedule.TalkTitle != "Утвержденный офлайн доклад" {
		t.Fatalf("expected approved talk title, got %q", response.Schedule.TalkTitle)
	}
	if response.Schedule.RoomID == nil || *response.Schedule.RoomID != room.ID {
		t.Fatalf("expected room id %d, got %#v", room.ID, response.Schedule.RoomID)
	}
	if response.Schedule.RoomName != room.Name {
		t.Fatalf("expected room name %q, got %q", room.Name, response.Schedule.RoomName)
	}
	if response.Schedule.RoomFloor != room.Floor {
		t.Fatalf("expected room floor %d, got %d", room.Floor, response.Schedule.RoomFloor)
	}
}

func TestUserScheduleReturnsApprovedOnlinePlacement(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Черновая аудитория")
	approvedSection := models.Section{Title: "Онлайн секция", Room: "Не используется"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	user := seedScheduleParticipant(
		t,
		db,
		"online-approved@example.com",
		"Борис Петров",
		models.UserTypeOffline,
		&submittedSection.ID,
		"Черновой онлайн доклад",
	)
	startsAt := time.Date(2026, time.April, 24, 13, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(30 * time.Minute)

	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOnline,
		SectionID: &approvedSection.ID,
		TalkTitle: "Утвержденный онлайн доклад",
		StartsAt:  &startsAt,
		EndsAt:    &endsAt,
		JoinURL:   "https://meet.example.com/approved-online",
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}

	router := newScheduleTestRouter(db, user.ID)
	recorder := performScheduleRequest(t, router, "/schedule")
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		AssignmentStatus string                  `json:"assignment_status"`
		CurrentUserType  models.UserType         `json:"current_user_type"`
		Schedule         participantScheduleView `json:"schedule"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.AssignmentStatus != assignmentStatusApproved {
		t.Fatalf("expected assignment status %q, got %q", assignmentStatusApproved, response.AssignmentStatus)
	}
	if response.CurrentUserType != models.UserTypeOnline {
		t.Fatalf("expected current user type %q, got %q", models.UserTypeOnline, response.CurrentUserType)
	}
	if response.Schedule.TalkTitle != "Утвержденный онлайн доклад" {
		t.Fatalf("expected approved talk title, got %q", response.Schedule.TalkTitle)
	}
	if response.Schedule.JoinURL != "https://meet.example.com/approved-online" {
		t.Fatalf("expected join url, got %q", response.Schedule.JoinURL)
	}
	if response.Schedule.RoomID != nil {
		t.Fatalf("expected no room for online placement, got %#v", response.Schedule.RoomID)
	}
}

func TestUserScheduleReturnsPendingWithoutAssignment(t *testing.T) {
	db := newProgramTestDB(t)
	section := seedSection(t, db, "Черновая аудитория")
	user := seedScheduleParticipant(
		t,
		db,
		"pending@example.com",
		"Виктор Смирнов",
		models.UserTypeOffline,
		&section.ID,
		"Доклад только в профиле",
	)

	router := newScheduleTestRouter(db, user.ID)
	recorder := performScheduleRequest(t, router, "/schedule")
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		AssignmentStatus string                  `json:"assignment_status"`
		CurrentUserType  models.UserType         `json:"current_user_type"`
		Schedule         participantScheduleView `json:"schedule"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.AssignmentStatus != assignmentStatusPending {
		t.Fatalf("expected assignment status %q, got %q", assignmentStatusPending, response.AssignmentStatus)
	}
	if response.CurrentUserType != models.UserTypeOffline {
		t.Fatalf("expected current user type %q, got %q", models.UserTypeOffline, response.CurrentUserType)
	}
	if response.Schedule.SectionID != nil {
		t.Fatalf("expected no approved section, got %#v", response.Schedule.SectionID)
	}
	if response.Schedule.TalkTitle != "" {
		t.Fatalf("expected no approved talk title, got %q", response.Schedule.TalkTitle)
	}
	if response.Schedule.RoomID != nil {
		t.Fatalf("expected no approved room, got %#v", response.Schedule.RoomID)
	}
}

func TestParticipantScheduleReturnsAuthoritativeRoomGroups(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Черновая аудитория")
	approvedSection := models.Section{Title: "Официальная секция", Room: "Не используется"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	room := seedScheduleRoom(t, db, "Зал 302", 3)
	firstUser := seedScheduleParticipant(
		t,
		db,
		"room-first@example.com",
		"Анна Иванова",
		models.UserTypeOffline,
		&submittedSection.ID,
		"Черновой первый доклад",
	)
	secondUser := seedScheduleParticipant(
		t,
		db,
		"room-second@example.com",
		"Борис Петров",
		models.UserTypeOffline,
		&submittedSection.ID,
		"Черновой второй доклад",
	)
	onlineUser := seedScheduleParticipant(
		t,
		db,
		"room-online@example.com",
		"Светлана Орлова",
		models.UserTypeOnline,
		&submittedSection.ID,
		"Черновой онлайн доклад",
	)

	startsAt := time.Date(2026, time.April, 24, 9, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(45 * time.Minute)
	assignments := []models.ProgramAssignment{
		{
			UserID:    firstUser.ID,
			UserType:  models.UserTypeOffline,
			SectionID: &approvedSection.ID,
			TalkTitle: "Официальный первый доклад",
			RoomID:    &room.ID,
			StartsAt:  &startsAt,
			EndsAt:    &endsAt,
		},
		{
			UserID:    secondUser.ID,
			UserType:  models.UserTypeOffline,
			SectionID: &approvedSection.ID,
			TalkTitle: "Официальный второй доклад",
			RoomID:    &room.ID,
			StartsAt:  &startsAt,
			EndsAt:    &endsAt,
		},
		{
			UserID:    onlineUser.ID,
			UserType:  models.UserTypeOnline,
			SectionID: &approvedSection.ID,
			TalkTitle: "Онлайн доклад",
			StartsAt:  &startsAt,
			EndsAt:    &endsAt,
			JoinURL:   "https://meet.example.com/online-only",
		},
	}
	for _, assignment := range assignments {
		if err := db.Create(&assignment).Error; err != nil {
			t.Fatalf("create assignment: %v", err)
		}
	}

	router := newScheduleTestRouter(db, firstUser.ID)
	recorder := performScheduleRequest(t, router, "/schedule/with-participants")
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		CurrentUserID    uint                `json:"current_user_id"`
		CurrentUserType  models.UserType     `json:"current_user_type"`
		AssignmentStatus string              `json:"assignment_status"`
		Items            []roomScheduleGroup `json:"items"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.CurrentUserID != firstUser.ID {
		t.Fatalf("expected current user id %d, got %d", firstUser.ID, response.CurrentUserID)
	}
	if response.CurrentUserType != models.UserTypeOffline {
		t.Fatalf("expected current user type %q, got %q", models.UserTypeOffline, response.CurrentUserType)
	}
	if len(response.Items) != 1 {
		t.Fatalf("expected 1 room group, got %d", len(response.Items))
	}
	group := response.Items[0]
	if group.RoomID != room.ID {
		t.Fatalf("expected room id %d, got %d", room.ID, group.RoomID)
	}
	if group.RoomFloor != room.Floor {
		t.Fatalf("expected room floor %d, got %d", room.Floor, group.RoomFloor)
	}
	if len(group.Sessions) != 1 {
		t.Fatalf("expected 1 session group, got %d", len(group.Sessions))
	}
	if group.Sessions[0].SectionTitle != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, group.Sessions[0].SectionTitle)
	}
	if len(group.Sessions[0].Participants) != 2 {
		t.Fatalf("expected 2 offline participants, got %d", len(group.Sessions[0].Participants))
	}
	if group.Sessions[0].Participants[0].TalkTitle != "Официальный первый доклад" {
		t.Fatalf("expected approved first talk title, got %q", group.Sessions[0].Participants[0].TalkTitle)
	}
	if group.Sessions[0].Participants[1].TalkTitle != "Официальный второй доклад" {
		t.Fatalf("expected approved second talk title, got %q", group.Sessions[0].Participants[1].TalkTitle)
	}
}
