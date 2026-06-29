package main

import (
	"conferenceplatforma/internal/config"
	"conferenceplatforma/internal/db"
	"conferenceplatforma/internal/models"
	"flag"
	"log"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func main() {
	email := flag.String("email", "", "admin email")
	password := flag.String("password", "", "admin password")
	fullName := flag.String("full-name", "Администратор", "admin display name")
	organization := flag.String("organization", "Оргкомитет", "admin organization")
	flag.Parse()

	if strings.TrimSpace(*email) == "" || strings.TrimSpace(*password) == "" {
		log.Fatal("email and password are required")
	}

	cfg := config.Load()
	// Use the owner DSN: bootstrap runs migrations and writes a user, which must
	// bypass RLS (the conf_app role cannot). Falls back to DATABASE_URL when unset.
	database := db.Connect(cfg.MigrationDatabaseURL, db.PoolConfig{
		MaxOpenConns:    cfg.DBMaxOpenConns,
		MaxIdleConns:    cfg.DBMaxIdleConns,
		ConnMaxLifetime: cfg.DBConnMaxLifetime,
		ConnMaxIdleTime: cfg.DBConnMaxIdleTime,
	})

	if err := bootstrapAdmin(database, strings.TrimSpace(*email), strings.TrimSpace(*password), strings.TrimSpace(*fullName), strings.TrimSpace(*organization)); err != nil {
		log.Fatal(err)
	}

	log.Printf("bootstrap admin created for %s", strings.TrimSpace(*email))
}

func bootstrapAdmin(database *gorm.DB, email, password, fullName, organization string) error {
	var count int64
	if err := database.Model(&models.User{}).Where("LOWER(email) = ?", strings.ToLower(email)).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return gorm.ErrDuplicatedKey
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return err
	}

	// Stamp organization #1 so the admin (and its parent-table rows) are visible
	// under the org-scoped RLS policies on the app pool.
	org, err := db.EnsureDefaultOrg(database)
	if err != nil {
		return err
	}

	admin := models.User{
		Email:          strings.ToLower(email),
		PasswordHash:   string(passwordHash),
		Role:           models.RoleAdmin,
		UserType:       models.UserTypeOffline,
		OrganizationID: &org.ID,
		Profile: models.Profile{
			FullName:     fullName,
			Organization: organization,
			ConsentGiven: true,
		},
	}
	return database.Create(&admin).Error
}
