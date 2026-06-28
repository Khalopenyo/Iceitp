package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// VenueMapHandler — единая карта площадки конструктора: фигуры (залы/зоны) +
// маркеры (точки) + маршруты, все по этажам. Один GET на загрузку, один PUT на
// атомарное сохранение всего набора (replace-all в пределах тенанта).
type VenueMapHandler struct {
	DB *gorm.DB
}

const (
	maxShapes         = 300
	maxRoutesPerConf  = 300
	maxRoutePoints    = 200
	maxShapeKeyLen    = 64
	maxShapeLabelLen  = 120
	defaultShapeColor = "#e5e7eb" // нейтральная заливка (палитра фигур, не маркеров)
)

var shapeKinds = map[string]bool{
	"room": true, "zone": true, "hall": true, "entrance": true, "stage": true, "facility": true,
}

type venuePoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type venueRoutePayload struct {
	FromKey string       `json:"from_key"`
	ToKey   string       `json:"to_key"`
	Floor   int          `json:"floor"`
	Points  []venuePoint `json:"points"`
}

type venueMapPayload struct {
	Shapes  []models.MapShape   `json:"shapes"`
	Markers []models.MapMarker  `json:"markers"`
	Routes  []venueRoutePayload `json:"routes"`
}

// GetMap отдаёт всю карту тенанта (по резолвнутому scope: Host для PUB, identity
// для консоли). Пустые наборы — нормальная «пустая карта».
func (h *VenueMapHandler) GetMap(c *gin.Context) {
	db := tenant.DB(c, h.DB)
	var shapes []models.MapShape
	var markers []models.MapMarker
	var routes []models.MapRoute
	if err := db.Scopes(tenant.ByConference(c)).Order("id asc").Find(&shapes).Error; err != nil {
		log.Printf("GetMap: shapes: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load map"})
		return
	}
	if err := db.Scopes(tenant.ByConference(c)).Order("id asc").Find(&markers).Error; err != nil {
		log.Printf("GetMap: markers: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load map"})
		return
	}
	if err := db.Scopes(tenant.ByConference(c)).Order("id asc").Find(&routes).Error; err != nil {
		log.Printf("GetMap: routes: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load map"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"shapes": shapes, "markers": markers, "routes": routes})
}

// ReplaceMap атомарно заменяет фигуры+маркеры+маршруты тенанта. Валидирует всё
// строго на сервере (клиентским ограничениям не доверяем).
func (h *VenueMapHandler) ReplaceMap(c *gin.Context) {
	var payload venueMapPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	markerFloors, ok := validateVenueMarkers(c, payload.Markers)
	if !ok {
		return
	}
	if !validateVenueShapes(c, payload.Shapes) {
		return
	}
	routeRows, ok := validateVenueRoutes(c, payload.Routes, markerFloors)
	if !ok {
		return
	}

	// Резолвнутый тенант без активной конференции не должен запускать replace-all:
	// иначе legacy-путь без conference_id затрёт чужие данные. Отклоняем (409).
	if scope, ok := tenant.FromContext(c); ok && scope.ConfID == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "no active conference for this organization"})
		return
	}
	var confID *uint
	if cid := tenant.ConfID(c); cid != 0 {
		confID = &cid
	}

	err := tenant.DB(c, h.DB).Transaction(func(tx *gorm.DB) error {
		scoped := func(q *gorm.DB) *gorm.DB {
			if confID != nil {
				return q.Where("conference_id = ?", *confID)
			}
			return q.Where("1 = 1")
		}
		if err := scoped(tx).Delete(&models.MapShape{}).Error; err != nil {
			return err
		}
		if err := scoped(tx).Delete(&models.MapMarker{}).Error; err != nil {
			return err
		}
		if err := scoped(tx).Delete(&models.MapRoute{}).Error; err != nil {
			return err
		}
		for i := range payload.Shapes {
			s := payload.Shapes[i]
			s.ID = 0
			s.ConferenceID = confID
			if err := tx.Create(&s).Error; err != nil {
				return err
			}
		}
		for i := range payload.Markers {
			m := payload.Markers[i]
			m.ID = 0
			m.ConferenceID = confID
			if err := tx.Create(&m).Error; err != nil {
				return err
			}
		}
		for i := range routeRows {
			r := routeRows[i]
			r.ConferenceID = confID
			if err := tx.Create(&r).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("ReplaceMap: save failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save map"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// validateVenueMarkers — те же правила, что в ReplaceMarkers; возвращает карту
// ключ→этаж (нужна для проверки, что маршрут на том же этаже, что его концы).
func validateVenueMarkers(c *gin.Context, markers []models.MapMarker) (map[string]int, bool) {
	if len(markers) > maxMarkers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many markers", "max": maxMarkers})
		return nil, false
	}
	floors := map[string]int{}
	for i := range markers {
		markers[i].Key = strings.TrimSpace(markers[i].Key)
		markers[i].Label = strings.TrimSpace(markers[i].Label)
		markers[i].Color = strings.TrimSpace(markers[i].Color)
		if markers[i].Key == "" || len(markers[i].Key) > maxMarkerKeyLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid marker key", "index": i})
			return nil, false
		}
		if markers[i].Label == "" || len(markers[i].Label) > maxMarkerLabelLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid marker label", "index": i})
			return nil, false
		}
		if _, dup := floors[markers[i].Key]; dup {
			c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate marker key", "index": i, "key": markers[i].Key})
			return nil, false
		}
		if markers[i].Floor <= 0 {
			markers[i].Floor = 1
		}
		floors[markers[i].Key] = markers[i].Floor
		markers[i].X = clampUnit(markers[i].X)
		markers[i].Y = clampUnit(markers[i].Y)
		if markers[i].Color == "" {
			markers[i].Color = defaultMarkerColor
		} else if !markerColorRe.MatchString(markers[i].Color) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "marker color must be #rrggbb", "index": i})
			return nil, false
		}
	}
	return floors, true
}

func validateVenueShapes(c *gin.Context, shapes []models.MapShape) bool {
	if len(shapes) > maxShapes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many shapes", "max": maxShapes})
		return false
	}
	keys := map[string]struct{}{}
	for i := range shapes {
		shapes[i].Key = strings.TrimSpace(shapes[i].Key)
		shapes[i].Kind = strings.TrimSpace(shapes[i].Kind)
		shapes[i].Label = strings.TrimSpace(shapes[i].Label)
		shapes[i].Color = strings.TrimSpace(shapes[i].Color)
		if shapes[i].Key == "" || len(shapes[i].Key) > maxShapeKeyLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shape key", "index": i})
			return false
		}
		if _, dup := keys[shapes[i].Key]; dup {
			c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate shape key", "index": i, "key": shapes[i].Key})
			return false
		}
		keys[shapes[i].Key] = struct{}{}
		if shapes[i].Kind == "" {
			shapes[i].Kind = "room"
		} else if !shapeKinds[shapes[i].Kind] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shape kind", "index": i, "kind": shapes[i].Kind})
			return false
		}
		if len(shapes[i].Label) > maxShapeLabelLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "shape label too long", "index": i})
			return false
		}
		if shapes[i].Color == "" {
			shapes[i].Color = defaultShapeColor
		} else if !markerColorRe.MatchString(shapes[i].Color) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "shape color must be #rrggbb", "index": i})
			return false
		}
		if shapes[i].Floor <= 0 {
			shapes[i].Floor = 1
		}
		shapes[i].X = clampUnit(shapes[i].X)
		shapes[i].Y = clampUnit(shapes[i].Y)
		shapes[i].W = clampUnit(shapes[i].W)
		shapes[i].H = clampUnit(shapes[i].H)
		if shapes[i].W <= 0 {
			shapes[i].W = 0.05
		}
		if shapes[i].H <= 0 {
			shapes[i].H = 0.05
		}
		// Прямоугольник должен помещаться в холст 0..1 (поля clamp'ятся независимо).
		if shapes[i].X+shapes[i].W > 1 {
			shapes[i].W = 1 - shapes[i].X
		}
		if shapes[i].Y+shapes[i].H > 1 {
			shapes[i].H = 1 - shapes[i].Y
		}
	}
	return true
}

func validateVenueRoutes(c *gin.Context, routes []venueRoutePayload, markerFloors map[string]int) ([]models.MapRoute, bool) {
	if len(routes) > maxRoutesPerConf {
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many routes", "max": maxRoutesPerConf})
		return nil, false
	}
	seen := map[string]struct{}{}
	rows := make([]models.MapRoute, 0, len(routes))
	for i := range routes {
		from := strings.TrimSpace(routes[i].FromKey)
		to := strings.TrimSpace(routes[i].ToKey)
		if from == "" || to == "" || len(from) > maxMarkerKeyLen || len(to) > maxMarkerKeyLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid route endpoints", "index": i})
			return nil, false
		}
		// Маршрут должен связывать существующие точки этого же набора.
		fromFloor, okFrom := markerFloors[from]
		if !okFrom {
			c.JSON(http.StatusBadRequest, gin.H{"error": "route from_key references unknown marker", "index": i, "key": from})
			return nil, false
		}
		toFloor, okTo := markerFloors[to]
		if !okTo {
			c.JSON(http.StatusBadRequest, gin.H{"error": "route to_key references unknown marker", "index": i, "key": to})
			return nil, false
		}
		// Маршрут — внутри одного этажа; концы должны быть на одном этаже, и floor
		// маршрута нормализуем по ним (кросс-этажные маршруты не поддерживаются).
		if fromFloor != toFloor {
			c.JSON(http.StatusBadRequest, gin.H{"error": "route endpoints are on different floors", "index": i})
			return nil, false
		}
		floor := fromFloor
		dedup := from + "\x00" + to + "\x00" + strconv.Itoa(floor)
		if _, dup := seen[dedup]; dup {
			c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate route", "index": i})
			return nil, false
		}
		seen[dedup] = struct{}{}
		if len(routes[i].Points) > maxRoutePoints {
			c.JSON(http.StatusBadRequest, gin.H{"error": "too many route points", "index": i, "max": maxRoutePoints})
			return nil, false
		}
		pts := make([]venuePoint, 0, len(routes[i].Points))
		for _, p := range routes[i].Points {
			pts = append(pts, venuePoint{X: clampUnit(p.X), Y: clampUnit(p.Y)})
		}
		raw, err := json.Marshal(pts)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid route points", "index": i})
			return nil, false
		}
		rows = append(rows, models.MapRoute{FromKey: from, ToKey: to, Floor: floor, Points: raw})
	}
	return rows, true
}
