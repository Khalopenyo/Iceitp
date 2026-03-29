package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ConferenceHandler struct {
	DB *gorm.DB
}

type updateConferencePayload struct {
	Title          string                  `json:"title"`
	Description    string                  `json:"description"`
	StartsAt       *time.Time              `json:"starts_at"`
	EndsAt         *time.Time              `json:"ends_at"`
	Status         models.ConferenceStatus `json:"status"`
	ProceedingsURL string                  `json:"proceedings_url"`
	SupportEmail   string                  `json:"support_email"`
}

func (h *ConferenceHandler) GetConference(c *gin.Context) {
	conf, err := h.getOrCreateConference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	c.JSON(http.StatusOK, conf)
}

func (h *ConferenceHandler) UpdateConference(c *gin.Context) {
	conf, err := h.getOrCreateConference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	var payload updateConferencePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	conf.Title = strings.TrimSpace(payload.Title)
	conf.Description = strings.TrimSpace(payload.Description)
	if payload.StartsAt != nil {
		conf.StartsAt = *payload.StartsAt
	}
	if payload.EndsAt != nil {
		conf.EndsAt = *payload.EndsAt
	}
	conf.SupportEmail = strings.TrimSpace(payload.SupportEmail)
	conf.ProceedingsURL = strings.TrimSpace(payload.ProceedingsURL)
	if payload.Status != "" {
		switch payload.Status {
		case models.ConferenceStatusDraft, models.ConferenceStatusLive, models.ConferenceStatusFinished:
			conf.Status = payload.Status
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conference status"})
			return
		}
	}

	if conf.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}

	if err := h.DB.Save(conf).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update conference"})
		return
	}

	c.JSON(http.StatusOK, conf)
}

func (h *ConferenceHandler) getOrCreateConference() (*models.Conference, error) {
	var conf models.Conference
	if err := h.DB.Order("id asc").First(&conf).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		startsAt := time.Date(2026, time.April, 24, 10, 0, 0, 0, time.Local)
		endsAt := time.Date(2026, time.April, 25, 18, 0, 0, 0, time.Local)
		conf = models.Conference{
			Title:        "ЦИФРОВАЯ РЕВОЛЮЦИЯ: ТОЧКИ СОЦИАЛЬНО-ЭКОНОМИЧЕСКОГО РОСТА",
			Description:  "Всероссийская научно-практическая конференция с международным участием. Диалог между наукой, бизнесом и государством по вопросам цифровой трансформации экономики.",
			StartsAt:     startsAt,
			EndsAt:       endsAt,
			Status:       models.ConferenceStatusDraft,
			SupportEmail: "madinaborz@mail.ru",
		}
		if err := h.DB.Create(&conf).Error; err != nil {
			return nil, err
		}
	}
	return &conf, nil
}
