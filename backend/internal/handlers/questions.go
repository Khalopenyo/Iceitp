package handlers

import (
	"conferenceplatforma/internal/models"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	qrcode "github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

const maxQuestionLength = 1000

type QuestionHandler struct {
	DB         *gorm.DB
	JWTSecret  string
	AppBaseURL string
}

type questionEntry struct {
	ID           uint                  `json:"id"`
	ConferenceID uint                  `json:"conference_id"`
	UserID       *uint                 `json:"user_id,omitempty"`
	AuthorName   string                `json:"author_name,omitempty"`
	UserEmail    string                `json:"user_email,omitempty"`
	Text         string                `json:"text"`
	Status       models.QuestionStatus `json:"status"`
	CreatedAt    string                `json:"created_at"`
	ModeratedAt  string                `json:"moderated_at,omitempty"`
}

type publicApprovedQuestionEntry struct {
	ID          uint   `json:"id"`
	AuthorName  string `json:"author_name"`
	Text        string `json:"text"`
	CreatedAt   string `json:"created_at"`
	ModeratedAt string `json:"moderated_at,omitempty"`
}

func (h *QuestionHandler) PublicQuestionContext(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	context, err := loadQuestionTokenContext(h.DB, h.JWTSecret, token)
	if err != nil {
		writeQuestionTokenError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conference": gin.H{
			"id":    context.Conference.ID,
			"title": context.Conference.Title,
		},
	})
}

func (h *QuestionHandler) CreatePublicQuestion(c *gin.Context) {
	var payload struct {
		Token      string `json:"token"`
		AuthorName string `json:"author_name"`
		Text       string `json:"text"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	token := strings.TrimSpace(payload.Token)
	authorName := strings.TrimSpace(payload.AuthorName)
	text := strings.TrimSpace(payload.Text)
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "question is required"})
		return
	}
	if authorName != "" && utf8.RuneCountInString(authorName) > 255 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "author name is too long"})
		return
	}
	if utf8.RuneCountInString(text) > maxQuestionLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "question is too long"})
		return
	}

	context, err := loadQuestionTokenContext(h.DB, h.JWTSecret, token)
	if err != nil {
		writeQuestionTokenError(c, err)
		return
	}

	question := models.Question{
		ConferenceID: context.Conference.ID,
		AuthorName:   authorName,
		Text:         text,
		Status:       models.QuestionStatusPending,
	}
	if err := h.DB.Create(&question).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save question"})
		return
	}

	c.JSON(http.StatusCreated, questionEntry{
		ID:           question.ID,
		ConferenceID: question.ConferenceID,
		AuthorName:   question.AuthorName,
		Text:         question.Text,
		Status:       question.Status,
		CreatedAt:    question.CreatedAt.Format(time.RFC3339),
	})
}

func (h *QuestionHandler) ApprovedQuestions(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	context, err := loadQuestionTokenContext(h.DB, h.JWTSecret, token)
	if err != nil {
		writeQuestionTokenError(c, err)
		return
	}

	response := make([]publicApprovedQuestionEntry, 0)
	if err := h.DB.Model(&models.Question{}).
		Where("conference_id = ? AND status = ?", context.Conference.ID, models.QuestionStatusApproved).
		Select("id, author_name, text, created_at, moderated_at").
		Order("COALESCE(moderated_at, created_at) desc").
		Order("created_at desc").
		Scan(&response).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load approved questions"})
		return
	}

	for i := range response {
		if response[i].CreatedAt != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, response[i].CreatedAt); err == nil {
				response[i].CreatedAt = parsed.Format(time.RFC3339)
			}
		}
		if response[i].ModeratedAt != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, response[i].ModeratedAt); err == nil {
				response[i].ModeratedAt = parsed.Format(time.RFC3339)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"conference": gin.H{
			"id":    context.Conference.ID,
			"title": context.Conference.Title,
		},
		"items": response,
	})
}

func (h *QuestionHandler) QuestionQR(c *gin.Context) {
	var conf models.Conference
	if err := h.DB.Order("id asc").First(&conf).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "conference not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	token, err := h.generateQuestionToken(conf.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate question token"})
		return
	}

	pageURL := h.questionPageURL(token)
	qrBytes, err := qrcode.Encode(pageURL, qrcode.Medium, 280)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate question qr"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conference": gin.H{
			"id":    conf.ID,
			"title": conf.Title,
		},
		"token":        token,
		"url":          pageURL,
		"approved_url": h.approvedQuestionsPageURL(token),
		"qr_data_url":  "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrBytes),
	})
}

func (h *QuestionHandler) ListQuestions(c *gin.Context) {
	page, pageSize := parsePagination(c, 20, 100)
	searchQuery := strings.ToLower(strings.TrimSpace(c.Query("q")))
	statusFilter := models.QuestionStatus(strings.TrimSpace(c.Query("status")))

	tx := h.DB.Table("questions").
		Joins("LEFT JOIN users ON users.id = questions.user_id").
		Joins("LEFT JOIN profiles ON profiles.user_id = users.id")

	if searchQuery != "" {
		pattern := "%" + searchQuery + "%"
		tx = tx.Where(
			"LOWER(COALESCE(questions.author_name, '')) LIKE ? OR LOWER(COALESCE(profiles.full_name, '')) LIKE ? OR LOWER(COALESCE(users.email, '')) LIKE ? OR LOWER(COALESCE(questions.text, '')) LIKE ?",
			pattern,
			pattern,
			pattern,
			pattern,
		)
	}
	if statusFilter == models.QuestionStatusPending || statusFilter == models.QuestionStatusApproved || statusFilter == models.QuestionStatusRejected {
		tx = tx.Where("questions.status = ?", statusFilter)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count questions"})
		return
	}

	response := make([]questionEntry, 0)
	if err := tx.Select(`
			questions.id,
			questions.conference_id,
			questions.user_id,
			CASE
				WHEN TRIM(COALESCE(questions.author_name, '')) <> '' THEN questions.author_name
				WHEN TRIM(COALESCE(profiles.full_name, '')) <> '' THEN profiles.full_name
				ELSE COALESCE(users.email, '')
			END AS author_name,
			COALESCE(users.email, '') AS user_email,
			questions.text,
			questions.status,
			questions.created_at,
			questions.moderated_at
		`).
		Order("CASE WHEN questions.status = 'pending' THEN 0 ELSE 1 END").
		Order("questions.created_at desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Scan(&response).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list questions"})
		return
	}
	if response == nil {
		response = []questionEntry{}
	}

	for i := range response {
		if response[i].CreatedAt != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, response[i].CreatedAt); err == nil {
				response[i].CreatedAt = parsed.Format(time.RFC3339)
			}
		}
		if response[i].ModeratedAt != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, response[i].ModeratedAt); err == nil {
				response[i].ModeratedAt = parsed.Format(time.RFC3339)
			}
		}
	}

	c.JSON(http.StatusOK, paginatedResponse[questionEntry]{
		Items:    response,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

func (h *QuestionHandler) UpdateQuestionStatus(c *gin.Context) {
	id := c.Param("id")
	var payload struct {
		Status models.QuestionStatus `json:"status"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	switch payload.Status {
	case models.QuestionStatusPending, models.QuestionStatusApproved, models.QuestionStatusRejected:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	var question models.Question
	if err := h.DB.First(&question, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load question"})
		return
	}

	moderatorID := c.GetUint("user_id")
	now := time.Now().UTC()
	question.Status = payload.Status
	question.ModeratedByID = &moderatorID
	question.ModeratedAt = &now

	if err := h.DB.Save(&question).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update question status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           question.ID,
		"status":       question.Status,
		"moderated_at": question.ModeratedAt,
	})
}

func (h *QuestionHandler) generateQuestionToken(conferenceID uint) (string, error) {
	claims := jwt.MapClaims{
		"type":          "question",
		"conference_id": conferenceID,
		"iat":           time.Now().Unix(),
		"exp":           time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.JWTSecret))
}

func (h *QuestionHandler) questionPageURL(token string) string {
	base := strings.TrimSpace(h.AppBaseURL)
	if base == "" {
		return "/questions/" + url.PathEscape(token)
	}
	return strings.TrimSuffix(base, "/") + "/questions/" + url.PathEscape(token)
}

func (h *QuestionHandler) approvedQuestionsPageURL(token string) string {
	base := strings.TrimSpace(h.AppBaseURL)
	if base == "" {
		return "/questions/" + url.PathEscape(token) + "/approved"
	}
	return strings.TrimSuffix(base, "/") + "/questions/" + url.PathEscape(token) + "/approved"
}

func writeQuestionTokenError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errInvalidBadgeToken):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid question token"})
	case errors.Is(err, errInvalidTokenType):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token type"})
	case errors.Is(err, errInvalidTokenPayload):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token payload"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "conference not found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load question form"})
	}
}
