package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ProgramHandler struct {
	DB *gorm.DB
}

type upsertProgramAssignmentRequest struct {
	UserType  models.UserType `json:"user_type"`
	SectionID *uint           `json:"section_id"`
	TalkTitle string          `json:"talk_title"`
	RoomID    *uint           `json:"room_id"`
	StartsAt  *time.Time      `json:"starts_at"`
	EndsAt    *time.Time      `json:"ends_at"`
	JoinURL   string          `json:"join_url"`
}

type programSubmissionView struct {
	UserType     models.UserType `json:"user_type"`
	SectionID    *uint           `json:"section_id"`
	SectionTitle string          `json:"section_title"`
	TalkTitle    string          `json:"talk_title"`
}

type programAssignmentView struct {
	UserType     models.UserType `json:"user_type"`
	SectionID    *uint           `json:"section_id"`
	SectionTitle string          `json:"section_title"`
	TalkTitle    string          `json:"talk_title"`
	RoomID       *uint           `json:"room_id"`
	RoomName     string          `json:"room_name"`
	StartsAt     *time.Time      `json:"starts_at"`
	EndsAt       *time.Time      `json:"ends_at"`
	JoinURL      string          `json:"join_url"`
}

type programEntry struct {
	UserID       uint                   `json:"user_id"`
	Email        string                 `json:"email"`
	FullName     string                 `json:"full_name"`
	Organization string                 `json:"organization"`
	Position     string                 `json:"position"`
	City         string                 `json:"city"`
	Degree       string                 `json:"degree"`
	Phone        string                 `json:"phone"`
	Submitted    programSubmissionView  `json:"submitted"`
	Assignment   *programAssignmentView `json:"assignment,omitempty"`
}

func (h *ProgramHandler) ListProgram(c *gin.Context) {
	var users []models.User
	if err := h.DB.Preload("Profile").
		Where("role = ?", models.RoleParticipant).
		Order("created_at asc").
		Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load program participants"})
		return
	}

	sectionIDs := make([]uint, 0)
	for _, user := range users {
		if user.Profile.SectionID != nil {
			sectionIDs = append(sectionIDs, *user.Profile.SectionID)
		}
	}

	userIDs := make([]uint, 0, len(users))
	for _, user := range users {
		userIDs = append(userIDs, user.ID)
	}

	assignmentsByUser, approvedSectionIDs, roomIDs, err := h.loadAssignmentsByUser(userIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load authoritative program data"})
		return
	}
	sectionIDs = append(sectionIDs, approvedSectionIDs...)

	sectionsByID, err := h.loadSectionsByID(sectionIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load sections"})
		return
	}
	roomsByID, err := h.loadRoomsByID(roomIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load rooms"})
		return
	}

	result := make([]programEntry, 0, len(users))
	for _, user := range users {
		entry := programEntry{
			UserID:       user.ID,
			Email:        user.Email,
			FullName:     user.Profile.FullName,
			Organization: user.Profile.Organization,
			Position:     user.Profile.Position,
			City:         user.Profile.City,
			Degree:       user.Profile.Degree,
			Phone:        user.Profile.Phone,
			Submitted: programSubmissionView{
				UserType:     user.UserType,
				SectionID:    user.Profile.SectionID,
				SectionTitle: sectionTitleByID(sectionsByID, user.Profile.SectionID),
				TalkTitle:    user.Profile.TalkTitle,
			},
		}

		if assignment, ok := assignmentsByUser[user.ID]; ok {
			entry.Assignment = buildProgramAssignmentView(assignment, sectionsByID, roomsByID)
		}

		result = append(result, entry)
	}

	c.JSON(http.StatusOK, result)
}

func (h *ProgramHandler) UpsertProgramAssignment(c *gin.Context) {
	userIDValue := strings.TrimSpace(c.Param("userID"))
	userID, err := strconv.ParseUint(userIDValue, 10, 64)
	if err != nil || userID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var payload upsertProgramAssignmentRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	payload.TalkTitle = strings.TrimSpace(payload.TalkTitle)
	payload.JoinURL = strings.TrimSpace(payload.JoinURL)
	if payload.UserType != models.UserTypeOnline && payload.UserType != models.UserTypeOffline {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user type"})
		return
	}
	if payload.TalkTitle == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "talk title is required"})
		return
	}
	if payload.SectionID != nil {
		var section models.Section
		if err := h.DB.First(&section, *payload.SectionID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "selected section not found"})
			return
		}
	}
	if payload.RoomID != nil {
		var room models.Room
		if err := h.DB.First(&room, *payload.RoomID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "selected room not found"})
			return
		}
	}
	if payload.StartsAt != nil && payload.EndsAt != nil && !payload.EndsAt.After(*payload.StartsAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end time must be after start time"})
		return
	}
	if payload.JoinURL != "" {
		if err := validateJoinURL(payload.JoinURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	var user models.User
	if err := h.DB.Preload("Profile").First(&user, uint(userID)).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "selected user not found"})
		return
	}
	if user.Role != models.RoleParticipant {
		c.JSON(http.StatusBadRequest, gin.H{"error": "program assignments are available only for participants"})
		return
	}

	assignment := models.ProgramAssignment{
		UserID:    uint(userID),
		UserType:  payload.UserType,
		SectionID: payload.SectionID,
		TalkTitle: payload.TalkTitle,
		RoomID:    payload.RoomID,
		StartsAt:  payload.StartsAt,
		EndsAt:    payload.EndsAt,
		JoinURL:   payload.JoinURL,
	}

	var existing models.ProgramAssignment
	if err := h.DB.Where("user_id = ?", uint(userID)).First(&existing).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load existing program assignment"})
			return
		}
		if err := h.DB.Create(&assignment).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save program assignment"})
			return
		}
	} else {
		existing.UserType = assignment.UserType
		existing.SectionID = assignment.SectionID
		existing.TalkTitle = assignment.TalkTitle
		existing.RoomID = assignment.RoomID
		existing.StartsAt = assignment.StartsAt
		existing.EndsAt = assignment.EndsAt
		existing.JoinURL = assignment.JoinURL
		if err := h.DB.Save(&existing).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save program assignment"})
			return
		}
		assignment = existing
	}

	sectionsByID, err := h.loadSectionsByID(optionalUintSlice(assignment.SectionID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load section details"})
		return
	}
	roomsByID, err := h.loadRoomsByID(optionalUintSlice(assignment.RoomID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load room details"})
		return
	}

	c.JSON(http.StatusOK, buildProgramAssignmentView(assignment, sectionsByID, roomsByID))
}

func (h *ProgramHandler) loadAssignmentsByUser(userIDs []uint) (map[uint]models.ProgramAssignment, []uint, []uint, error) {
	result := make(map[uint]models.ProgramAssignment, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil, nil, nil
	}

	var assignments []models.ProgramAssignment
	if err := h.DB.Where("user_id IN ?", userIDs).Order("updated_at desc, id desc").Find(&assignments).Error; err != nil {
		return nil, nil, nil, err
	}

	sectionIDs := make([]uint, 0, len(assignments))
	roomIDs := make([]uint, 0, len(assignments))
	for _, assignment := range assignments {
		result[assignment.UserID] = assignment
		if assignment.SectionID != nil {
			sectionIDs = append(sectionIDs, *assignment.SectionID)
		}
		if assignment.RoomID != nil {
			roomIDs = append(roomIDs, *assignment.RoomID)
		}
	}

	return result, sectionIDs, roomIDs, nil
}

func (h *ProgramHandler) loadSectionsByID(sectionIDs []uint) (map[uint]models.Section, error) {
	result := make(map[uint]models.Section, len(sectionIDs))
	uniqueIDs := uniqueUintValues(sectionIDs)
	if len(uniqueIDs) == 0 {
		return result, nil
	}

	var sections []models.Section
	if err := h.DB.Where("id IN ?", uniqueIDs).Find(&sections).Error; err != nil {
		return nil, err
	}
	for _, section := range sections {
		result[section.ID] = section
	}
	return result, nil
}

func (h *ProgramHandler) loadRoomsByID(roomIDs []uint) (map[uint]models.Room, error) {
	result := make(map[uint]models.Room, len(roomIDs))
	uniqueIDs := uniqueUintValues(roomIDs)
	if len(uniqueIDs) == 0 {
		return result, nil
	}

	var rooms []models.Room
	if err := h.DB.Where("id IN ?", uniqueIDs).Find(&rooms).Error; err != nil {
		return nil, err
	}
	for _, room := range rooms {
		result[room.ID] = room
	}
	return result, nil
}

func buildProgramAssignmentView(
	assignment models.ProgramAssignment,
	sectionsByID map[uint]models.Section,
	roomsByID map[uint]models.Room,
) *programAssignmentView {
	return &programAssignmentView{
		UserType:     assignment.UserType,
		SectionID:    assignment.SectionID,
		SectionTitle: sectionTitleByID(sectionsByID, assignment.SectionID),
		TalkTitle:    assignment.TalkTitle,
		RoomID:       assignment.RoomID,
		RoomName:     roomNameByID(roomsByID, assignment.RoomID),
		StartsAt:     assignment.StartsAt,
		EndsAt:       assignment.EndsAt,
		JoinURL:      assignment.JoinURL,
	}
}

func sectionTitleByID(sectionsByID map[uint]models.Section, sectionID *uint) string {
	if sectionID == nil {
		return ""
	}
	if section, ok := sectionsByID[*sectionID]; ok {
		return section.Title
	}
	return ""
}

func roomNameByID(roomsByID map[uint]models.Room, roomID *uint) string {
	if roomID == nil {
		return ""
	}
	if room, ok := roomsByID[*roomID]; ok {
		return room.Name
	}
	return ""
}

func optionalUintSlice(value *uint) []uint {
	if value == nil {
		return nil
	}
	return []uint{*value}
}

func uniqueUintValues(values []uint) []uint {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[uint]struct{}, len(values))
	result := make([]uint, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func validateJoinURL(value string) error {
	parsed, err := url.ParseRequestURI(value)
	if err != nil {
		return errors.New("join_url must be a valid http or https URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("join_url must be a valid http or https URL")
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return errors.New("join_url must be a valid http or https URL")
	}
	return nil
}
