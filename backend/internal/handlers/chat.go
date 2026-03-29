package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	maxChatMessages      = 150
	maxChatMessageLength = 2000
)

type ChatHandler struct {
	DB *gorm.DB
}

var errUserHasNoSection = errors.New("user has no section")
var errInvalidChatScope = errors.New("invalid chat scope")

type chatChannelResponse struct {
	Scope         string     `json:"scope"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	Available     bool       `json:"available"`
	SectionID     *uint      `json:"section_id,omitempty"`
	MemberCount   int64      `json:"member_count"`
	MessageCount  int64      `json:"message_count"`
	LastMessageAt *time.Time `json:"last_message_at,omitempty"`
}

type chatMessageResponse struct {
	ID        uint       `json:"id"`
	Scope     string     `json:"scope"`
	SectionID *uint      `json:"section_id,omitempty"`
	UserID    uint       `json:"user_id"`
	UserName  string     `json:"user_name"`
	UserMeta  string     `json:"user_meta,omitempty"`
	Content   string     `json:"content"`
	CreatedAt time.Time  `json:"created_at"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`
	IsOwn     bool       `json:"is_own"`
	CanEdit   bool       `json:"can_edit"`
	CanDelete bool       `json:"can_delete"`
}

type chatListResponse struct {
	CurrentScope   string                `json:"current_scope"`
	CurrentUserID  uint                  `json:"current_user_id"`
	CurrentChannel chatChannelResponse   `json:"current_channel"`
	Channels       []chatChannelResponse `json:"channels"`
	Messages       []chatMessageResponse `json:"messages"`
}

type chatMessagePayload struct {
	Scope   string `json:"scope"`
	Content string `json:"content"`
}

func (h *ChatHandler) PostMessage(c *gin.Context) {
	userID := c.GetUint("user_id")
	var payload chatMessagePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	channel, section, err := h.resolveRequestedChannel(userID, payload.Scope)
	if err != nil {
		h.writeScopeError(c, err)
		return
	}

	content := strings.TrimSpace(payload.Content)
	if content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message cannot be empty"})
		return
	}
	if utf8.RuneCountInString(content) > maxChatMessageLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is too long"})
		return
	}

	msg := models.ChatMessage{
		UserID:  userID,
		Channel: channel,
		Content: content,
	}
	if channel == models.ChatChannelSection {
		sectionID := section.ID
		msg.SectionID = &sectionID
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save message"})
		return
	}

	item, err := h.buildMessageResponse(msg, userID, h.currentRole(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load message"})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *ChatHandler) ListMessages(c *gin.Context) {
	userID := c.GetUint("user_id")
	channel, section, err := h.resolveRequestedChannel(userID, c.Query("scope"))
	if err != nil {
		h.writeScopeError(c, err)
		return
	}

	channels, err := h.buildChannelResponses(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load chat channels"})
		return
	}

	msgs, err := h.loadMessages(channel, section)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
		return
	}

	items, err := h.buildMessageResponses(msgs, userID, h.currentRole(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load message authors"})
		return
	}

	currentChannel, ok := findChannelResponse(channels, channel)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve active channel"})
		return
	}

	c.JSON(http.StatusOK, chatListResponse{
		CurrentScope:   string(channel),
		CurrentUserID:  userID,
		CurrentChannel: currentChannel,
		Channels:       channels,
		Messages:       items,
	})
}

func (h *ChatHandler) UpdateMessage(c *gin.Context) {
	userID := c.GetUint("user_id")
	messageID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var payload struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	var msg models.ChatMessage
	if err := h.DB.First(&msg, uint(messageID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load message"})
		return
	}
	if msg.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can edit only your own messages"})
		return
	}

	content := strings.TrimSpace(payload.Content)
	if content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message cannot be empty"})
		return
	}
	if utf8.RuneCountInString(content) > maxChatMessageLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is too long"})
		return
	}

	msg.Content = content
	if err := h.DB.Save(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update message"})
		return
	}

	item, err := h.buildMessageResponse(msg, userID, h.currentRole(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load updated message"})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *ChatHandler) DeleteMessage(c *gin.Context) {
	userID := c.GetUint("user_id")
	role := h.currentRole(c)
	messageID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var msg models.ChatMessage
	if err := h.DB.First(&msg, uint(messageID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load message"})
		return
	}

	if msg.UserID != userID && role != models.RoleAdmin && role != models.RoleOrg {
		c.JSON(http.StatusForbidden, gin.H{"error": "you cannot delete this message"})
		return
	}
	if err := h.DB.Delete(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete message"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *ChatHandler) resolveRequestedChannel(userID uint, rawScope string) (models.ChatChannel, *models.Section, error) {
	channel, err := parseChatChannel(rawScope)
	if err != nil {
		return "", nil, err
	}
	if channel == models.ChatChannelConference {
		return channel, nil, nil
	}

	section, err := h.resolveSectionByUser(userID)
	if err != nil {
		return "", nil, err
	}
	return channel, section, nil
}

func (h *ChatHandler) resolveSectionByUser(userID uint) (*models.Section, error) {
	var profile models.Profile
	if err := h.DB.Select("user_id", "section_id").Where("user_id = ?", userID).First(&profile).Error; err != nil {
		return nil, err
	}
	if profile.SectionID == nil {
		return nil, errUserHasNoSection
	}

	var section models.Section
	if err := h.DB.Select("id", "title").First(&section, *profile.SectionID).Error; err != nil {
		return nil, err
	}
	return &section, nil
}

func (h *ChatHandler) buildChannelResponses(userID uint) ([]chatChannelResponse, error) {
	var totalUsers int64
	if err := h.DB.Model(&models.User{}).Count(&totalUsers).Error; err != nil {
		return nil, err
	}

	conferenceCount, conferenceLastAt, err := h.chatStats(models.ChatChannelConference, nil)
	if err != nil {
		return nil, err
	}

	section, sectionErr := h.resolveSectionByUser(userID)
	if sectionErr != nil && !errors.Is(sectionErr, errUserHasNoSection) {
		return nil, sectionErr
	}

	channels := []chatChannelResponse{
		{
			Scope:         string(models.ChatChannelConference),
			Title:         "Главный чат конференции",
			Description:   "Общий канал для участников, докладчиков и организаторов.",
			Available:     true,
			MemberCount:   totalUsers,
			MessageCount:  conferenceCount,
			LastMessageAt: conferenceLastAt,
		},
	}

	sectionChannel := chatChannelResponse{
		Scope:       string(models.ChatChannelSection),
		Title:       "Чат вашей секции",
		Description: "Станет доступен после выбора секции в личном кабинете.",
		Available:   false,
	}

	if section != nil {
		var sectionMembers int64
		if err := h.DB.Model(&models.Profile{}).Where("section_id = ?", section.ID).Count(&sectionMembers).Error; err != nil {
			return nil, err
		}

		sectionCount, sectionLastAt, err := h.chatStats(models.ChatChannelSection, &section.ID)
		if err != nil {
			return nil, err
		}

		sectionChannel = chatChannelResponse{
			Scope:         string(models.ChatChannelSection),
			Title:         fmt.Sprintf("Секция: %s", section.Title),
			Description:   "Закрытый канал для участников вашей секции.",
			Available:     true,
			SectionID:     &section.ID,
			MemberCount:   sectionMembers,
			MessageCount:  sectionCount,
			LastMessageAt: sectionLastAt,
		}
	}

	channels = append(channels, sectionChannel)
	return channels, nil
}

func (h *ChatHandler) loadMessages(channel models.ChatChannel, section *models.Section) ([]models.ChatMessage, error) {
	query := h.DB.Model(&models.ChatMessage{})
	switch channel {
	case models.ChatChannelConference:
		query = query.Where("channel = ?", models.ChatChannelConference)
	case models.ChatChannelSection:
		query = query.Where("channel = ? AND section_id = ?", models.ChatChannelSection, section.ID)
	default:
		return nil, errInvalidChatScope
	}

	var msgs []models.ChatMessage
	if err := query.Order("created_at desc").Limit(maxChatMessages).Find(&msgs).Error; err != nil {
		return nil, err
	}
	slices.Reverse(msgs)
	return msgs, nil
}

func (h *ChatHandler) chatStats(channel models.ChatChannel, sectionID *uint) (int64, *time.Time, error) {
	query := h.DB.Model(&models.ChatMessage{}).Where("channel = ?", channel)
	if channel == models.ChatChannelSection && sectionID != nil {
		query = query.Where("section_id = ?", *sectionID)
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, nil, err
	}

	var lastMessage models.ChatMessage
	if err := query.Order("created_at desc").Take(&lastMessage).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return count, nil, nil
		}
		return 0, nil, err
	}

	lastAt := lastMessage.CreatedAt
	return count, &lastAt, nil
}

func (h *ChatHandler) buildMessageResponses(msgs []models.ChatMessage, currentUserID uint, role models.Role) ([]chatMessageResponse, error) {
	if len(msgs) == 0 {
		return []chatMessageResponse{}, nil
	}

	userIDs := make([]uint, 0, len(msgs))
	seen := make(map[uint]struct{})
	for _, msg := range msgs {
		if _, exists := seen[msg.UserID]; exists {
			continue
		}
		seen[msg.UserID] = struct{}{}
		userIDs = append(userIDs, msg.UserID)
	}

	var profiles []models.Profile
	if err := h.DB.
		Select("user_id", "full_name", "organization", "position").
		Where("user_id IN ?", userIDs).
		Find(&profiles).Error; err != nil {
		return nil, err
	}

	profileByUserID := make(map[uint]models.Profile, len(profiles))
	for _, profile := range profiles {
		profileByUserID[profile.UserID] = profile
	}

	items := make([]chatMessageResponse, 0, len(msgs))
	for _, msg := range msgs {
		profile := profileByUserID[msg.UserID]
		userName := strings.TrimSpace(profile.FullName)
		if userName == "" {
			userName = fmt.Sprintf("Участник #%d", msg.UserID)
		}

		var editedAt *time.Time
		if msg.UpdatedAt.After(msg.CreatedAt) {
			edited := msg.UpdatedAt
			editedAt = &edited
		}

		isOwn := msg.UserID == currentUserID
		items = append(items, chatMessageResponse{
			ID:        msg.ID,
			Scope:     string(msg.Channel),
			SectionID: msg.SectionID,
			UserID:    msg.UserID,
			UserName:  userName,
			UserMeta:  buildChatUserMeta(profile),
			Content:   msg.Content,
			CreatedAt: msg.CreatedAt,
			EditedAt:  editedAt,
			IsOwn:     isOwn,
			CanEdit:   isOwn,
			CanDelete: isOwn || role == models.RoleAdmin || role == models.RoleOrg,
		})
	}

	return items, nil
}

func (h *ChatHandler) buildMessageResponse(msg models.ChatMessage, currentUserID uint, role models.Role) (chatMessageResponse, error) {
	items, err := h.buildMessageResponses([]models.ChatMessage{msg}, currentUserID, role)
	if err != nil {
		return chatMessageResponse{}, err
	}
	return items[0], nil
}

func (h *ChatHandler) currentRole(c *gin.Context) models.Role {
	roleValue, _ := c.Get("role")
	role, _ := roleValue.(models.Role)
	return role
}

func (h *ChatHandler) writeScopeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errUserHasNoSection):
		c.JSON(http.StatusForbidden, gin.H{"error": "чат секции доступен только после выбора секции"})
	case errors.Is(err, errInvalidChatScope):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid chat scope"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to resolve chat scope"})
	}
}

func parseChatChannel(raw string) (models.ChatChannel, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", string(models.ChatChannelConference):
		return models.ChatChannelConference, nil
	case string(models.ChatChannelSection):
		return models.ChatChannelSection, nil
	default:
		return "", errInvalidChatScope
	}
}

func buildChatUserMeta(profile models.Profile) string {
	position := strings.TrimSpace(profile.Position)
	organization := strings.TrimSpace(profile.Organization)

	switch {
	case position != "" && organization != "":
		return position + " · " + organization
	case position != "":
		return position
	case organization != "":
		return organization
	default:
		return ""
	}
}

func findChannelResponse(channels []chatChannelResponse, scope models.ChatChannel) (chatChannelResponse, bool) {
	for _, channel := range channels {
		if channel.Scope == string(scope) {
			return channel, true
		}
	}
	return chatChannelResponse{}, false
}
