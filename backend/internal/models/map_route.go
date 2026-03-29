package models

import (
	"encoding/json"
	"time"
)

// MapRoute stores an author-defined route polyline between 2 marker keys on a given floor.
// Points are stored as JSON array: [{ "x": 12.3, "y": 45.6 }, ...] in % of the map (0..100).
type MapRoute struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	FromKey string `gorm:"not null;index:idx_map_route,unique" json:"from_key"`
	ToKey   string `gorm:"not null;index:idx_map_route,unique" json:"to_key"`
	Floor   int    `gorm:"default:1;index:idx_map_route,unique" json:"floor"`
	Points  json.RawMessage `gorm:"type:jsonb;not null" json:"points"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
