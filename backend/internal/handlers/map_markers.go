package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MapMarkerHandler struct {
	DB *gorm.DB
}

func (h *MapMarkerHandler) ListMarkers(c *gin.Context) {
	var markers []models.MapMarker
	if err := h.DB.Order("id asc").Find(&markers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list markers"})
		return
	}
	c.JSON(http.StatusOK, markers)
}

func (h *MapMarkerHandler) ReplaceMarkers(c *gin.Context) {
	var payload []models.MapMarker
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	seenKeys := map[string]struct{}{}
	for i := range payload {
		payload[i].Key = strings.TrimSpace(payload[i].Key)
		payload[i].Label = strings.TrimSpace(payload[i].Label)
		payload[i].Color = strings.TrimSpace(payload[i].Color)
		if payload[i].Key == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker key is required", "index": i})
			return
		}
		if payload[i].Label == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker label is required", "index": i, "key": payload[i].Key})
			return
		}
		if _, ok := seenKeys[payload[i].Key]; ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate marker key", "index": i, "key": payload[i].Key})
			return
		}
		seenKeys[payload[i].Key] = struct{}{}

		if payload[i].Floor <= 0 {
			payload[i].Floor = 1
		}
		if payload[i].Color == "" {
			payload[i].Color = "primary"
		}
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM map_markers").Error; err != nil {
			return err
		}
		for _, m := range payload {
			marker := models.MapMarker{
				Key:   m.Key,
				Label: m.Label,
				X:     m.X,
				Y:     m.Y,
				Floor: m.Floor,
				Color: m.Color,
			}
			if err := tx.Create(&marker).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		// Return details to help debug bad payload / DB constraint issues during development.
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save markers", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
