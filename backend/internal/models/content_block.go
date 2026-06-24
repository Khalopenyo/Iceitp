package models

import "time"

// ContentBlock is a per-conference CMS "ready block" — an ordered, typed section
// of the public landing page that an org admin can add, edit, reorder and hide.
// Scoped by conference_id like other per-event data.
type ContentBlock struct {
	ConferenceID *uint     `gorm:"index" json:"conference_id"`
	ID           uint      `gorm:"primaryKey" json:"id"`
	Kind         string    `gorm:"type:varchar(40);not null" json:"kind"`
	Position     int       `gorm:"not null;default:0;index" json:"position"`
	Title        string    `json:"title"`
	Body         string    `gorm:"type:text" json:"body"`
	Visible      bool      `gorm:"not null" json:"visible"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ContentBlockKinds is the whitelist of ready-block types an admin can place.
var ContentBlockKinds = map[string]struct{}{
	"hero":     {}, // headline + subtitle + CTA
	"about":    {}, // free text about the conference
	"schedule": {}, // teaser linking to the program
	"speakers": {}, // featured speakers
	"venue":    {}, // location / map teaser
	"contacts": {}, // contacts block
	"custom":   {}, // free-form rich text
}

func IsValidContentBlockKind(kind string) bool {
	_, ok := ContentBlockKinds[kind]
	return ok
}
