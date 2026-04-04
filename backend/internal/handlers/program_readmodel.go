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
