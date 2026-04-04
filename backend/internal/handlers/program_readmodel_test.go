package handlers

import (
	"conferenceplatforma/internal/models"
	"testing"
	"time"
)

func TestLoadProgramEntriesUsesAuthoritativeAssignments(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Аудитория 401")
	approvedSection := models.Section{Title: "Официальная секция", Room: "Аудитория 402"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	room := seedRoom(t, db, "Зал 402")
	user := seedParticipant(t, db, "authoritative@example.com", models.UserTypeOffline, &submittedSection.ID, "Черновой заголовок")
	startsAt := time.Date(2026, time.April, 24, 12, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(90 * time.Minute)

	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOnline,
		SectionID: &approvedSection.ID,
		TalkTitle: "Утвержденный заголовок",
		RoomID:    &room.ID,
		StartsAt:  &startsAt,
		EndsAt:    &endsAt,
		JoinURL:   "https://meet.example.com/official",
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}

	entries, err := loadAuthoritativeProgramEntries(db, authoritativeProgramFilter{})
	if err != nil {
		t.Fatalf("load authoritative program entries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}

	entry := entries[0]
	if entry.SectionTitle != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, entry.SectionTitle)
	}
	if entry.TalkTitle != "Утвержденный заголовок" {
		t.Fatalf("expected approved talk title, got %q", entry.TalkTitle)
	}
	if entry.RoomName != room.Name {
		t.Fatalf("expected approved room %q, got %q", room.Name, entry.RoomName)
	}
	if entry.UserType != models.UserTypeOnline {
		t.Fatalf("expected approved user type %q, got %q", models.UserTypeOnline, entry.UserType)
	}
}

func TestLoadProgramEntriesDoesNotFallbackToRawProfile(t *testing.T) {
	db := newProgramTestDB(t)
	section := seedSection(t, db, "Аудитория 403")
	user := seedParticipant(t, db, "raw-profile@example.com", models.UserTypeOffline, &section.ID, "Только профиль")

	entries, err := loadAuthoritativeProgramEntries(db, authoritativeProgramFilter{UserID: &user.ID})
	if err != nil {
		t.Fatalf("load authoritative program entries: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no authoritative entries without assignment, got %d", len(entries))
	}
}

func TestBuildAdminScheduleUsesAuthoritativeAssignments(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Аудитория 404")
	approvedSection := models.Section{Title: "Секция оргкомитета", Room: "Аудитория 405"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	user := seedParticipant(t, db, "admin-schedule@example.com", models.UserTypeOffline, &submittedSection.ID, "Черновой доклад")

	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOffline,
		SectionID: &approvedSection.ID,
		TalkTitle: "Утвержденный доклад",
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}

	entries, err := loadAuthoritativeProgramEntries(db, authoritativeProgramFilter{})
	if err != nil {
		t.Fatalf("load authoritative entries: %v", err)
	}
	schedule := buildAdminScheduleFromAssignments(entries)
	if len(schedule) != 1 {
		t.Fatalf("expected 1 schedule group, got %d", len(schedule))
	}
	if schedule[0].Section.Title != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, schedule[0].Section.Title)
	}
	if len(schedule[0].Participants) != 1 {
		t.Fatalf("expected 1 participant, got %d", len(schedule[0].Participants))
	}
	if schedule[0].Participants[0].TalkTitle != "Утвержденный доклад" {
		t.Fatalf("expected approved talk title, got %q", schedule[0].Participants[0].TalkTitle)
	}
}

func TestLoadProgramPDFViewUsesAuthoritativeAssignment(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Черновая секция")
	approvedSection := models.Section{Title: "Official Section", Room: "Hall A"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	room := seedRoom(t, db, "Hall A")
	user := seedParticipant(t, db, "program-personal@example.com", models.UserTypeOffline, &submittedSection.ID, "Draft Talk")
	startsAt := time.Date(2026, time.April, 24, 10, 0, 0, 0, time.UTC)
	endsAt := startsAt.Add(45 * time.Minute)

	assignment := models.ProgramAssignment{
		UserID:    user.ID,
		UserType:  models.UserTypeOnline,
		SectionID: &approvedSection.ID,
		TalkTitle: "Official Talk",
		RoomID:    &room.ID,
		StartsAt:  &startsAt,
		EndsAt:    &endsAt,
		JoinURL:   "https://meet.example.com/official-talk",
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}

	view, err := loadProgramPDFView(db, user.ID, "personal")
	if err != nil {
		t.Fatalf("load program pdf view: %v", err)
	}
	if view.Mode != "personal" {
		t.Fatalf("expected personal mode, got %q", view.Mode)
	}
	if view.StatusMessage != "" {
		t.Fatalf("expected no status message, got %q", view.StatusMessage)
	}
	if view.PersonalEntry == nil {
		t.Fatalf("expected authoritative personal entry")
	}
	if view.PersonalEntry.SectionTitle != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, view.PersonalEntry.SectionTitle)
	}
	if view.PersonalEntry.TalkTitle != "Official Talk" {
		t.Fatalf("expected approved talk title, got %q", view.PersonalEntry.TalkTitle)
	}
	if view.PersonalEntry.RoomName != room.Name {
		t.Fatalf("expected approved room %q, got %q", room.Name, view.PersonalEntry.RoomName)
	}
	if view.PersonalEntry.JoinURL != "https://meet.example.com/official-talk" {
		t.Fatalf("expected approved join url, got %q", view.PersonalEntry.JoinURL)
	}
}

func TestLoadProgramPDFViewReturnsExplicitPendingStateWithoutAssignment(t *testing.T) {
	db := newProgramTestDB(t)
	section := seedSection(t, db, "Черновая секция")
	user := seedParticipant(t, db, "program-pending@example.com", models.UserTypeOffline, &section.ID, "Draft Talk")

	view, err := loadProgramPDFView(db, user.ID, "personal")
	if err != nil {
		t.Fatalf("load program pdf view: %v", err)
	}
	if view.PersonalEntry != nil {
		t.Fatalf("expected no authoritative personal entry without assignment")
	}
	if view.StatusMessage != officialProgramPendingText {
		t.Fatalf("expected pending status %q, got %q", officialProgramPendingText, view.StatusMessage)
	}
}

func TestLoadProgramPDFViewFullModeGroupsApprovedAssignments(t *testing.T) {
	db := newProgramTestDB(t)
	submittedSection := seedSection(t, db, "Черновая секция")
	approvedSection := models.Section{Title: "Official Section", Room: "Hall B"}
	if err := db.Create(&approvedSection).Error; err != nil {
		t.Fatalf("create approved section: %v", err)
	}
	room := seedRoom(t, db, "Hall B")
	firstUser := seedParticipant(t, db, "full-one@example.com", models.UserTypeOffline, &submittedSection.ID, "Draft One")
	secondUser := seedParticipant(t, db, "full-two@example.com", models.UserTypeOffline, &submittedSection.ID, "Draft Two")
	firstStartsAt := time.Date(2026, time.April, 24, 9, 0, 0, 0, time.UTC)
	secondStartsAt := firstStartsAt.Add(1 * time.Hour)
	firstEndsAt := firstStartsAt.Add(30 * time.Minute)
	secondEndsAt := secondStartsAt.Add(30 * time.Minute)

	assignments := []models.ProgramAssignment{
		{
			UserID:    secondUser.ID,
			UserType:  models.UserTypeOffline,
			SectionID: &approvedSection.ID,
			TalkTitle: "Official Two",
			RoomID:    &room.ID,
			StartsAt:  &secondStartsAt,
			EndsAt:    &secondEndsAt,
		},
		{
			UserID:    firstUser.ID,
			UserType:  models.UserTypeOffline,
			SectionID: &approvedSection.ID,
			TalkTitle: "Official One",
			RoomID:    &room.ID,
			StartsAt:  &firstStartsAt,
			EndsAt:    &firstEndsAt,
		},
	}
	for _, assignment := range assignments {
		if err := db.Create(&assignment).Error; err != nil {
			t.Fatalf("create assignment: %v", err)
		}
	}

	view, err := loadProgramPDFView(db, firstUser.ID, "full")
	if err != nil {
		t.Fatalf("load full program pdf view: %v", err)
	}
	if view.Mode != "full" {
		t.Fatalf("expected full mode, got %q", view.Mode)
	}
	if len(view.Groups) != 1 {
		t.Fatalf("expected 1 program group, got %d", len(view.Groups))
	}
	if view.Groups[0].SectionTitle != approvedSection.Title {
		t.Fatalf("expected approved section title %q, got %q", approvedSection.Title, view.Groups[0].SectionTitle)
	}
	if len(view.Groups[0].Entries) != 2 {
		t.Fatalf("expected 2 grouped entries, got %d", len(view.Groups[0].Entries))
	}
	if view.Groups[0].Entries[0].TalkTitle != "Official One" {
		t.Fatalf("expected earliest approved talk first, got %q", view.Groups[0].Entries[0].TalkTitle)
	}
	if view.Groups[0].Entries[1].TalkTitle != "Official Two" {
		t.Fatalf("expected later approved talk second, got %q", view.Groups[0].Entries[1].TalkTitle)
	}
}
