package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ConsentHandler struct {
	DB *gorm.DB
}

type consentEntry struct {
	ID             uint      `json:"id"`
	UserID         uint      `json:"user_id"`
	UserName       string    `json:"user_name"`
	UserEmail      string    `json:"user_email"`
	ConsentType    string    `json:"consent_type"`
	ConsentURL     string    `json:"consent_url"`
	ConsentVersion string    `json:"consent_version"`
	IP             string    `json:"ip"`
	UserAgent      string    `json:"user_agent"`
	GrantedAt      time.Time `json:"granted_at"`
}

func (h *ConsentHandler) ListConsents(c *gin.Context) {
	page, pageSize := parsePagination(c, 20, 100)
	searchQuery := strings.ToLower(strings.TrimSpace(c.Query("q")))
	consentType := strings.TrimSpace(c.Query("consent_type"))

	tx := h.DB.Table("consent_logs").
		Joins("LEFT JOIN users ON users.id = consent_logs.user_id").
		Joins("LEFT JOIN profiles ON profiles.user_id = users.id")

	if searchQuery != "" {
		pattern := "%" + searchQuery + "%"
		tx = tx.Where(
			"LOWER(COALESCE(profiles.full_name, '')) LIKE ? OR LOWER(COALESCE(users.email, '')) LIKE ? OR LOWER(COALESCE(consent_logs.consent_version, '')) LIKE ? OR LOWER(COALESCE(consent_logs.ip, '')) LIKE ?",
			pattern,
			pattern,
			pattern,
			pattern,
		)
	}
	if consentType != "" {
		tx = tx.Where("consent_logs.consent_type = ?", consentType)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count consents"})
		return
	}

	var consents []consentEntry
	if err := tx.Select(`
			consent_logs.id,
			consent_logs.user_id,
			COALESCE(profiles.full_name, '') AS user_name,
			COALESCE(users.email, '') AS user_email,
			consent_logs.consent_type,
			consent_logs.consent_url,
			consent_logs.consent_version,
			consent_logs.ip,
			consent_logs.user_agent,
			consent_logs.granted_at
		`).
		Order("consent_logs.granted_at desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Scan(&consents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list consents"})
		return
	}

	c.JSON(http.StatusOK, paginatedResponse[consentEntry]{
		Items:    consents,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}
