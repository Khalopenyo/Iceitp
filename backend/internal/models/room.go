package models

import "time"

type Room struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null" json:"name"`
	Floor     int       `gorm:"index" json:"floor"`
	CreatedAt time.Time `json:"created_at"`
}
