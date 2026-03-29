package handlers

import (
	"conferenceplatforma/internal/models"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MapRouteHandler struct {
	DB *gorm.DB
}

type mapRoutePoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type upsertMapRoutePayload struct {
	FromKey string          `json:"from_key"`
	ToKey   string          `json:"to_key"`
	Floor   int             `json:"floor"`
	Points  []mapRoutePoint `json:"points"`
}

func (h *MapRouteHandler) ListRoutes(c *gin.Context) {
	var routes []models.MapRoute
	if err := h.DB.Order("id asc").Find(&routes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list routes"})
		return
	}
	c.JSON(http.StatusOK, routes)
}

// UpsertRoute creates or updates a single route.
// If payload.points is empty, the route will be deleted (if it exists).
func (h *MapRouteHandler) UpsertRoute(c *gin.Context) {
	var payload upsertMapRoutePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	payload.FromKey = strings.TrimSpace(payload.FromKey)
	payload.ToKey = strings.TrimSpace(payload.ToKey)
	if payload.FromKey == "" || payload.ToKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from_key and to_key are required"})
		return
	}
	if payload.FromKey == payload.ToKey {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from_key and to_key must be different"})
		return
	}
	if payload.Floor <= 0 {
		payload.Floor = 1
	}

	// Validate and normalize points.
	for i := range payload.Points {
		if payload.Points[i].X < 0 {
			payload.Points[i].X = 0
		}
		if payload.Points[i].X > 100 {
			payload.Points[i].X = 100
		}
		if payload.Points[i].Y < 0 {
			payload.Points[i].Y = 0
		}
		if payload.Points[i].Y > 100 {
			payload.Points[i].Y = 100
		}
	}

	// Empty points => delete route.
	if len(payload.Points) == 0 {
		if err := h.DB.Where("from_key = ? AND to_key = ? AND floor = ?", payload.FromKey, payload.ToKey, payload.Floor).
			Delete(&models.MapRoute{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete route", "details": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "deleted"})
		return
	}

	pointsJSON, err := json.Marshal(payload.Points)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid points"})
		return
	}

	var existing models.MapRoute
	err = h.DB.Where("from_key = ? AND to_key = ? AND floor = ?", payload.FromKey, payload.ToKey, payload.Floor).
		First(&existing).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			route := models.MapRoute{
				FromKey: payload.FromKey,
				ToKey:   payload.ToKey,
				Floor:   payload.Floor,
				Points:  pointsJSON,
			}
			if err := h.DB.Create(&route).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save route", "details": err.Error()})
				return
			}
			c.JSON(http.StatusOK, route)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load route", "details": err.Error()})
		return
	}

	existing.Points = pointsJSON
	existing.Floor = payload.Floor
	if err := h.DB.Save(&existing).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save route", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, existing)
}
