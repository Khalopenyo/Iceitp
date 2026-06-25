package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
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
	conf, err := h.getOrCreateConference(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	c.JSON(http.StatusOK, conf)
}

func (h *ConferenceHandler) UpdateConference(c *gin.Context) {
	conf, err := h.getOrCreateConference(c)
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

	if err := tenant.DB(c, h.DB).Save(conf).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update conference"})
		return
	}

	c.JSON(http.StatusOK, conf)
}

type landingSectionView struct {
	ID          uint      `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Room        string    `json:"room"`
	StartAt     time.Time `json:"start_at"`
	EndAt       time.Time `json:"end_at"`
	TalksCount  int       `json:"talks_count"`
}

type landingStats struct {
	Sections     int64 `json:"sections"`
	Talks        int64 `json:"talks"`
	Participants int64 `json:"participants"`
	Cities       int64 `json:"cities"`
}

// GetLanding отдаёт публичные данные витрины лендинга (SCR-PUB-01) одним
// запросом: конференция, агрегаты (секции/доклады/участники/города), карточки
// секций с числом докладов и превью программы. Всё тенант-скоуплено.
func (h *ConferenceHandler) GetLanding(c *gin.Context) {
	conf, err := h.getOrCreateConference(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	db := tenant.DB(c, h.DB)

	var sections []models.Section
	if err := db.Scopes(tenant.ByConference(c)).Order("start_at asc, id asc").Find(&sections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load sections"})
		return
	}

	// Число докладов по секциям: профили, сгруппированные по section_id (скоуп по org).
	type sectionCount struct {
		SectionID uint
		Cnt       int
	}
	var rows []sectionCount
	db.Model(&models.Profile{}).
		Scopes(tenant.ByOrg(c)).
		Select("section_id, count(*) as cnt").
		Where("section_id IS NOT NULL").
		Group("section_id").
		Scan(&rows)
	countBySection := make(map[uint]int, len(rows))
	for _, r := range rows {
		countBySection[r.SectionID] = r.Cnt
	}

	sectionViews := make([]landingSectionView, 0, len(sections))
	for _, s := range sections {
		sectionViews = append(sectionViews, landingSectionView{
			ID:          s.ID,
			Title:       s.Title,
			Description: s.Description,
			Room:        s.Room,
			StartAt:     s.StartAt,
			EndAt:       s.EndAt,
			TalksCount:  countBySection[s.ID],
		})
	}

	var stats landingStats
	db.Model(&models.Section{}).Scopes(tenant.ByConference(c)).Count(&stats.Sections)
	db.Model(&models.Profile{}).Scopes(tenant.ByOrg(c)).Count(&stats.Participants)
	db.Model(&models.Profile{}).Scopes(tenant.ByOrg(c)).Where("talk_title <> ''").Count(&stats.Talks)
	db.Model(&models.Profile{}).Scopes(tenant.ByOrg(c)).Where("city <> ''").Distinct("city").Count(&stats.Cities)

	preview := sectionViews
	if len(preview) > 5 {
		preview = preview[:5]
	}

	c.JSON(http.StatusOK, gin.H{
		"conference":      conf,
		"stats":           stats,
		"sections":        sectionViews,
		"program_preview": preview,
	})
}

func (h *ConferenceHandler) getOrCreateConference(c *gin.Context) (*models.Conference, error) {
	var conf models.Conference
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByOrg(c)).Order("id asc").First(&conf).Error; err != nil {
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
		org := tenant.OrgID(c)
		conf.OrganizationID = &org
		if err := tenant.DB(c, h.DB).Create(&conf).Error; err != nil {
			return nil, err
		}
	}
	return &conf, nil
}
