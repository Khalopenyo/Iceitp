package handlers

import (
	"context"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/objectstore"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	maxChatMessages           = 150
	maxChatMessageLength      = 2000
	defaultChatAttachmentMax  = 5
	defaultChatAttachmentSize = 10 * 1024 * 1024
)

type ChatHandler struct {
	DB                       *gorm.DB
	Store                    objectstore.Store
	MaxAttachmentSizeBytes   int64
	MaxAttachmentsPerMessage int
}

var errUserHasNoSection = errors.New("user has no section")
var errInvalidChatScope = errors.New("invalid chat scope")
var errUnauthorizedChatAttachment = errors.New("unauthorized chat attachment")

var allowedChatAttachmentExtensions = map[string]struct{}{
	".csv":  {},
	".doc":  {},
	".docx": {},
	".jpeg": {},
	".jpg":  {},
	".pdf":  {},
	".png":  {},
	".ppt":  {},
	".pptx": {},
	".txt":  {},
	".xls":  {},
	".xlsx": {},
}

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

type chatAttachmentResponse struct {
	ID          uint   `json:"id"`
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	FileSize    int64  `json:"file_size"`
	DownloadURL string `json:"download_url"`
}

type chatMessageResponse struct {
	ID          uint                     `json:"id"`
	Scope       string                   `json:"scope"`
	SectionID   *uint                    `json:"section_id,omitempty"`
	UserID      uint                     `json:"user_id"`
	UserName    string                   `json:"user_name"`
	UserMeta    string                   `json:"user_meta,omitempty"`
	Content     string                   `json:"content"`
	Attachments []chatAttachmentResponse `json:"attachments"`
	CreatedAt   time.Time                `json:"created_at"`
	EditedAt    *time.Time               `json:"edited_at,omitempty"`
	IsOwn       bool                     `json:"is_own"`
	CanEdit     bool                     `json:"can_edit"`
	CanDelete   bool                     `json:"can_delete"`
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
	role := h.currentRole(c)

	payload, files, err := h.parseMessageSubmission(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	channel, section, err := h.resolveRequestedChannel(userID, payload.Scope)
	if err != nil {
		h.writeScopeError(c, err)
		return
	}

	content := strings.TrimSpace(payload.Content)
	if err := validateChatContent(content, len(files) > 0); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	var attachments []models.ChatAttachment
	var storedKeys []string
	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&msg).Error; err != nil {
			return err
		}
		attachments, storedKeys, err = h.storeChatAttachments(c.Request.Context(), files, channel, section, msg.ID)
		if err != nil {
			return err
		}
		if len(attachments) == 0 {
			return nil
		}
		return tx.Create(&attachments).Error
	}); err != nil {
		for _, key := range storedKeys {
			if h.Store != nil {
				_ = h.Store.Delete(c.Request.Context(), key)
			}
		}
		if errors.Is(err, errInvalidChatScope) || errors.Is(err, errUserHasNoSection) {
			h.writeScopeError(c, err)
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msg.Attachments = attachments
	item, err := h.buildMessageResponse(msg, userID, role)
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
	if err := validateChatContent(content, false); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	if err := h.DB.Preload("Attachments").First(&msg, uint(messageID)).Error; err != nil {
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

	objectKeys := make([]string, 0, len(msg.Attachments))
	for _, attachment := range msg.Attachments {
		objectKeys = append(objectKeys, attachment.ObjectKey)
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("message_id = ?", msg.ID).Delete(&models.ChatAttachment{}).Error; err != nil {
			return err
		}
		return tx.Delete(&msg).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete message"})
		return
	}
	for _, key := range objectKeys {
		if h.Store != nil {
			_ = h.Store.Delete(c.Request.Context(), key)
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *ChatHandler) DownloadAttachment(c *gin.Context) {
	userID := c.GetUint("user_id")
	role := h.currentRole(c)
	attachmentID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment id"})
		return
	}

	var attachment models.ChatAttachment
	if err := h.DB.Preload("Message").First(&attachment, uint(attachmentID)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load attachment"})
		return
	}

	if err := h.authorizeAttachmentAccess(userID, role, attachment.Message); err != nil {
		if errors.Is(err, errUnauthorizedChatAttachment) || errors.Is(err, errUserHasNoSection) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify attachment access"})
		return
	}
	if h.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage is not configured"})
		return
	}

	obj, err := h.Store.Get(c.Request.Context(), attachment.ObjectKey)
	if err != nil {
		if errors.Is(err, objectstore.ErrObjectNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "attachment file not found"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to load attachment file"})
		return
	}
	defer obj.Body.Close()

	if strings.TrimSpace(obj.ContentType) != "" {
		c.Header("Content-Type", obj.ContentType)
	} else if strings.TrimSpace(attachment.ContentType) != "" {
		c.Header("Content-Type", attachment.ContentType)
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", attachment.FileName))
	c.Header("Content-Length", strconv.FormatInt(obj.Size, 10))
	_, _ = io.Copy(c.Writer, obj.Body)
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
	query := h.DB.Model(&models.ChatMessage{}).
		Preload("Attachments", func(db *gorm.DB) *gorm.DB {
			return db.Order("id asc")
		})
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
			ID:          msg.ID,
			Scope:       string(msg.Channel),
			SectionID:   msg.SectionID,
			UserID:      msg.UserID,
			UserName:    userName,
			UserMeta:    buildChatUserMeta(profile),
			Content:     msg.Content,
			Attachments: buildChatAttachmentResponses(msg.Attachments),
			CreatedAt:   msg.CreatedAt,
			EditedAt:    editedAt,
			IsOwn:       isOwn,
			CanEdit:     isOwn,
			CanDelete:   isOwn || role == models.RoleAdmin || role == models.RoleOrg,
		})
	}

	return items, nil
}

func (h *ChatHandler) buildMessageResponse(msg models.ChatMessage, currentUserID uint, role models.Role) (chatMessageResponse, error) {
	var loaded models.ChatMessage
	if err := h.DB.Preload("Attachments", func(db *gorm.DB) *gorm.DB {
		return db.Order("id asc")
	}).First(&loaded, msg.ID).Error; err == nil {
		msg = loaded
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return chatMessageResponse{}, err
	}

	items, err := h.buildMessageResponses([]models.ChatMessage{msg}, currentUserID, role)
	if err != nil {
		return chatMessageResponse{}, err
	}
	return items[0], nil
}

func (h *ChatHandler) parseMessageSubmission(c *gin.Context) (chatMessagePayload, []*multipart.FileHeader, error) {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(c.ContentType())), "multipart/form-data") {
		return h.parseMultipartMessageSubmission(c)
	}

	var payload chatMessagePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		return chatMessagePayload{}, nil, err
	}
	return payload, nil, nil
}

func (h *ChatHandler) parseMultipartMessageSubmission(c *gin.Context) (chatMessagePayload, []*multipart.FileHeader, error) {
	form, err := c.MultipartForm()
	if err != nil {
		return chatMessagePayload{}, nil, err
	}
	files := form.File["files"]
	if len(files) > h.maxAttachmentsPerMessage() {
		return chatMessagePayload{}, nil, fmt.Errorf("too many attachments")
	}
	return chatMessagePayload{
		Scope:   c.PostForm("scope"),
		Content: c.PostForm("content"),
	}, files, nil
}

func (h *ChatHandler) storeChatAttachments(
	ctx context.Context,
	fileHeaders []*multipart.FileHeader,
	channel models.ChatChannel,
	section *models.Section,
	messageID uint,
) ([]models.ChatAttachment, []string, error) {
	if len(fileHeaders) == 0 {
		return nil, nil, nil
	}

	attachments := make([]models.ChatAttachment, 0, len(fileHeaders))
	storedKeys := make([]string, 0, len(fileHeaders))
	for _, fileHeader := range fileHeaders {
		attachment, err := h.saveChatAttachment(ctx, fileHeader, channel, section, messageID)
		if err != nil {
			return nil, storedKeys, err
		}
		attachments = append(attachments, attachment)
		storedKeys = append(storedKeys, attachment.ObjectKey)
	}
	return attachments, storedKeys, nil
}

func (h *ChatHandler) saveChatAttachment(
	ctx context.Context,
	fileHeader *multipart.FileHeader,
	channel models.ChatChannel,
	section *models.Section,
	messageID uint,
) (models.ChatAttachment, error) {
	if fileHeader == nil {
		return models.ChatAttachment{}, errors.New("attachment is required")
	}
	if fileHeader.Size <= 0 {
		return models.ChatAttachment{}, errors.New("attachment cannot be empty")
	}
	if fileHeader.Size > h.maxAttachmentSizeBytes() {
		return models.ChatAttachment{}, errors.New("attachment is too large")
	}

	fileName := sanitizeChatAttachmentFileName(fileHeader.Filename)
	ext := strings.ToLower(filepath.Ext(fileName))
	if _, ok := allowedChatAttachmentExtensions[ext]; !ok {
		return models.ChatAttachment{}, errors.New("attachment type is not allowed")
	}

	src, err := fileHeader.Open()
	if err != nil {
		return models.ChatAttachment{}, err
	}
	defer src.Close()

	header := make([]byte, 512)
	readBytes, err := src.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return models.ChatAttachment{}, err
	}
	contentType := http.DetectContentType(header[:readBytes])
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return models.ChatAttachment{}, err
	}

	if h.Store == nil {
		return models.ChatAttachment{}, objectstore.ErrNotConfigured
	}
	objectKey := h.chatAttachmentObjectKey(channel, section, messageID, fileName)
	if err := h.Store.Put(ctx, objectKey, src, fileHeader.Size, contentType); err != nil {
		return models.ChatAttachment{}, err
	}

	return models.ChatAttachment{
		MessageID:   messageID,
		FileName:    fileName,
		ObjectKey:   objectKey,
		ContentType: contentType,
		FileSize:    fileHeader.Size,
	}, nil
}

func (h *ChatHandler) chatAttachmentObjectKey(
	channel models.ChatChannel,
	section *models.Section,
	messageID uint,
	fileName string,
) string {
	scopeDir := string(channel)
	if channel == models.ChatChannelSection && section != nil {
		scopeDir = fmt.Sprintf("%s/section-%d", scopeDir, section.ID)
	}
	storedName := fmt.Sprintf("%d-%d-%s", messageID, time.Now().UnixNano(), fileName)
	return fmt.Sprintf("chat/%s/%s", scopeDir, storedName)
}

func (h *ChatHandler) authorizeAttachmentAccess(userID uint, role models.Role, message models.ChatMessage) error {
	if message.Channel == models.ChatChannelConference {
		return nil
	}
	if role == models.RoleAdmin || role == models.RoleOrg {
		return nil
	}
	section, err := h.resolveSectionByUser(userID)
	if err != nil {
		return err
	}
	if message.SectionID == nil || section.ID != *message.SectionID {
		return errUnauthorizedChatAttachment
	}
	return nil
}

func (h *ChatHandler) maxAttachmentSizeBytes() int64 {
	if h.MaxAttachmentSizeBytes <= 0 {
		return defaultChatAttachmentSize
	}
	return h.MaxAttachmentSizeBytes
}

func (h *ChatHandler) maxAttachmentsPerMessage() int {
	if h.MaxAttachmentsPerMessage <= 0 {
		return defaultChatAttachmentMax
	}
	return h.MaxAttachmentsPerMessage
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

func validateChatContent(content string, hasFiles bool) error {
	if content == "" && !hasFiles {
		return errors.New("message cannot be empty")
	}
	if utf8.RuneCountInString(content) > maxChatMessageLength {
		return errors.New("message is too long")
	}
	return nil
}

func sanitizeChatAttachmentFileName(fileName string) string {
	fileName = strings.TrimSpace(filepath.Base(fileName))
	fileName = strings.ReplaceAll(fileName, " ", "-")
	fileName = strings.ReplaceAll(fileName, "/", "-")
	fileName = strings.ReplaceAll(fileName, "\\", "-")
	if fileName == "" || fileName == "." {
		return "attachment.txt"
	}
	return fileName
}

func buildChatAttachmentResponses(attachments []models.ChatAttachment) []chatAttachmentResponse {
	if len(attachments) == 0 {
		return []chatAttachmentResponse{}
	}
	items := make([]chatAttachmentResponse, 0, len(attachments))
	for _, attachment := range attachments {
		items = append(items, chatAttachmentResponse{
			ID:          attachment.ID,
			FileName:    attachment.FileName,
			ContentType: attachment.ContentType,
			FileSize:    attachment.FileSize,
			DownloadURL: fmt.Sprintf("/api/chat/attachments/%d", attachment.ID),
		})
	}
	return items
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
