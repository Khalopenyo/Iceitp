package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RoomHandler struct {
	DB *gorm.DB
}

func (h *RoomHandler) ListRooms(c *gin.Context) {
	var rooms []models.Room
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Order("floor asc, name asc").Find(&rooms).Error; err != nil {
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
	if cid := tenant.ConfID(c); cid != 0 {
		payload.ConferenceID = &cid
	}
	if err := tenant.DB(c, h.DB).Create(&payload).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create room"})
		return
	}
	c.JSON(http.StatusCreated, payload)
}

func (h *RoomHandler) DeleteRoom(c *gin.Context) {
	id := c.Param("id")
	err := tenant.DB(c, h.DB).Transaction(func(tx *gorm.DB) error {
		if err := tx.Scopes(tenant.ByConference(c)).Model(&models.ProgramAssignment{}).
			Where("room_id = ?", id).Update("room_id", nil).Error; err != nil {
			return err
		}
		return tx.Scopes(tenant.ByConference(c)).Where("id = ?", id).Delete(&models.Room{}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete room"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
