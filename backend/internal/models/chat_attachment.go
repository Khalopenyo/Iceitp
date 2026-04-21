package models

import "time"

type ChatAttachment struct {
	ID          uint        `gorm:"primaryKey" json:"id"`
	MessageID   uint        `gorm:"index;not null" json:"message_id"`
	Message     ChatMessage `gorm:"foreignKey:MessageID;references:ID" json:"-"`
	FileName    string      `gorm:"not null" json:"file_name"`
	ObjectKey   string      `gorm:"column:file_path;not null" json:"-"`
	ContentType string      `gorm:"not null" json:"content_type"`
	FileSize    int64       `gorm:"not null" json:"file_size"`
	CreatedAt   time.Time   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time   `gorm:"autoUpdateTime" json:"updated_at"`
}
