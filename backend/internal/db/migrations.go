package db

import (
	"conferenceplatforma/internal/models"
	"fmt"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
)

const schemaMigrationsTable = "schema_migrations"

type schemaMigration struct {
	Version   string    `gorm:"primaryKey;size:64"`
	Name      string    `gorm:"not null"`
	AppliedAt time.Time `gorm:"not null"`
}

func (schemaMigration) TableName() string {
	return schemaMigrationsTable
}

type migration struct {
	Version string
	Name    string
	Up      func(db *gorm.DB) error
}

var migrations = []migration{
	{
		Version: "202604210001",
		Name:    "initial_schema",
		Up: func(db *gorm.DB) error {
			return db.AutoMigrate(
				&models.User{},
				&models.Profile{},
				&models.RegistrationAttempt{},
				&models.PasswordResetToken{},
				&models.PhoneAuthCode{},
				&models.ProgramAssignment{},
				&models.ArticleSubmission{},
				&models.Section{},
				&models.Room{},
				&models.Conference{},
				&models.CheckIn{},
				&models.Certificate{},
				&models.ConsentLog{},
				&models.MapMarker{},
				&models.MapRoute{},
				&models.Feedback{},
				&models.ChatMessage{},
				&models.ChatAttachment{},
			)
		},
	},
	{
		Version: "202604210002",
		Name:    "backfill_chat_channels",
		Up: func(db *gorm.DB) error {
			if err := db.Model(&models.ChatMessage{}).
				Where("(channel = '' OR channel IS NULL) AND section_id IS NOT NULL").
				Update("channel", models.ChatChannelSection).Error; err != nil {
				return err
			}
			if err := db.Model(&models.ChatMessage{}).
				Where("(channel = '' OR channel IS NULL) AND section_id IS NULL").
				Update("channel", models.ChatChannelConference).Error; err != nil {
				return err
			}
			return nil
		},
	},
	{
		Version: "202604210003",
		Name:    "normalize_and_unique_profile_phone",
		Up: func(db *gorm.DB) error {
			var profiles []models.Profile
			if err := db.Where("phone IS NOT NULL AND phone <> ''").Find(&profiles).Error; err != nil {
				return err
			}

			seen := make(map[string]uint)
			for _, profile := range profiles {
				normalized, err := normalizePhoneForIndex(profile.Phone)
				if err != nil {
					return fmt.Errorf("invalid phone for profile %d: %w", profile.ID, err)
				}
				if existing, ok := seen[normalized]; ok {
					return fmt.Errorf("duplicate phone detected for profiles %d and %d: %s", existing, profile.ID, normalized)
				}
				seen[normalized] = profile.ID
				if normalized != profile.Phone {
					if err := db.Model(&models.Profile{}).Where("id = ?", profile.ID).Update("phone", normalized).Error; err != nil {
						return err
					}
				}
			}

			createIndexSQL := `
				CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
				ON profiles (phone)
				WHERE phone IS NOT NULL AND phone <> ''
			`
			return db.Exec(createIndexSQL).Error
		},
	},
}

func RunMigrations(db *gorm.DB) error {
	if err := ensureMigrationsTable(db); err != nil {
		return err
	}

	applied, err := loadAppliedMigrations(db)
	if err != nil {
		return err
	}

	for _, item := range migrations {
		if _, ok := applied[item.Version]; ok {
			continue
		}
		log.Printf("db migration: applying %s_%s", item.Version, item.Name)
		if err := item.Up(db); err != nil {
			return fmt.Errorf("apply migration %s_%s: %w", item.Version, item.Name, err)
		}
		record := schemaMigration{
			Version:   item.Version,
			Name:      item.Name,
			AppliedAt: time.Now().UTC(),
		}
		if err := db.Table(schemaMigrationsTable).Create(&record).Error; err != nil {
			return fmt.Errorf("store migration %s_%s: %w", item.Version, item.Name, err)
		}
	}

	return nil
}

func ensureMigrationsTable(db *gorm.DB) error {
	createTableSQL := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(64) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			applied_at TIMESTAMP NOT NULL
		)
	`
	return db.Exec(createTableSQL).Error
}

func loadAppliedMigrations(db *gorm.DB) (map[string]struct{}, error) {
	var rows []schemaMigration
	if err := db.Table(schemaMigrationsTable).Find(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		result[row.Version] = struct{}{}
	}
	return result, nil
}

func normalizePhoneForIndex(phone string) (string, error) {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if digits == "" {
		return "", fmt.Errorf("phone is required")
	}
	if len(digits) == 10 {
		digits = "7" + digits
	}
	if len(digits) == 11 && strings.HasPrefix(digits, "8") {
		digits = "7" + digits[1:]
	}
	if len(digits) != 11 || !strings.HasPrefix(digits, "7") || digits[1] != '9' {
		return "", fmt.Errorf("phone must be in Russian mobile format")
	}
	return "+" + digits, nil
}
