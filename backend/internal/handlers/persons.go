package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PersonHandler struct {
	DB *gorm.DB
}

type personPayload struct {
	FullName     string `json:"full_name"`
	Degree       string `json:"degree"`
	Organization string `json:"organization"`
	Position     string `json:"position"`
	Bio          string `json:"bio"`
	Role         string `json:"role"`
	SortOrder    int    `json:"sort_order"`
}

func listPersons(c *gin.Context, db *gorm.DB) ([]models.Person, error) {
	var persons []models.Person
	err := tenant.DB(c, db).Scopes(tenant.ByConference(c)).
		Order("sort_order asc, id asc").
		Find(&persons).Error
	return persons, err
}

// ListPublic — публичный список персон (спикеры/оргкомитет/программный комитет)
// конференции для витрины (SCR-PUB-06), тенант-скоуплено.
func (h *PersonHandler) ListPublic(c *gin.Context) {
	persons, err := listPersons(c, h.DB)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list speakers"})
		return
	}
	c.JSON(http.StatusOK, persons)
}

func (h *PersonHandler) ListAdmin(c *gin.Context) {
	persons, err := listPersons(c, h.DB)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list speakers"})
		return
	}
	c.JSON(http.StatusOK, persons)
}

func resolvePersonRole(role, fallback string) (string, bool) {
	role = strings.TrimSpace(role)
	if role == "" {
		role = fallback
	}
	if role == "" {
		role = models.PersonRoleSpeaker
	}
	return role, models.PersonRoles[role]
}

func (h *PersonHandler) Create(c *gin.Context) {
	if scope, ok := tenant.FromContext(c); ok && scope.ConfID == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "no active conference for this organization"})
		return
	}
	var payload personPayload
	if err := c.ShouldBindJSON(&payload); err != nil || strings.TrimSpace(payload.FullName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	role, ok := resolvePersonRole(payload.Role, "")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	person := models.Person{
		FullName:     strings.TrimSpace(payload.FullName),
		Degree:       strings.TrimSpace(payload.Degree),
		Organization: strings.TrimSpace(payload.Organization),
		Position:     strings.TrimSpace(payload.Position),
		Bio:          strings.TrimSpace(payload.Bio),
		Role:         role,
		SortOrder:    payload.SortOrder,
	}
	if cid := tenant.ConfID(c); cid != 0 {
		person.ConferenceID = &cid
	}
	if err := tenant.DB(c, h.DB).Create(&person).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create speaker"})
		return
	}
	c.JSON(http.StatusCreated, person)
}

func (h *PersonHandler) Update(c *gin.Context) {
	var person models.Person
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).First(&person, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "speaker not found"})
		return
	}
	var payload personPayload
	if err := c.ShouldBindJSON(&payload); err != nil || strings.TrimSpace(payload.FullName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	role, ok := resolvePersonRole(payload.Role, person.Role)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	person.FullName = strings.TrimSpace(payload.FullName)
	person.Degree = strings.TrimSpace(payload.Degree)
	person.Organization = strings.TrimSpace(payload.Organization)
	person.Position = strings.TrimSpace(payload.Position)
	person.Bio = strings.TrimSpace(payload.Bio)
	person.Role = role
	person.SortOrder = payload.SortOrder
	if err := tenant.DB(c, h.DB).Save(&person).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update speaker"})
		return
	}
	c.JSON(http.StatusOK, person)
}

func (h *PersonHandler) Delete(c *gin.Context) {
	result := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).
		Where("id = ?", c.Param("id")).
		Delete(&models.Person{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete speaker"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "speaker not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
