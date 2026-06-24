package handlers

import (
	"net/http"
	"strings"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ContentHandler struct {
	DB *gorm.DB
}

// ListPublic returns the resolved conference's visible content blocks, ordered.
func (h *ContentHandler) ListPublic(c *gin.Context) {
	var blocks []models.ContentBlock
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).
		Where("visible = ?", true).Order("position asc, id asc").Find(&blocks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load content"})
		return
	}
	c.JSON(http.StatusOK, blocks)
}

// ListAdmin returns all blocks (including hidden) of the resolved conference.
func (h *ContentHandler) ListAdmin(c *gin.Context) {
	var blocks []models.ContentBlock
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).
		Order("position asc, id asc").Find(&blocks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load content"})
		return
	}
	c.JSON(http.StatusOK, blocks)
}

type contentBlockPayload struct {
	Kind     string `json:"kind"`
	Position int    `json:"position"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	Visible  *bool  `json:"visible"` // pointer so an omitted value defaults to visible
}

func (h *ContentHandler) Create(c *gin.Context) {
	var payload contentBlockPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	kind := strings.TrimSpace(payload.Kind)
	if !models.IsValidContentBlockKind(kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid block kind"})
		return
	}
	// A resolved tenant with no active conference cannot own a block: a NULL
	// conference_id row is invisible to every later read (ByConference fails closed)
	// and rejected by RLS WITH CHECK. Reject up front for parity across deployments,
	// mirroring ReplaceMarkers/SeedDemo. (No resolved scope — unit tests — proceeds.)
	if scope, ok := tenant.FromContext(c); ok && scope.ConfID == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "no active conference for this organization"})
		return
	}
	visible := true
	if payload.Visible != nil {
		visible = *payload.Visible
	}
	block := models.ContentBlock{
		Kind:     kind,
		Position: payload.Position,
		Title:    strings.TrimSpace(payload.Title),
		Body:     payload.Body,
		Visible:  visible,
	}
	if cid := tenant.ConfID(c); cid != 0 {
		block.ConferenceID = &cid
	}
	if err := tenant.DB(c, h.DB).Create(&block).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create block"})
		return
	}
	c.JSON(http.StatusCreated, block)
}

// Update replaces a block's editable fields. The block is loaded conference-scoped
// first, so a cross-tenant id yields 404 and cannot be mutated.
func (h *ContentHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var payload contentBlockPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	kind := strings.TrimSpace(payload.Kind)
	if !models.IsValidContentBlockKind(kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid block kind"})
		return
	}

	var block models.ContentBlock
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Where("id = ?", id).First(&block).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "block not found"})
		return
	}
	block.Kind = kind
	block.Position = payload.Position
	block.Title = strings.TrimSpace(payload.Title)
	block.Body = payload.Body
	if payload.Visible != nil {
		block.Visible = *payload.Visible
	}
	if err := tenant.DB(c, h.DB).Save(&block).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update block"})
		return
	}
	c.JSON(http.StatusOK, block)
}

func (h *ContentHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	res := tenant.DB(c, h.DB).Scopes(tenant.ByConference(c)).Where("id = ?", id).Delete(&models.ContentBlock{})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete block"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "block not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
