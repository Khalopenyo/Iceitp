package models

import (
	"time"

	"gorm.io/gorm"
)

type ConferenceStatus string

const (
	ConferenceStatusDraft    ConferenceStatus = "draft"
	ConferenceStatusLive     ConferenceStatus = "live"
	ConferenceStatusFinished ConferenceStatus = "finished"
)

type Conference struct {
	OrganizationID *uint            `gorm:"index" json:"organization_id"`
	ID             uint             `gorm:"primaryKey" json:"id"`
	Title          string           `gorm:"not null" json:"title"`
	Description    string           `json:"description"`
	StartsAt       time.Time        `json:"starts_at"`
	EndsAt         time.Time        `json:"ends_at"`
	Status         ConferenceStatus `gorm:"type:varchar(20);not null;default:'draft'" json:"status"`
	// Onboarded отличает конференцию, которую организатор реально настроил, от
	// нейтральной авто-созданной заглушки (консоль ведёт на онбординг, если false).
	Onboarded bool `gorm:"not null;default:false" json:"onboarded"`
	// Format участия: hybrid | offline | online (для онбординга и витрины).
	Format         string    `gorm:"type:varchar(16);not null;default:'hybrid'" json:"format"`
	ProceedingsURL string    `json:"proceedings_url"`
	SupportEmail   string    `json:"support_email"`
	SupportPhone   string    `json:"support_phone"`
	VenueAddress   string    `json:"venue_address"`
	VenueMapURL    string    `json:"venue_map_url"`
	VenueTransport string    `json:"venue_transport"`
	LiveStreamURL  string    `gorm:"column:live_stream_url" json:"live_stream_url"`
	StreamVKURL    string    `gorm:"column:stream_vk_url" json:"stream_vk_url"`
	StreamYouTube  string    `gorm:"column:stream_youtube_url" json:"stream_youtube_url"`
	StreamRutube   string    `gorm:"column:stream_rutube_url" json:"stream_rutube_url"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	// Soft-delete (ADR-0004): Conference only in Phase 0. Inert column —
	// no code path soft-deletes a conference; First()/Order() queries auto-add
	// `deleted_at IS NULL` and the live row (NULL) still resolves.
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
