package models

import "time"

type QuestionStatus string

const (
	QuestionStatusPending  QuestionStatus = "pending"
	QuestionStatusApproved QuestionStatus = "approved"
	QuestionStatusRejected QuestionStatus = "rejected"
)

type Question struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	ConferenceID  uint           `gorm:"index;not null" json:"conference_id"`
	UserID        *uint          `gorm:"index" json:"user_id,omitempty"`
	AuthorName    string         `gorm:"size:255" json:"author_name,omitempty"`
	Text          string         `gorm:"type:text;not null" json:"text"`
	Status        QuestionStatus `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	ModeratedByID *uint          `gorm:"index" json:"moderated_by_id,omitempty"`
	ModeratedAt   *time.Time     `json:"moderated_at,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}
