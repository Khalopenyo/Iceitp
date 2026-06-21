package models

import (
	"time"

	"gorm.io/gorm"
)

type OrganizationStatus string

const (
	OrganizationStatusActive    OrganizationStatus = "active"
	OrganizationStatusSuspended OrganizationStatus = "suspended"
	OrganizationStatusArchived  OrganizationStatus = "archived"
)

type OrganizationPlan string

const (
	OrganizationPlanFree OrganizationPlan = "free"
	OrganizationPlanBase OrganizationPlan = "base"
	OrganizationPlanPro  OrganizationPlan = "pro"
)

// Organization is the tenant root (вуз). Conferences and per-event data scope to
// it via organization_id / conference_id; branding, domain and billing live here.
// A user joins it via Membership (Phase 2). See ADR-0001.
type Organization struct {
	ID           uint               `gorm:"primaryKey" json:"id"`
	Slug         string             `gorm:"uniqueIndex;not null" json:"slug"` // subdomain, e.g. "icetp"
	DisplayName  string             `gorm:"not null" json:"display_name"`
	Status       OrganizationStatus `gorm:"type:varchar(20);not null;default:'active'" json:"status"`
	Plan         OrganizationPlan   `gorm:"type:varchar(20);not null;default:'free'" json:"plan"`
	LogoURL      string             `json:"logo_url"`
	PrimaryColor string             `json:"primary_color"`
	CustomDomain string             `gorm:"index" json:"custom_domain"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
	DeletedAt    gorm.DeletedAt     `gorm:"index" json:"-"`
}

func (Organization) TableName() string { return "organizations" }
