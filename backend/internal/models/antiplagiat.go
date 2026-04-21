package models

import "time"

type SubmissionStatus string

const (
	SubmissionStatusUploaded SubmissionStatus = "uploaded"
	SubmissionStatusReady    SubmissionStatus = "ready"
	SubmissionStatusFailed   SubmissionStatus = "failed"
)

type ArticleSubmission struct {
	ID           uint             `gorm:"primaryKey" json:"id"`
	UserID       uint             `gorm:"index;not null" json:"user_id"`
	Title        string           `gorm:"not null" json:"title"`
	FileName     string           `gorm:"not null" json:"file_name"`
	FileType     string           `gorm:"not null" json:"file_type"`
	ObjectKey    string           `gorm:"column:file_path;not null" json:"-"`
	FileSize     int64            `gorm:"not null" json:"file_size"`
	Status       SubmissionStatus `gorm:"type:varchar(20);not null;default:'uploaded';index" json:"status"`
	ErrorDetails string           `gorm:"type:text" json:"error_details"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
}
