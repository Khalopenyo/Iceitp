package models

import "time"

type PhoneAuthCode struct {
	ID                 uint       `gorm:"primaryKey"`
	UserID             uint       `gorm:"index;not null"`
	Phone              string     `gorm:"type:varchar(32);index;not null"`
	CodeHash           string     `gorm:"type:char(64);not null"`
	ProviderRequestID  string     `gorm:"type:varchar(64)"`
	ExpiresAt          time.Time  `gorm:"index;not null"`
	SentAt             time.Time  `gorm:"not null"`
	VerifyAttempts     int        `gorm:"not null;default:0"`
	ConsumedAt         *time.Time `gorm:"index"`
	RequestedIP        string
	RequestedUserAgent string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
