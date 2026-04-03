package models

import "time"

type Role string

type UserType string

const (
	RoleParticipant Role = "participant"
	RoleAdmin       Role = "admin"
	RoleOrg         Role = "org"
)

const (
	UserTypeOnline  UserType = "online"
	UserTypeOffline UserType = "offline"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Role         Role      `gorm:"type:varchar(20);not null" json:"role"`
	UserType     UserType  `gorm:"type:varchar(20);not null" json:"user_type"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Profile      Profile   `json:"profile"`
}

type Profile struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	UserID       uint   `gorm:"uniqueIndex" json:"user_id"`
	FullName     string `gorm:"not null" json:"full_name"`
	Organization string `json:"organization"`
	Position     string `json:"position"`
	City         string `json:"city"`
	Degree       string `json:"degree"`
	SectionID    *uint  `json:"section_id"`
	TalkTitle    string `json:"talk_title"`
	Phone        string `json:"phone"`
	// ConsentGiven remains for compatibility with existing API consumers.
	ConsentGiven bool `json:"consent_given"`
}
