package models

import "time"

type Feedback struct {
	ConferenceID *uint     `gorm:"index" json:"conference_id"`
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index" json:"user_id"`
	Rating       int       `gorm:"not null" json:"rating"`
	Comment      string    `json:"comment"`
	CreatedAt    time.Time `json:"created_at"`
}
