package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type sectionTalkView struct {
	TalkTitle    string          `json:"talk_title"`
	Abstract     string          `json:"abstract"`
	AuthorName   string          `json:"author_name"`
	Organization string          `json:"organization"`
	UserType     models.UserType `json:"user_type"`
	StartsAt     *time.Time      `json:"starts_at"`
	EndsAt       *time.Time      `json:"ends_at"`
	JoinURL      string          `json:"join_url"`
}

// GetSection — публичная карточка секции (SCR-PUB-05): секция (с председателем)
// + список её докладов из утверждённой программы (ProgramAssignment), тенант-
// скоуплено. Доклады: тема, аннотация, автор/организация, формат, время, трансляция.
func (h *SectionHandler) GetSection(c *gin.Context) {
	id := c.Param("id")
	var section models.Section
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).First(&section, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}

	var assignments []models.ProgramAssignment
	tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).
		Preload("User.Profile").
		Where("section_id = ?", section.ID).
		Order("starts_at asc, id asc").
		Find(&assignments)

	talks := make([]sectionTalkView, 0, len(assignments))
	for _, a := range assignments {
		talks = append(talks, sectionTalkView{
			TalkTitle:    a.TalkTitle,
			Abstract:     a.Abstract,
			AuthorName:   a.User.Profile.FullName,
			Organization: a.User.Profile.Organization,
			UserType:     a.UserType,
			StartsAt:     a.StartsAt,
			EndsAt:       a.EndsAt,
			JoinURL:      a.JoinURL,
		})
	}

	c.JSON(http.StatusOK, gin.H{"section": section, "talks": talks})
}

type SectionHandler struct {
	DB *gorm.DB
}

func (h *SectionHandler) ListSections(c *gin.Context) {
	var sections []models.Section
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Order("start_at asc, id asc").Find(&sections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sections"})
		return
	}
	curated := curatePublicSections(sections)
	if len(curated) > 0 {
		c.JSON(http.StatusOK, curated)
		return
	}
	c.JSON(http.StatusOK, sections)
}

// ListSectionsAdmin отдаёт СЫРЫЕ секции тенанта без кураторской подмены названий
// (curatePublicSections) — для консоли организатора, которая управляет реальными
// секциями. Публичная витрина продолжает использовать ListSections с курацией.
func (h *SectionHandler) ListSectionsAdmin(c *gin.Context) {
	var sections []models.Section
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Order("start_at asc, id asc").Find(&sections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sections"})
		return
	}
	c.JSON(http.StatusOK, sections)
}

func (h *SectionHandler) CreateSection(c *gin.Context) {
	var section models.Section
	if err := c.ShouldBindJSON(&section); err != nil || section.Title == "" || section.Room == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	if cid := tenant.ConfID(c); cid != 0 {
		section.ConferenceID = &cid
	}
	if err := tenant.DB(c, h.DB).Create(&section).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create section"})
		return
	}
	c.JSON(http.StatusCreated, section)
}

func (h *SectionHandler) UpdateSection(c *gin.Context) {
	id := c.Param("id")
	var payload models.Section
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	if payload.Title == "" || payload.Room == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title and room are required"})
		return
	}
	// Грузим строку (conference-scoped → чужой id даёт 404), затем присваиваем
	// редактируемые поля и Save. Struct-.Updates пропускал бы нулевые значения, из-за
	// чего редактор не мог ОЧИСТИТЬ председателя/описание/время или выставить capacity=0.
	var section models.Section
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).First(&section, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
		return
	}
	section.Title = payload.Title
	section.Room = payload.Room
	section.Chair = payload.Chair
	section.Description = payload.Description
	section.Capacity = payload.Capacity
	section.StartAt = payload.StartAt
	section.EndAt = payload.EndAt
	if err := tenant.DB(c, h.DB).Save(&section).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update section"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type publicSectionPreset struct {
	Title   string
	Matcher func(normalized string) bool
}

func curatePublicSections(sections []models.Section) []models.Section {
	presets := []publicSectionPreset{
		{
			Title: "Экономика, право и управление в условиях цифровой трансформации",
			Matcher: func(normalized string) bool {
				return strings.Contains(normalized, "эконом") && strings.Contains(normalized, "прав") && strings.Contains(normalized, "управ")
			},
		},
		{
			Title: "Современное общество в цифровую эпоху",
			Matcher: func(normalized string) bool {
				return strings.Contains(normalized, "современное общество")
			},
		},
		{
			Title: "Лингвистика и методика преподавания языков",
			Matcher: func(normalized string) bool {
				return strings.Contains(normalized, "лингвист") && strings.Contains(normalized, "язык")
			},
		},
		{
			Title: "Физическое воспитание: инновации и подходы",
			Matcher: func(normalized string) bool {
				return strings.Contains(normalized, "физичес")
			},
		},
		{
			Title: "Наука зуммеров и альфа (молодые ученые до 35 лет)",
			Matcher: func(normalized string) bool {
				return (strings.Contains(normalized, "зумер") || strings.Contains(normalized, "зуммер")) && strings.Contains(normalized, "альфа")
			},
		},
	}

	curated := make([]models.Section, 0, len(presets))
	used := make(map[uint]struct{}, len(presets))

	for _, preset := range presets {
		for _, section := range sections {
			if _, exists := used[section.ID]; exists {
				continue
			}
			normalized := normalizeSectionTitle(section.Title)
			if !preset.Matcher(normalized) {
				continue
			}
			section.Title = preset.Title
			curated = append(curated, section)
			used[section.ID] = struct{}{}
			break
		}
	}

	return curated
}

func normalizeSectionTitle(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func (h *SectionHandler) DeleteSection(c *gin.Context) {
	id := c.Param("id")
	err := tenant.DB(c, h.DB).Transaction(func(tx *gorm.DB) error {
		// Profile is parent-scoped (UserID -> User.organization_id) with no
		// conference_id column, so constrain its detach via the org through a user
		// subquery; no-op when no scope is resolved (single-tenant / unit tests).
		profileQ := tx.Model(&models.Profile{}).Where("section_id = ?", id)
		if s, ok := tenant.FromContext(c); ok && s.OrgID != 0 {
			profileQ = profileQ.Where(
				"user_id IN (?)",
				tx.Model(&models.User{}).Select("id").Where("organization_id = ?", s.OrgID),
			)
		}
		if err := profileQ.Update("section_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Scopes(tenant.ByConference(c)).Model(&models.ProgramAssignment{}).
			Where("section_id = ?", id).Update("section_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Scopes(tenant.ByConference(c)).Where("section_id = ?", id).
			Delete(&models.ChatMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Scopes(tenant.ByConference(c)).Where("id = ?", id).
			Delete(&models.Section{}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete section"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
