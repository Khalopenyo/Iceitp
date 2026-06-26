package models

import (
	"time"
)

// MembershipRole is a staff member's functional role within an organization's
// conference team (distinct from the global User.Role). It mirrors the «Кворум»
// org-committee roles. The account owner is the User with Role == RoleOrg and has
// no Membership row.
type MembershipRole string

const (
	MembershipRoleCurator   MembershipRole = "curator"   // Куратор — со-организатор
	MembershipRoleModerator MembershipRole = "moderator" // Модератор — разбирает вопросы
	MembershipRoleEditor    MembershipRole = "editor"    // Редактор — ведёт программу
	MembershipRoleBooth     MembershipRole = "booth"     // Стендист — отмечает гостей на входе
)

// ValidMembershipRole reports whether r is one of the known staff roles.
func ValidMembershipRole(r MembershipRole) bool {
	switch r {
	case MembershipRoleCurator, MembershipRoleModerator, MembershipRoleEditor, MembershipRoleBooth:
		return true
	default:
		return false
	}
}

// Membership binds a staff User to an Organization with a functional role. It is
// the org-scoped team roster: invited colleagues become staff Users (Role=staff)
// with one Membership per org. Tenant isolation is by organization_id.
//
// A pure join row — deliberately NOT soft-deleted: Remove hard-deletes it (and the
// staff account it serves), so the (organization_id, user_id) unique index never
// needs a partial-on-not-deleted clause and no tombstone rows accumulate.
type Membership struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"not null;uniqueIndex:idx_membership_org_user" json:"organization_id"`
	UserID         uint           `gorm:"not null;uniqueIndex:idx_membership_org_user" json:"user_id"`
	Role           MembershipRole `gorm:"type:varchar(20);not null" json:"role"`
	User           User           `gorm:"foreignKey:UserID" json:"user"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

func (Membership) TableName() string { return "memberships" }
