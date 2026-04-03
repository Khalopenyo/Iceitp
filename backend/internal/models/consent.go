package models

import "time"

const (
	ConsentTypePersonalData = "personal_data"
	ConsentTypePublication  = "publication"
)

type ConsentLog struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"index" json:"user_id"`
	ConsentType    string    `gorm:"index;not null" json:"consent_type"`
	ConsentURL     string    `gorm:"not null" json:"consent_url"`
	ConsentVersion string    `gorm:"not null" json:"consent_version"`
	IP             string    `json:"ip"`
	UserAgent      string    `json:"user_agent"`
	GrantedAt      time.Time `gorm:"autoCreateTime" json:"granted_at"`
}
