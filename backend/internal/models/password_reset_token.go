package models

import "time"

type PasswordResetToken struct {
	ID                 uint       `gorm:"primaryKey" json:"id"`
	UserID             uint       `gorm:"index;not null" json:"user_id"`
	User               User       `json:"-"`
	TokenHash          string     `gorm:"uniqueIndex;size:64;not null" json:"-"`
	ExpiresAt          time.Time  `gorm:"index;not null" json:"expires_at"`
	UsedAt             *time.Time `gorm:"index" json:"used_at"`
	RequestedIP        string     `json:"requested_ip"`
	RequestedUserAgent string     `json:"requested_user_agent"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}
