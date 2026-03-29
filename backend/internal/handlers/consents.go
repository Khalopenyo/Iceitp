package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ConsentHandler struct {
	DB *gorm.DB
}

func (h *ConsentHandler) ListConsents(c *gin.Context) {
	var consents []models.ConsentLog
	if err := h.DB.Order("granted_at desc").Find(&consents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list consents"})
		return
	}
	c.JSON(http.StatusOK, consents)
}
