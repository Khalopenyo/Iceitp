package models

import "time"

type RegistrationAttempt struct {
	ID                  uint     `gorm:"primaryKey"`
	TokenHash           string   `gorm:"type:char(64);uniqueIndex;not null"`
	Email               string   `gorm:"index;not null"`
	PasswordHash        string   `gorm:"not null"`
	UserType            UserType `gorm:"type:varchar(20);not null"`
	FullName            string   `gorm:"not null"`
	Organization        string
	Position            string
	City                string
	Degree              string
	SectionID           *uint
	TalkTitle           string     `gorm:"not null"`
	Phone               string     `gorm:"type:varchar(32);index;not null"`
	ConsentPersonalData bool       `gorm:"not null"`
	ConsentPublication  bool       `gorm:"not null"`
	ConsentVersion      string     `gorm:"not null"`
	CodeHash            string     `gorm:"type:char(64);not null"`
	ProviderRequestID   string     `gorm:"type:varchar(64)"`
	ExpiresAt           time.Time  `gorm:"index;not null"`
	SentAt              time.Time  `gorm:"not null"`
	VerifyAttempts      int        `gorm:"not null;default:0"`
	ConsumedAt          *time.Time `gorm:"index"`
	RequestedIP         string
	RequestedUserAgent  string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}
