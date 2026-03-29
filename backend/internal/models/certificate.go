package models

import "time"

type Certificate struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ConferenceID uint      `gorm:"index:idx_cert_conf_user,unique" json:"conference_id"`
	UserID       uint      `gorm:"index:idx_cert_conf_user,unique" json:"user_id"`
	Number       string    `gorm:"uniqueIndex;not null" json:"number"`
	IssuedAt     time.Time `gorm:"autoCreateTime" json:"issued_at"`
}
