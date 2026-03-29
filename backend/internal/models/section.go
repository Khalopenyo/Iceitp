package models

import "time"

type Section struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Title       string    `gorm:"not null" json:"title"`
	Description string    `json:"description"`
	Room        string    `json:"room"`
	Capacity    int       `gorm:"default:10" json:"capacity"`
	StartAt     time.Time `json:"start_at"`
	EndAt       time.Time `json:"end_at"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
