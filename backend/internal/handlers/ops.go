package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// OpsHandler powers the platform operator console (zone OPS, SCR-OPS-*). It is
// CROSS-TENANT: the operator (RoleOperator) sees and manages every Organization,
// so these handlers run on the owner pool (DB) WITHOUT tenant scoping — the router
// keeps them off IdentityScope/RequireActiveOrg. Access is gated by
// RequireRole("operator") + the auth Host-binding (ops lives on the platform
// domain, not a tenant subdomain).
type OpsHandler struct {
	DB *gorm.DB
}

type opsTenantView struct {
	ID           uint   `json:"id"`
	Slug         string `json:"slug"`
	DisplayName  string `json:"display_name"`
	Plan         string `json:"plan"`
	Status       string `json:"status"`
	Conferences  int64  `json:"conferences"`
	Participants int64  `json:"participants"`
	CreatedAt    string `json:"created_at"`
}

// ListTenants returns every organization with per-tenant aggregates (conferences,
// participants). Aggregates are computed with grouped counts (two queries) rather
// than per-row subqueries.
func (h *OpsHandler) ListTenants(c *gin.Context) {
	var orgs []models.Organization
	if err := h.DB.Order("id asc").Find(&orgs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tenants"})
		return
	}

	confByOrg := map[uint]int64{}
	type orgCount struct {
		OrganizationID uint
		Cnt            int64
	}
	var crows []orgCount
	h.DB.Model(&models.Conference{}).
		Select("organization_id, count(*) as cnt").Group("organization_id").Scan(&crows)
	for _, r := range crows {
		confByOrg[r.OrganizationID] = r.Cnt
	}

	partByOrg := map[uint]int64{}
	var prows []orgCount
	h.DB.Model(&models.User{}).
		Select("organization_id, count(*) as cnt").
		Where("role = ?", models.RoleParticipant).
		Group("organization_id").Scan(&prows)
	for _, r := range prows {
		partByOrg[r.OrganizationID] = r.Cnt
	}

	out := make([]opsTenantView, 0, len(orgs))
	for _, o := range orgs {
		out = append(out, opsTenantView{
			ID:           o.ID,
			Slug:         o.Slug,
			DisplayName:  o.DisplayName,
			Plan:         string(o.Plan),
			Status:       string(o.Status),
			Conferences:  confByOrg[o.ID],
			Participants: partByOrg[o.ID],
			CreatedAt:    o.CreatedAt.Format("2006-01-02"),
		})
	}
	c.JSON(http.StatusOK, gin.H{"tenants": out})
}

// Stats returns platform KPIs for the operator dashboard.
func (h *OpsHandler) Stats(c *gin.Context) {
	count := func(scope func(*gorm.DB) *gorm.DB) int64 {
		var n int64
		q := h.DB.Model(&models.Organization{})
		if scope != nil {
			q = scope(q)
		}
		q.Count(&n)
		return n
	}
	byStatus := func(s models.OrganizationStatus) int64 {
		return count(func(q *gorm.DB) *gorm.DB { return q.Where("status = ?", s) })
	}

	var paid, free int64
	h.DB.Model(&models.Organization{}).Where("plan <> ?", models.OrganizationPlanFree).Count(&paid)
	free = count(func(q *gorm.DB) *gorm.DB { return q.Where("plan = ?", models.OrganizationPlanFree) })

	var conferences, participants int64
	h.DB.Model(&models.Conference{}).Count(&conferences)
	h.DB.Model(&models.User{}).Where("role = ?", models.RoleParticipant).Count(&participants)

	c.JSON(http.StatusOK, gin.H{
		"tenants": gin.H{
			"total":     count(nil),
			"active":    byStatus(models.OrganizationStatusActive),
			"suspended": byStatus(models.OrganizationStatusSuspended),
			"archived":  byStatus(models.OrganizationStatusArchived),
		},
		"plans":        gin.H{"paid": paid, "free": free},
		"conferences":  conferences,
		"participants": participants,
	})
}

type opsStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

var opsAllowedStatuses = map[models.OrganizationStatus]bool{
	models.OrganizationStatusActive:    true,
	models.OrganizationStatusSuspended: true,
	models.OrganizationStatusArchived:  true,
}

// SetTenantStatus changes a tenant's lifecycle status (active/suspended/archived).
// Suspending blocks the tenant's whole public zone and its console (see the PUB
// gate + tenant.RequireActiveOrg). The reason is recorded for audit.
func (h *OpsHandler) SetTenantStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant id"})
		return
	}
	var req opsStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	status := models.OrganizationStatus(strings.TrimSpace(req.Status))
	if !opsAllowedStatuses[status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	// The default/platform organization underpins the bare-domain control plane —
	// never let an operator suspend or archive it (would dark the whole platform).
	if uint(id) == tenant.DefaultOrgID && status != models.OrganizationStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "нельзя приостановить или архивировать платформенную организацию"})
		return
	}
	var org models.Organization
	if err := h.DB.First(&org, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	if err := h.DB.Model(&org).Update("status", status).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tenant"})
		return
	}
	// Lightweight audit until a dedicated audit log lands (SCR-OPS-06).
	log.Printf("ops: operator user_id=%d set tenant %d (%s) status %s->%s reason=%q",
		c.GetUint("user_id"), org.ID, org.Slug, org.Status, status, strings.TrimSpace(req.Reason))
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type opsPlanRequest struct {
	Plan   string `json:"plan"`
	Reason string `json:"reason"`
}

var opsAllowedPlans = map[models.OrganizationPlan]bool{
	models.OrganizationPlanFree:        true,
	models.OrganizationPlanKafedra:     true,
	models.OrganizationPlanInstitut:    true,
	models.OrganizationPlanUniversitet: true,
}

// SetTenantPlan is an operator override of a tenant's subscription plan (manual
// billing action; the real provider integration is separate).
func (h *OpsHandler) SetTenantPlan(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant id"})
		return
	}
	var req opsPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	plan := models.OrganizationPlan(strings.TrimSpace(req.Plan))
	if !opsAllowedPlans[plan] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid plan"})
		return
	}
	var org models.Organization
	if err := h.DB.First(&org, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	if err := h.DB.Model(&org).Update("plan", plan).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tenant"})
		return
	}
	log.Printf("ops: operator user_id=%d set tenant %d (%s) plan %s->%s reason=%q",
		c.GetUint("user_id"), org.ID, org.Slug, org.Plan, plan, strings.TrimSpace(req.Reason))
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
