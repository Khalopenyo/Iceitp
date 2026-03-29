package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RoomHandler struct {
	DB *gorm.DB
}

func (h *RoomHandler) ListRooms(c *gin.Context) {
	var rooms []models.Room
	if err := h.DB.Order("floor asc, name asc").Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list rooms"})
		return
	}
	c.JSON(http.StatusOK, rooms)
}

func (h *RoomHandler) CreateRoom(c *gin.Context) {
	var payload models.Room
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	if err := h.DB.Create(&payload).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create room"})
		return
	}
	c.JSON(http.StatusCreated, payload)
}

func (h *RoomHandler) DeleteRoom(c *gin.Context) {
	id := c.Param("id")
	if err := h.DB.Delete(&models.Room{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete room"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
