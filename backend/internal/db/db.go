package db

import (
	"conferenceplatforma/internal/models"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(databaseURL string) *gorm.DB {
	db, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Profile{},
		&models.PasswordResetToken{},
		&models.ProgramAssignment{},
		&models.AntiplagiatConfig{},
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
	); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}
	if err := db.Model(&models.ChatMessage{}).
		Where("(channel = '' OR channel IS NULL) AND section_id IS NOT NULL").
		Update("channel", models.ChatChannelSection).Error; err != nil {
		log.Fatalf("failed to backfill section chat channels: %v", err)
	}
	if err := db.Model(&models.ChatMessage{}).
		Where("(channel = '' OR channel IS NULL) AND section_id IS NULL").
		Update("channel", models.ChatChannelConference).Error; err != nil {
		log.Fatalf("failed to backfill conference chat channels: %v", err)
	}
	return db
}
