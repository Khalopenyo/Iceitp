package models

import "time"

type ConferenceStatus string

const (
	ConferenceStatusDraft    ConferenceStatus = "draft"
	ConferenceStatusLive     ConferenceStatus = "live"
	ConferenceStatusFinished ConferenceStatus = "finished"
)

type Conference struct {
	ID             uint             `gorm:"primaryKey" json:"id"`
	Title          string           `gorm:"not null" json:"title"`
	Description    string           `json:"description"`
	StartsAt       time.Time        `json:"starts_at"`
	EndsAt         time.Time        `json:"ends_at"`
	Status         ConferenceStatus `gorm:"type:varchar(20);not null;default:'draft'" json:"status"`
	ProceedingsURL string           `json:"proceedings_url"`
	SupportEmail   string           `json:"support_email"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
}
