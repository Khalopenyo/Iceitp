package handlers

import (
	"conferenceplatforma/internal/models"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

type authoritativeProgramFilter struct {
	UserID *uint
}

type authoritativeProgramEntry struct {
	UserID       uint
	FullName     string
	UserType     models.UserType
	SectionID    *uint
	SectionTitle string
	RoomID       *uint
	RoomName     string
	RoomFloor    int
	TalkTitle    string
	StartsAt     *time.Time
	EndsAt       *time.Time
	JoinURL      string
}

type authoritativeProgramSectionGroup struct {
	SectionID    uint
	SectionTitle string
	Entries      []authoritativeProgramEntry
}

type participantScheduleView struct {
	UserID           uint            `json:"user_id"`
	FullName         string          `json:"full_name"`
	UserType         models.UserType `json:"user_type"`
	AssignmentStatus string          `json:"assignment_status"`
	SectionID        *uint           `json:"section_id,omitempty"`
	SectionTitle     string          `json:"section_title,omitempty"`
	RoomID           *uint           `json:"room_id,omitempty"`
	RoomName         string          `json:"room_name,omitempty"`
	RoomFloor        int             `json:"room_floor,omitempty"`
	TalkTitle        string          `json:"talk_title,omitempty"`
	StartsAt         *time.Time      `json:"starts_at,omitempty"`
	EndsAt           *time.Time      `json:"ends_at,omitempty"`
	JoinURL          string          `json:"join_url,omitempty"`
}

type roomScheduleSession struct {
	SectionID    *uint             `json:"section_id,omitempty"`
	SectionTitle string            `json:"section_title"`
	StartsAt     *time.Time        `json:"starts_at,omitempty"`
	EndsAt       *time.Time        `json:"ends_at,omitempty"`
	Participants []ParticipantInfo `json:"participants"`
}

type roomScheduleGroup struct {
	RoomID    uint                  `json:"room_id"`
	RoomName  string                `json:"room_name"`
	RoomFloor int                   `json:"room_floor"`
	Sessions  []roomScheduleSession `json:"sessions"`
}

const (
	assignmentStatusPending  = "pending"
	assignmentStatusApproved = "approved"
)

func loadAuthoritativeProgramEntries(db *gorm.DB, filter authoritativeProgramFilter) ([]authoritativeProgramEntry, error) {
	query := db.Preload("User.Profile").Preload("Section").Preload("Room").Order("updated_at desc, id desc")
	if filter.UserID != nil {
		query = query.Where("user_id = ?", *filter.UserID)
	}

	var assignments []models.ProgramAssignment
	if err := query.Find(&assignments).Error; err != nil {
		return nil, err
	}

	entries := make([]authoritativeProgramEntry, 0, len(assignments))
	for _, assignment := range assignments {
		entry := authoritativeProgramEntry{
			UserID:    assignment.UserID,
			FullName:  assignment.User.Profile.FullName,
			UserType:  assignment.UserType,
			SectionID: assignment.SectionID,
			RoomID:    assignment.RoomID,
			TalkTitle: assignment.TalkTitle,
			StartsAt:  assignment.StartsAt,
			EndsAt:    assignment.EndsAt,
			JoinURL:   assignment.JoinURL,
		}
		if assignment.SectionID != nil && assignment.Section.ID == *assignment.SectionID {
			entry.SectionTitle = assignment.Section.Title
		}
		if assignment.RoomID != nil && assignment.Room.ID == *assignment.RoomID {
			entry.RoomName = assignment.Room.Name
			entry.RoomFloor = assignment.Room.Floor
		}
		entries = append(entries, entry)
	}

	sort.Slice(entries, func(i, j int) bool {
		left := entries[i]
		right := entries[j]
		if compareOptionalTime(left.StartsAt, right.StartsAt) != 0 {
			return compareOptionalTime(left.StartsAt, right.StartsAt) < 0
		}
		if compareOptionalTime(left.EndsAt, right.EndsAt) != 0 {
			return compareOptionalTime(left.EndsAt, right.EndsAt) < 0
		}
		if left.SectionTitle != right.SectionTitle {
			return left.SectionTitle < right.SectionTitle
		}
		if left.FullName != right.FullName {
			return left.FullName < right.FullName
		}
		return left.UserID < right.UserID
	})

	return entries, nil
}

func compareOptionalTime(left, right *time.Time) int {
	switch {
	case left == nil && right == nil:
		return 0
	case left == nil:
		return 1
	case right == nil:
		return -1
	case left.Before(*right):
		return -1
	case left.After(*right):
		return 1
	default:
		return 0
	}
}

func groupAuthoritativeEntriesBySection(entries []authoritativeProgramEntry) []authoritativeProgramSectionGroup {
	order := make([]uint, 0)
	groups := make(map[uint]*authoritativeProgramSectionGroup)

	for _, entry := range entries {
		if entry.SectionID == nil {
			continue
		}

		group, ok := groups[*entry.SectionID]
		if !ok {
			group = &authoritativeProgramSectionGroup{
				SectionID:    *entry.SectionID,
				SectionTitle: fallbackSectionTitle(entry.SectionTitle, *entry.SectionID),
				Entries:      []authoritativeProgramEntry{},
			}
			groups[*entry.SectionID] = group
			order = append(order, *entry.SectionID)
		}
		group.Entries = append(group.Entries, entry)
	}

	result := make([]authoritativeProgramSectionGroup, 0, len(order))
	for _, sectionID := range order {
		result = append(result, *groups[sectionID])
	}
	return result
}

func buildAdminScheduleFromAssignments(entries []authoritativeProgramEntry) []SectionWithParticipants {
	groups := groupAuthoritativeEntriesBySection(entries)
	result := make([]SectionWithParticipants, 0, len(groups))

	for _, group := range groups {
		section := models.Section{
			ID:    group.SectionID,
			Title: group.SectionTitle,
		}
		if len(group.Entries) > 0 {
			first := group.Entries[0]
			section.Room = first.RoomName
			if first.StartsAt != nil {
				section.StartAt = *first.StartsAt
			}
			if first.EndsAt != nil {
				section.EndAt = *first.EndsAt
			}
		}

		participants := make([]ParticipantInfo, 0, len(group.Entries))
		for _, entry := range group.Entries {
			participants = append(participants, ParticipantInfo{
				UserID:    entry.UserID,
				FullName:  entry.FullName,
				TalkTitle: entry.TalkTitle,
				UserType:  entry.UserType,
				RoomName:  entry.RoomName,
				StartsAt:  entry.StartsAt,
				EndsAt:    entry.EndsAt,
				JoinURL:   entry.JoinURL,
			})
		}

		result = append(result, SectionWithParticipants{
			Section:      section,
			Participants: participants,
		})
	}

	return result
}

func loadParticipantScheduleView(db *gorm.DB, user models.User) (*participantScheduleView, error) {
	view := &participantScheduleView{
		UserID:           user.ID,
		FullName:         user.Profile.FullName,
		UserType:         user.UserType,
		AssignmentStatus: assignmentStatusPending,
	}

	entries, err := loadAuthoritativeProgramEntries(db, authoritativeProgramFilter{UserID: &user.ID})
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return view, nil
	}

	entry := entries[0]
	view.UserType = entry.UserType
	view.AssignmentStatus = assignmentStatusApproved
	view.SectionID = entry.SectionID
	view.SectionTitle = fallbackSectionTitle(entry.SectionTitle, valueOrZero(entry.SectionID))
	view.RoomID = entry.RoomID
	view.RoomName = entry.RoomName
	view.RoomFloor = entry.RoomFloor
	view.TalkTitle = entry.TalkTitle
	view.StartsAt = entry.StartsAt
	view.EndsAt = entry.EndsAt
	view.JoinURL = entry.JoinURL

	return view, nil
}

func buildRoomScheduleGroups(entries []authoritativeProgramEntry) []roomScheduleGroup {
	type sessionKey struct {
		roomID       uint
		sectionID    uint
		sectionTitle string
		startsAt     string
		endsAt       string
	}

	roomGroups := make(map[uint]*roomScheduleGroup)
	sessionIndex := make(map[sessionKey]int)

	for _, entry := range entries {
		if entry.UserType != models.UserTypeOffline || entry.RoomID == nil {
			continue
		}

		group, ok := roomGroups[*entry.RoomID]
		if !ok {
			group = &roomScheduleGroup{
				RoomID:    *entry.RoomID,
				RoomName:  entry.RoomName,
				RoomFloor: entry.RoomFloor,
				Sessions:  []roomScheduleSession{},
			}
			roomGroups[*entry.RoomID] = group
		}

		key := sessionKey{
			roomID:       *entry.RoomID,
			sectionID:    valueOrZero(entry.SectionID),
			sectionTitle: fallbackSectionTitle(entry.SectionTitle, valueOrZero(entry.SectionID)),
			startsAt:     formatOptionalTimeKey(entry.StartsAt),
			endsAt:       formatOptionalTimeKey(entry.EndsAt),
		}
		sessionPos, ok := sessionIndex[key]
		if !ok {
			group.Sessions = append(group.Sessions, roomScheduleSession{
				SectionID:    entry.SectionID,
				SectionTitle: key.sectionTitle,
				StartsAt:     entry.StartsAt,
				EndsAt:       entry.EndsAt,
				Participants: []ParticipantInfo{},
			})
			sessionPos = len(group.Sessions) - 1
			sessionIndex[key] = sessionPos
		}

		group.Sessions[sessionPos].Participants = append(group.Sessions[sessionPos].Participants, ParticipantInfo{
			UserID:    entry.UserID,
			FullName:  entry.FullName,
			TalkTitle: entry.TalkTitle,
			UserType:  entry.UserType,
			RoomName:  entry.RoomName,
			StartsAt:  entry.StartsAt,
			EndsAt:    entry.EndsAt,
			JoinURL:   entry.JoinURL,
		})
	}

	result := make([]roomScheduleGroup, 0, len(roomGroups))
	for _, group := range roomGroups {
		sort.Slice(group.Sessions, func(i, j int) bool {
			left := group.Sessions[i]
			right := group.Sessions[j]
			if compareOptionalTime(left.StartsAt, right.StartsAt) != 0 {
				return compareOptionalTime(left.StartsAt, right.StartsAt) < 0
			}
			if compareOptionalTime(left.EndsAt, right.EndsAt) != 0 {
				return compareOptionalTime(left.EndsAt, right.EndsAt) < 0
			}
			return left.SectionTitle < right.SectionTitle
		})
		for i := range group.Sessions {
			sort.Slice(group.Sessions[i].Participants, func(left, right int) bool {
				return group.Sessions[i].Participants[left].FullName < group.Sessions[i].Participants[right].FullName
			})
		}
		result = append(result, *group)
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].RoomFloor != result[j].RoomFloor {
			return result[i].RoomFloor < result[j].RoomFloor
		}
		return result[i].RoomName < result[j].RoomName
	})

	return result
}

func formatOptionalTimeKey(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func formatProgramTimeRange(startsAt, endsAt *time.Time) string {
	start := "Не указано"
	if startsAt != nil {
		start = startsAt.Format("02.01.2006 15:04")
	}
	end := "Не указано"
	if endsAt != nil {
		end = endsAt.Format("15:04")
	}
	return start + " - " + end
}

func fallbackSectionTitle(title string, sectionID uint) string {
	trimmed := strings.TrimSpace(title)
	if trimmed != "" {
		return trimmed
	}
	if sectionID == 0 {
		return "Секция не указана"
	}
	return "Секция #" + formatUint(sectionID)
}

func formatUint(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}
