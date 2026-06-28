package models

import "time"

// MapShape — нарисованная организатором фигура схемы площадки (зал/зона/вход/сцена…).
// Прямоугольник в нормализованных координатах 0..1 (X,Y — левый верхний угол; W,H — размер).
// Геометрия отделена от логической Room (та — название+этаж секции) и скоупится по тенанту,
// как MapMarker/MapRoute.
type MapShape struct {
	ConferenceID *uint     `gorm:"index:idx_shape_conf_key,unique,priority:1" json:"conference_id"`
	ID           uint      `gorm:"primaryKey" json:"id"`
	Key          string    `gorm:"not null;index:idx_shape_conf_key,unique,priority:2" json:"key"`
	Kind         string    `gorm:"not null;default:room" json:"kind"` // room|zone|hall|entrance|stage|facility
	Label        string    `json:"label"`
	X            float64   `gorm:"not null" json:"x"`
	Y            float64   `gorm:"not null" json:"y"`
	W            float64   `gorm:"not null" json:"w"`
	H            float64   `gorm:"not null" json:"h"`
	Floor        int       `gorm:"default:1" json:"floor"`
	Color        string    `gorm:"not null" json:"color"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
