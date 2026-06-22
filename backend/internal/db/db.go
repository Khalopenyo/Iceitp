package db

import (
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Open opens a database connection without running migrations. Used for the
// app-serving (conf_app) pool under RLS, which must not — and cannot — migrate.
func Open(databaseURL string) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(databaseURL), &gorm.Config{TranslateError: true})
}

// Connect opens the owner connection and runs migrations on it. The owner role
// owns the tables (bypasses RLS), so migrations/seed run here.
func Connect(databaseURL string) *gorm.DB {
	db, err := Open(databaseURL)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	if err := RunMigrations(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	return db
}
