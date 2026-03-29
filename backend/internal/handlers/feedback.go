package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type FeedbackHandler struct {
	DB *gorm.DB
}

func (h *FeedbackHandler) CreateFeedback(c *gin.Context) {
	userID := c.GetUint("user_id")
	var payload struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Rating < 1 || payload.Rating > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	feedback := models.Feedback{UserID: userID, Rating: payload.Rating, Comment: payload.Comment}
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
	c.JSON(http.StatusOK, feedback)
}
