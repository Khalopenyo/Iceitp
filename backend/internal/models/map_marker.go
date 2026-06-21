package models

import "time"

type MapMarker struct {
	ConferenceID *uint     `gorm:"index:idx_marker_conf_key,unique,priority:1" json:"conference_id"`
	ID           uint      `gorm:"primaryKey" json:"id"`
	Key          string    `gorm:"not null;index:idx_marker_conf_key,unique,priority:2" json:"key"`
	Label        string    `gorm:"not null" json:"label"`
	X            float64   `gorm:"not null" json:"x"`
	Y            float64   `gorm:"not null" json:"y"`
	Floor        int       `gorm:"default:1" json:"floor"`
	Color        string    `gorm:"not null" json:"color"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
