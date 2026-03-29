package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SectionHandler struct {
	DB *gorm.DB
}

func (h *SectionHandler) ListSections(c *gin.Context) {
	var sections []models.Section
	if err := h.DB.Order("start_at asc, id asc").Find(&sections).Error; err != nil {
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

func (h *SectionHandler) CreateSection(c *gin.Context) {
	var section models.Section
	if err := c.ShouldBindJSON(&section); err != nil || section.Title == "" || section.Room == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	if err := h.DB.Create(&section).Error; err != nil {
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
	if err := h.DB.Model(&models.Section{}).Where("id = ?", id).Updates(payload).Error; err != nil {
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
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Profile{}).Where("section_id = ?", id).Update("section_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Where("section_id = ?", id).Delete(&models.ChatMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.Section{}, id).Error; err != nil {
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
