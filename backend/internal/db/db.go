package db

import (
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(databaseURL string) *gorm.DB {
	db, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{TranslateError: true})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	if err := RunMigrations(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	return db
}
