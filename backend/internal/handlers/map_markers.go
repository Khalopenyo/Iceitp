package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MapMarkerHandler struct {
	DB *gorm.DB
}

const (
	maxMarkers         = 200 // набор отдаётся каждому посетителю карты — ограничиваем
	maxMarkerKeyLen    = 64
	maxMarkerLabelLen  = 120
	defaultMarkerColor = "#4f46e5" // первый цвет палитры консоли (ConsoleMap COLORS)
)

// Цвет маркера попадает в inline-стиль background на публичной карте; ограничиваем
// строгим 6-значным hex, чтобы клиент не записал произвольное CSS-значение.
var markerColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func clampUnit(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func (h *MapMarkerHandler) ListMarkers(c *gin.Context) {
	var markers []models.MapMarker
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Order("id asc").Find(&markers).Error; err != nil {
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
	if len(payload) > maxMarkers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many markers", "max": maxMarkers})
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
		if len(payload[i].Key) > maxMarkerKeyLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker key too long", "index": i})
			return
		}
		if payload[i].Label == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker label is required", "index": i, "key": payload[i].Key})
			return
		}
		if len(payload[i].Label) > maxMarkerLabelLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker label too long", "index": i, "key": payload[i].Key})
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
		// Координаты нормализованы (0..1); клиентский clamp дублируем на сервере.
		payload[i].X = clampUnit(payload[i].X)
		payload[i].Y = clampUnit(payload[i].Y)
		// Цвет: пусто → дефолт палитры; иначе только строгий hex.
		if payload[i].Color == "" {
			payload[i].Color = defaultMarkerColor
		} else if !markerColorRe.MatchString(payload[i].Color) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker color must be a #rrggbb hex value", "index": i, "key": payload[i].Key})
			return
		}
	}
	// A resolved tenant with no active conference must NOT run the bulk replace:
	// the legacy replace-all path below would wipe every tenant's markers. Reject
	// it instead of destroying data. (No resolved scope — unit tests / single-tenant
	// without middleware — still uses the legacy path.)
	if scope, ok := tenant.FromContext(c); ok && scope.ConfID == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "no active conference for this organization"})
		return
	}
	var confID *uint
	if cid := tenant.ConfID(c); cid != 0 {
		confID = &cid
	}
	err := tenant.DB(c, h.DB).Transaction(func(tx *gorm.DB) error {
		// Replace only the current tenant's markers. A global "DELETE FROM
		// map_markers" would wipe every conference's markers; scope it to the
		// resolved conference. With no scope (single-tenant / unit tests) we keep
		// the legacy replace-all behaviour. "1 = 1" satisfies GORM's
		// missing-WHERE guard for that fallback.
		del := tx.Where("1 = 1")
		if confID != nil {
			del = tx.Where("conference_id = ?", *confID)
		}
		if err := del.Delete(&models.MapMarker{}).Error; err != nil {
			return err
		}
		for _, m := range payload {
			marker := models.MapMarker{
				ConferenceID: confID,
				Key:          m.Key,
				Label:        m.Label,
				X:            m.X,
				Y:            m.Y,
				Floor:        m.Floor,
				Color:        m.Color,
			}
			if err := tx.Create(&marker).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("ReplaceMarkers: save failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save markers"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
