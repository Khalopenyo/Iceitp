package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"encoding/json"
	"errors"
	"log"
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
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Order("id asc").Find(&routes).Error; err != nil {
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

	// Normalize to the 0..1 unit space used everywhere else (markers, shapes and the
	// bulk /admin/map writer all use clampUnit). Routes were the lone path clamping
	// to 0..100, which could leave mixed-unit point arrays in one table. The console
	// editor already sends 0..1, so this is a no-op for it and only corrects
	// out-of-range input — it ends the dual-coordinate-system hazard.
	for i := range payload.Points {
		payload.Points[i].X = clampUnit(payload.Points[i].X)
		payload.Points[i].Y = clampUnit(payload.Points[i].Y)
	}

	// Empty points => delete route.
	if len(payload.Points) == 0 {
		if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Where("from_key = ? AND to_key = ? AND floor = ?", payload.FromKey, payload.ToKey, payload.Floor).
			Delete(&models.MapRoute{}).Error; err != nil {
			log.Printf("UpsertRoute: delete failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete route"})
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
	err = tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Where("from_key = ? AND to_key = ? AND floor = ?", payload.FromKey, payload.ToKey, payload.Floor).
		First(&existing).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			route := models.MapRoute{
				FromKey: payload.FromKey,
				ToKey:   payload.ToKey,
				Floor:   payload.Floor,
				Points:  pointsJSON,
			}
			if cid := tenant.ConfID(c); cid != 0 {
				route.ConferenceID = &cid
			}
			if err := tenant.DB(c, h.DB).Create(&route).Error; err != nil {
				log.Printf("UpsertRoute: create failed: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save route"})
				return
			}
			c.JSON(http.StatusOK, route)
			return
		}
		log.Printf("UpsertRoute: load failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load route"})
		return
	}

	existing.Points = pointsJSON
	existing.Floor = payload.Floor
	if err := tenant.DB(c, h.DB).Save(&existing).Error; err != nil {
		log.Printf("UpsertRoute: save failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save route"})
		return
	}
	c.JSON(http.StatusOK, existing)
}
