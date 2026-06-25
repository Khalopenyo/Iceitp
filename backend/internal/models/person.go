package models

import "time"

// PersonRole — группа персоны на публичной странице «Спикеры / оргкомитет».
const (
	PersonRoleSpeaker          = "speaker"
	PersonRoleOrgCommittee     = "orgcommittee"
	PersonRoleProgramCommittee = "programcommittee"
)

// PersonRoles — вайтлист допустимых ролей персоны.
var PersonRoles = map[string]bool{
	PersonRoleSpeaker:          true,
	PersonRoleOrgCommittee:     true,
	PersonRoleProgramCommittee: true,
}

// Person — куратируемая организатором персона конференции (спикер, член
// оргкомитета или программного комитета). Per-conference, отдельно от
// зарегистрированных участников (User/Profile).
type Person struct {
	ConferenceID *uint     `gorm:"index" json:"conference_id"`
	ID           uint      `gorm:"primaryKey" json:"id"`
	FullName     string    `gorm:"not null" json:"full_name"`
	Degree       string    `json:"degree"`
	Organization string    `json:"organization"`
	Position     string    `json:"position"`
	Bio          string    `json:"bio"`
	Role         string    `gorm:"type:varchar(30);not null;default:'speaker'" json:"role"`
	SortOrder    int       `gorm:"default:0" json:"sort_order"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName фиксирует имя таблицы (иначе GORM делает нерегулярную форму «people»).
func (Person) TableName() string {
	return "persons"
}
