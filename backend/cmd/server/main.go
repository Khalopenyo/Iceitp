package main

import (
	"conferenceplatforma/internal/config"
	"conferenceplatforma/internal/db"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/objectstore"
	"conferenceplatforma/internal/router"
	"errors"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg.DatabaseURL)
	seed(database)
	store, err := objectstore.NewFilesystemStore(cfg.FileStorageRoot)
	if err != nil {
		log.Fatalf("init file storage: %v", err)
	}

	r := router.Setup(database, cfg, store)
	log.Printf("server running on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

func seed(db *gorm.DB) {
	syncSectionSeed(db)
	syncConferenceSeed(db)
	ensureDefaultRooms(db)

	// Ensure required map markers exist (do not overwrite user-edited coordinates).
	markers := []models.MapMarker{
		{Key: "entrance", Label: "Вход", X: 44.1, Y: 10.9, Floor: 1, Color: "primary"},
		{Key: "reception", Label: "Ресепшен", X: 50, Y: 20, Floor: 1, Color: "primary"},
		{Key: "assembly", Label: "Актовый зал", X: 60, Y: 40, Floor: 1, Color: "blue"},
		{Key: "arcane", Label: "Аркейн", X: 75, Y: 18, Floor: 1, Color: "primary"},
		{Key: "academic-council", Label: "Ученый совет", X: 72, Y: 48, Floor: 1, Color: "primary"},
	}
	for _, m := range markers {
		var existing models.MapMarker
		if err := db.Where("key = ? OR label = ?", m.Key, m.Label).First(&existing).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := db.Create(&m).Error; err != nil {
					log.Printf("seed markers: failed to create %s: %v", m.Key, err)
				}
				continue
			}
			log.Printf("seed markers: failed to query %s: %v", m.Key, err)
		}
	}

	// sessions removed
}

func syncSectionSeed(db *gorm.DB) {
	defaultSections := defaultConferenceSections()

	var existingSections []models.Section
	if err := db.Order("id asc").Find(&existingSections).Error; err != nil {
		log.Printf("seed sections: failed to load sections: %v", err)
		return
	}

	if len(existingSections) == 0 {
		for _, section := range defaultSections {
			if err := db.Create(&section).Error; err != nil {
				log.Printf("seed sections: failed to create %s: %v", section.Title, err)
			}
		}
		return
	}
}

func ensureDefaultRooms(db *gorm.DB) {
	defaultRooms := []models.Room{
		{Name: "Хайпарк", Floor: 1},
		{Name: "Актовый зал", Floor: 1},
		{Name: "Аркейн", Floor: 1},
		{Name: "Ученый совет", Floor: 1},
		{Name: "Фуршет", Floor: 1},
	}

	for _, room := range defaultRooms {
		var existing models.Room
		if err := db.Where("name = ?", room.Name).First(&existing).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := db.Create(&room).Error; err != nil {
					log.Printf("seed rooms: failed to create room %s: %v", room.Name, err)
				}
			} else {
				log.Printf("seed rooms: failed to query room %s: %v", room.Name, err)
			}
			continue
		}
		if existing.Floor != room.Floor {
			if err := db.Model(&existing).Update("floor", room.Floor).Error; err != nil {
				log.Printf("seed rooms: failed to update floor for %s: %v", room.Name, err)
			}
		}
	}
}

func syncConferenceSeed(db *gorm.DB) {
	defaultConference := defaultConferenceConfig()

	var conference models.Conference
	if err := db.Order("id asc").First(&conference).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := db.Create(&defaultConference).Error; err != nil {
				log.Printf("seed conference: failed to create conference: %v", err)
			}
			return
		}
		log.Printf("seed conference: failed to load conference: %v", err)
		return
	}

	isLegacyTitle := strings.TrimSpace(conference.Title) == "" || strings.TrimSpace(conference.Title) == "Ежегодная научная конференция ИЦЭиТП"
	isLegacyEmail := strings.TrimSpace(conference.SupportEmail) == "" || strings.TrimSpace(conference.SupportEmail) == "info@conference.local"
	isLegacyDescription := strings.TrimSpace(conference.Description) == "" || strings.TrimSpace(conference.Description) == "Площадка для обмена научными результатами и практическими разработками."

	if !isLegacyTitle && !isLegacyEmail && !isLegacyDescription {
		return
	}

	if err := db.Model(&conference).Updates(map[string]any{
		"title":         defaultConference.Title,
		"description":   defaultConference.Description,
		"starts_at":     defaultConference.StartsAt,
		"ends_at":       defaultConference.EndsAt,
		"support_email": defaultConference.SupportEmail,
	}).Error; err != nil {
		log.Printf("seed conference: failed to update conference: %v", err)
	}
}

func defaultConferenceSections() []models.Section {
	firstDayStart := time.Date(2026, time.April, 24, 10, 0, 0, 0, time.Local)
	secondDayStart := time.Date(2026, time.April, 25, 10, 0, 0, 0, time.Local)

	return []models.Section{
		{
			Title:       "Экономика, право и управление в условиях цифровой трансформации",
			Description: "Сессия 1 конференции.",
			Room:        "Хайпарк",
			StartAt:     firstDayStart,
			EndAt:       firstDayStart.Add(90 * time.Minute),
			Capacity:    120,
		},
		{
			Title:       "Современное общество в цифровую эпоху",
			Description: "Сессия 2 конференции.",
			Room:        "Актовый зал",
			StartAt:     firstDayStart.Add(2 * time.Hour),
			EndAt:       firstDayStart.Add(3*time.Hour + 30*time.Minute),
			Capacity:    120,
		},
		{
			Title:       "Лингвистика и методика преподавания языков",
			Description: "Сессия 3 конференции.",
			Room:        "Аркейн",
			StartAt:     firstDayStart.Add(4 * time.Hour),
			EndAt:       firstDayStart.Add(5*time.Hour + 30*time.Minute),
			Capacity:    120,
		},
		{
			Title:       "Физическое воспитание: инновации и подходы",
			Description: "Сессия 4 конференции.",
			Room:        "Ученый совет",
			StartAt:     secondDayStart,
			EndAt:       secondDayStart.Add(90 * time.Minute),
			Capacity:    120,
		},
		{
			Title:       "Наука зуммеров и альфа (молодые ученые до 35 лет)",
			Description: "Сессия 5 конференции.",
			Room:        "Хайпарк",
			StartAt:     secondDayStart.Add(2 * time.Hour),
			EndAt:       secondDayStart.Add(3*time.Hour + 30*time.Minute),
			Capacity:    120,
		},
	}
}

func defaultConferenceConfig() models.Conference {
	startsAt := time.Date(2026, time.April, 24, 10, 0, 0, 0, time.Local)
	endsAt := time.Date(2026, time.April, 25, 18, 0, 0, 0, time.Local)

	return models.Conference{
		Title:        "ЦИФРОВАЯ РЕВОЛЮЦИЯ: ТОЧКИ СОЦИАЛЬНО-ЭКОНОМИЧЕСКОГО РОСТА",
		Description:  "Всероссийская научно-практическая конференция с международным участием. Диалог между наукой, бизнесом и государством по вопросам цифровой трансформации экономики.",
		StartsAt:     startsAt,
		EndsAt:       endsAt,
		Status:       models.ConferenceStatusDraft,
		SupportEmail: "madinaborz@mail.ru",
	}
}

func hasLegacySectionTitles(sections []models.Section) bool {
	legacyTitles := map[string]struct{}{
		"цифровая экономика": {},
		"инженерные системы": {},
		"аналитика и ии":     {},
	}

	for _, section := range sections {
		if _, exists := legacyTitles[strings.ToLower(strings.TrimSpace(section.Title))]; exists {
			return true
		}
	}

	return false
}
