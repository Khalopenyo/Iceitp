package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type OrganizationHandler struct {
	DB *gorm.DB
}

// orgBranding is the public per-tenant branding surface the frontend themes from.
type orgBranding struct {
	Slug         string `json:"slug"`
	DisplayName  string `json:"display_name"`
	LogoURL      string `json:"logo_url"`
	PrimaryColor string `json:"primary_color"`
	Status       string `json:"status"`
	Plan         string `json:"plan"`
}

var hexColorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func brandingOf(org models.Organization) orgBranding {
	return orgBranding{
		Slug:         org.Slug,
		DisplayName:  org.DisplayName,
		LogoURL:      org.LogoURL,
		PrimaryColor: org.PrimaryColor,
		Status:       string(org.Status),
		Plan:         string(org.Plan),
	}
}

// SelectPlan — мок-оформление подписки: организатор выбирает платный тариф
// (без реального платёжного провайдера). Тариф снимает гейт на публикацию сайта.
func (h *OrganizationHandler) SelectPlan(c *gin.Context) {
	var payload struct {
		Plan string `json:"plan"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	plan := models.OrganizationPlan(strings.TrimSpace(payload.Plan))
	switch plan {
	case models.OrganizationPlanFree, models.OrganizationPlanKafedra, models.OrganizationPlanInstitut, models.OrganizationPlanUniversitet:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown plan"})
		return
	}

	if err := tenant.DB(c, h.DB).Model(&models.Organization{}).Where("id = ?", tenant.OrgID(c)).Update("plan", plan).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update plan"})
		return
	}

	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load organization"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}

// GetOrg returns the resolved tenant's branding. Public — the frontend needs it to
// theme before login. The organization id comes from the resolved scope (Host
// subdomain), never from user input, so a caller can only ever read its own org.
func (h *OrganizationHandler) GetOrg(c *gin.Context) {
	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}

// UpdateOrg updates the resolved tenant's branding (admin only). Only the
// resolved org is touched (id from scope), so an admin cannot edit another tenant.
func (h *OrganizationHandler) UpdateOrg(c *gin.Context) {
	var payload struct {
		DisplayName  *string `json:"display_name"`
		LogoURL      *string `json:"logo_url"`
		PrimaryColor *string `json:"primary_color"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	updates := map[string]any{}
	if payload.DisplayName != nil {
		name := strings.TrimSpace(*payload.DisplayName)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "display_name cannot be empty"})
			return
		}
		updates["display_name"] = name
	}
	if payload.LogoURL != nil {
		updates["logo_url"] = strings.TrimSpace(*payload.LogoURL)
	}
	if payload.PrimaryColor != nil {
		color := strings.TrimSpace(*payload.PrimaryColor)
		if color != "" && !hexColorRe.MatchString(color) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "primary_color must be a #RRGGBB hex value"})
			return
		}
		updates["primary_color"] = color
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	res := tenant.DB(c, h.DB).Model(&models.Organization{}).Where("id = ?", tenant.OrgID(c)).Updates(updates)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update organization"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}

	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load organization"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}
