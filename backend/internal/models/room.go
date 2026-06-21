package models

import "time"

type Room struct {
	ConferenceID *uint     `gorm:"index:idx_room_conf_name,unique,priority:1" json:"conference_id"`
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"not null;index:idx_room_conf_name,unique,priority:2" json:"name"`
	Floor        int       `gorm:"index" json:"floor"`
	CreatedAt    time.Time `json:"created_at"`
}
