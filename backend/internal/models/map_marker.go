package models

import "time"

type MapMarker struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"uniqueIndex;not null" json:"key"`
	Label     string    `gorm:"not null" json:"label"`
	X         float64   `gorm:"not null" json:"x"`
	Y         float64   `gorm:"not null" json:"y"`
	Floor     int       `gorm:"default:1" json:"floor"`
	Color     string    `gorm:"not null" json:"color"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
