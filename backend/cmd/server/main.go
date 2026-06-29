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
	pool := db.PoolConfig{
		MaxOpenConns:    cfg.DBMaxOpenConns,
		MaxIdleConns:    cfg.DBMaxIdleConns,
		ConnMaxLifetime: cfg.DBConnMaxLifetime,
		ConnMaxIdleTime: cfg.DBConnMaxIdleTime,
	}
	// Owner connection: owns the tables (bypasses RLS), so migrations + seed run
	// here. With RLS off this is the same DSN as the app pool below.
	owner := db.Connect(cfg.MigrationDatabaseURL, pool)
	// Create organization #1 BEFORE seeding so the seeder can stamp
	// organization_id/conference_id on the rows it creates (fresh install).
	defaultOrg, err := db.EnsureDefaultOrg(owner)
	if err != nil {
		log.Fatalf("ensure default organization: %v", err)
	}
	// Демо-данные (конференция/секции/маркеры дефолт-орг) сидятся только при
	// SEED_DEMO=true (локальная разработка). В проде флаг выключен → база чистая.
	if cfg.SeedDemo {
		seed(owner, defaultOrg.ID)
		// EnsureDefaultOrg ran before the conference existed, so on a fresh install the
		// org got the generic display name. Refresh it from the conference title now.
		if strings.TrimSpace(defaultOrg.DisplayName) == "Организация" {
			var conf models.Conference
			if err := owner.Order("id asc").First(&conf).Error; err == nil {
				if title := strings.TrimSpace(conf.Title); title != "" {
					owner.Model(&models.Organization{}).Where("id = ?", defaultOrg.ID).Update("display_name", title)
				}
			}
		}
	}
	// Safety net: link any still-unscoped rows to org #1 (e.g. a legacy DB whose
	// rows predate the tenant columns). Idempotent / no-op on a freshly stamped DB.
	if err := db.EnsureFirstRun(owner); err != nil {
		log.Fatalf("first run: %v", err)
	}

	// App connection serves tenant requests. Identical to the owner pool unless a
	// distinct DATABASE_URL is configured (the RLS rollout points it at the
	// non-owner conf_app role, which is subject to the RLS policies).
	appDB := owner
	if cfg.DatabaseURL != cfg.MigrationDatabaseURL {
		a, err := db.Open(cfg.DatabaseURL, pool)
		if err != nil {
			log.Fatalf("connect app database: %v", err)
		}
		appDB = a
	}

	store, err := objectstore.NewFilesystemStore(cfg.FileStorageRoot)
	if err != nil {
		log.Fatalf("init file storage: %v", err)
	}

	r := router.Setup(appDB, owner, cfg, store)
	log.Printf("server running on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

func seed(db *gorm.DB, orgID uint) {
	confID := syncConferenceSeed(db, orgID)
	if confID == 0 {
		log.Printf("seed: no conference id resolved; skipping section/room/marker seed")
		return
	}
	syncSectionSeed(db, confID)
	ensureDefaultRooms(db, confID)

	// Ensure required map markers exist (do not overwrite user-edited coordinates).
	markers := []models.MapMarker{
		{Key: "entrance", Label: "Вход", X: 44.1, Y: 10.9, Floor: 1, Color: "primary"},
		{Key: "reception", Label: "Ресепшен", X: 50, Y: 20, Floor: 1, Color: "primary"},
		{Key: "assembly", Label: "Актовый зал", X: 60, Y: 40, Floor: 1, Color: "blue"},
		{Key: "arcane", Label: "Аркейн", X: 75, Y: 18, Floor: 1, Color: "primary"},
		{Key: "academic-council", Label: "Ученый совет", X: 72, Y: 48, Floor: 1, Color: "primary"},
	}
	for _, m := range markers {
		m.ConferenceID = &confID
		var existing models.MapMarker
		if err := db.Where("(key = ? OR label = ?) AND conference_id = ?", m.Key, m.Label, confID).First(&existing).Error; err != nil {
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

func syncSectionSeed(db *gorm.DB, confID uint) {
	defaultSections := defaultConferenceSections()

	var existingSections []models.Section
	if err := db.Where("conference_id = ?", confID).Order("id asc").Find(&existingSections).Error; err != nil {
		log.Printf("seed sections: failed to load sections: %v", err)
		return
	}

	if len(existingSections) == 0 {
		for _, section := range defaultSections {
			section.ConferenceID = &confID
			if err := db.Create(&section).Error; err != nil {
				log.Printf("seed sections: failed to create %s: %v", section.Title, err)
			}
		}
		return
	}
}

func ensureDefaultRooms(db *gorm.DB, confID uint) {
	defaultRooms := []models.Room{
		{Name: "Хайпарк", Floor: 1, ConferenceID: &confID},
		{Name: "Актовый зал", Floor: 1, ConferenceID: &confID},
		{Name: "Аркейн", Floor: 1, ConferenceID: &confID},
		{Name: "Ученый совет", Floor: 1, ConferenceID: &confID},
		{Name: "Фуршет", Floor: 1, ConferenceID: &confID},
	}

	for _, room := range defaultRooms {
		var existing models.Room
		if err := db.Where("name = ? AND conference_id = ?", room.Name, confID).First(&existing).Error; err != nil {
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

// syncConferenceSeed ensures the default conference exists (owned by orgID) and
// returns its id, so the rest of the seed can stamp conference_id. Returns 0 on
// failure.
func syncConferenceSeed(db *gorm.DB, orgID uint) uint {
	defaultConference := defaultConferenceConfig()

	var conference models.Conference
	if err := db.Order("id asc").First(&conference).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			defaultConference.OrganizationID = &orgID
			if err := db.Create(&defaultConference).Error; err != nil {
				log.Printf("seed conference: failed to create conference: %v", err)
				return 0
			}
			return defaultConference.ID
		}
		log.Printf("seed conference: failed to load conference: %v", err)
		return 0
	}

	// Stamp the owning org on a legacy conference that predates the tenant column.
	if conference.OrganizationID == nil {
		if err := db.Model(&conference).Update("organization_id", orgID).Error; err != nil {
			log.Printf("seed conference: failed to set organization_id: %v", err)
		}
	}

	isLegacyTitle := strings.TrimSpace(conference.Title) == "" || strings.TrimSpace(conference.Title) == "Ежегодная научная конференция ИЦЭиТП"
	isLegacyEmail := strings.TrimSpace(conference.SupportEmail) == "" || strings.TrimSpace(conference.SupportEmail) == "info@conference.local"
	isLegacyDescription := strings.TrimSpace(conference.Description) == "" || strings.TrimSpace(conference.Description) == "Площадка для обмена научными результатами и практическими разработками."

	if !isLegacyTitle && !isLegacyEmail && !isLegacyDescription {
		return conference.ID
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
	return conference.ID
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
