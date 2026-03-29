package models

import "time"

type ChatChannel string

const (
	ChatChannelConference ChatChannel = "conference"
	ChatChannelSection    ChatChannel = "section"
)

type ChatMessage struct {
	ID        uint        `gorm:"primaryKey" json:"id"`
	UserID    uint        `gorm:"index" json:"user_id"`
	Channel   ChatChannel `gorm:"type:varchar(20);not null;default:'conference';index" json:"channel"`
	SectionID *uint       `gorm:"index" json:"section_id"`
	Content   string      `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time   `gorm:"autoUpdateTime" json:"updated_at"`
}
