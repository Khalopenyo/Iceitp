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
	var feedback []models.Feedback
	if err := h.DB.Order("created_at desc").Find(&feedback).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list feedback"})
		return
	}
	if len(feedback) == 0 {
		c.JSON(http.StatusOK, []feedbackEntry{})
		return
	}

	userIDs := make([]uint, 0, len(feedback))
	seen := make(map[uint]struct{}, len(feedback))
	for _, item := range feedback {
		if _, ok := seen[item.UserID]; ok {
			continue
		}
		seen[item.UserID] = struct{}{}
		userIDs = append(userIDs, item.UserID)
	}

	var users []models.User
	if err := h.DB.Preload("Profile").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load feedback authors"})
		return
	}
	userByID := make(map[uint]models.User, len(users))
	for _, user := range users {
		userByID[user.ID] = user
	}

	response := make([]feedbackEntry, 0, len(feedback))
	for _, item := range feedback {
		user := userByID[item.UserID]
		userName := strings.TrimSpace(user.Profile.FullName)
		if userName == "" {
			userName = user.Email
		}
		response = append(response, feedbackEntry{
			ID:        item.ID,
			UserID:    item.UserID,
			UserName:  userName,
			UserEmail: user.Email,
			Rating:    item.Rating,
			Comment:   item.Comment,
			CreatedAt: item.CreatedAt.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, response)
}
