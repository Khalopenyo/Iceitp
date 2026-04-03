package models

import "time"

type ProgramAssignment struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"uniqueIndex;not null" json:"user_id"`
	UserType  UserType   `gorm:"type:varchar(20);not null" json:"user_type"`
	SectionID *uint      `gorm:"index" json:"section_id"`
	TalkTitle string     `gorm:"not null" json:"talk_title"`
	RoomID    *uint      `gorm:"index" json:"room_id"`
	StartsAt  *time.Time `json:"starts_at"`
	EndsAt    *time.Time `json:"ends_at"`
	JoinURL   string     `json:"join_url"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`

	User    User    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	Section Section `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"-"`
	Room    Room    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"-"`
}
