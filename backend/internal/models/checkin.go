package models

import "time"

type CheckIn struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	ConferenceID     uint      `gorm:"index:idx_checkins_conf_user,unique" json:"conference_id"`
	UserID           uint      `gorm:"index:idx_checkins_conf_user,unique" json:"user_id"`
	CheckedInAt      time.Time `gorm:"autoCreateTime" json:"checked_in_at"`
	VerifiedByUserID *uint     `json:"verified_by_user_id"`
	Source           string    `gorm:"type:varchar(40);default:'badge_qr'" json:"source"`
}
