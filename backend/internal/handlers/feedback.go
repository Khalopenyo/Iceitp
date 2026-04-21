package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxFeedbackCommentLength = 3000

type FeedbackHandler struct {
	DB *gorm.DB
}

type feedbackEntry struct {
	ID        uint   `json:"id"`
	UserID    uint   `json:"user_id"`
	UserName  string `json:"user_name"`
	UserEmail string `json:"user_email"`
	Rating    int    `json:"rating"`
	Comment   string `json:"comment"`
	CreatedAt string `json:"created_at"`
}

func (h *FeedbackHandler) CreateFeedback(c *gin.Context) {
	userID := c.GetUint("user_id")
	var payload struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	comment := strings.TrimSpace(payload.Comment)
	if payload.Rating < 1 || payload.Rating > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rating must be between 1 and 5"})
		return
	}
	if comment == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "comment is required"})
		return
	}
	if utf8.RuneCountInString(comment) > maxFeedbackCommentLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "comment is too long"})
		return
	}
	feedback := models.Feedback{UserID: userID, Rating: payload.Rating, Comment: comment}
	if err := h.DB.Create(&feedback).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save feedback"})
		return
	}
	c.JSON(http.StatusCreated, feedback)
}

func (h *FeedbackHandler) ListFeedback(c *gin.Context) {
	page, pageSize := parsePagination(c, 20, 100)
	searchQuery := strings.ToLower(strings.TrimSpace(c.Query("q")))
	ratingFilter := parsePositiveInt(c.Query("rating"), 0)

	tx := h.DB.Table("feedbacks").
		Joins("LEFT JOIN users ON users.id = feedbacks.user_id").
		Joins("LEFT JOIN profiles ON profiles.user_id = users.id")

	if searchQuery != "" {
		pattern := "%" + searchQuery + "%"
		tx = tx.Where(
			"LOWER(COALESCE(profiles.full_name, '')) LIKE ? OR LOWER(COALESCE(users.email, '')) LIKE ? OR LOWER(COALESCE(feedbacks.comment, '')) LIKE ?",
			pattern,
			pattern,
			pattern,
		)
	}
	if ratingFilter >= 1 && ratingFilter <= 5 {
		tx = tx.Where("feedbacks.rating = ?", ratingFilter)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count feedback"})
		return
	}

	var response []feedbackEntry
	if err := tx.Select(`
			feedbacks.id,
			feedbacks.user_id,
			CASE
				WHEN TRIM(COALESCE(profiles.full_name, '')) <> '' THEN profiles.full_name
				ELSE COALESCE(users.email, '')
			END AS user_name,
			COALESCE(users.email, '') AS user_email,
			feedbacks.rating,
			feedbacks.comment,
			feedbacks.created_at
		`).
		Order("feedbacks.created_at desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Scan(&response).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list feedback"})
		return
	}

	for i := range response {
		if response[i].CreatedAt != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, response[i].CreatedAt); err == nil {
				response[i].CreatedAt = parsed.Format(time.RFC3339)
			}
		}
	}

	c.JSON(http.StatusOK, paginatedResponse[feedbackEntry]{
		Items:    response,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}
