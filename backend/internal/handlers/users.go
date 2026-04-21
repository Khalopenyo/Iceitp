package handlers

import (
	"conferenceplatforma/internal/models"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type UserHandler struct {
	DB *gorm.DB
}

func (h *UserHandler) Me(c *gin.Context) {
	userID := c.GetUint("user_id")
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetUint("user_id")
	var profile models.Profile
	if err := h.DB.Where("user_id = ?", userID).First(&profile).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	var payload models.Profile
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	if payload.SectionID != nil {
		var section models.Section
		if err := h.DB.First(&section, *payload.SectionID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "selected section not found"})
			return
		}
	}
	profile.FullName = strings.TrimSpace(payload.FullName)
	profile.Organization = strings.TrimSpace(payload.Organization)
	profile.Position = strings.TrimSpace(payload.Position)
	profile.City = strings.TrimSpace(payload.City)
	profile.Degree = strings.TrimSpace(payload.Degree)
	profile.SectionID = payload.SectionID
	profile.TalkTitle = strings.TrimSpace(payload.TalkTitle)
	if strings.TrimSpace(payload.Phone) != "" {
		phone, err := formatPhoneForStorage(payload.Phone)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid phone"})
			return
		}
		var existing models.Profile
		if err := h.DB.
			Where("phone = ? AND user_id <> ?", phone, userID).
			First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "phone already in use"})
			return
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate phone"})
			return
		}
		profile.Phone = phone
	} else {
		profile.Phone = ""
	}
	if err := h.DB.Save(&profile).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			c.JSON(http.StatusConflict, gin.H{"error": "phone already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}
	c.JSON(http.StatusOK, profile)
}

func (h *UserHandler) ListUsers(c *gin.Context) {
	page, pageSize := parsePagination(c, 20, 100)
	searchQuery := strings.ToLower(strings.TrimSpace(c.Query("q")))
	roleFilter := strings.TrimSpace(c.Query("role"))
	userTypeFilter := strings.TrimSpace(c.Query("user_type"))
	badgeIssuedFilter := strings.TrimSpace(c.Query("badge_issued"))

	tx := h.DB.Model(&models.User{}).
		Joins("LEFT JOIN profiles ON profiles.user_id = users.id")

	if searchQuery != "" {
		pattern := "%" + searchQuery + "%"
		tx = tx.Where(
			"LOWER(users.email) LIKE ? OR LOWER(COALESCE(profiles.full_name, '')) LIKE ? OR LOWER(COALESCE(profiles.organization, '')) LIKE ? OR LOWER(COALESCE(profiles.phone, '')) LIKE ?",
			pattern,
			pattern,
			pattern,
			pattern,
		)
	}
	if roleFilter != "" {
		tx = tx.Where("users.role = ?", roleFilter)
	}
	if userTypeFilter != "" {
		tx = tx.Where("users.user_type = ?", userTypeFilter)
	}
	if badgeIssuedFilter != "" {
		value, err := strconv.ParseBool(badgeIssuedFilter)
		if err == nil {
			tx = tx.Where("users.badge_issued = ?", value)
		}
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count users"})
		return
	}

	var users []models.User
	if err := tx.Preload("Profile").
		Order("users.created_at desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}
	c.JSON(http.StatusOK, paginatedResponse[models.User]{
		Items:    users,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

func (h *UserHandler) UpdateUserRole(c *gin.Context) {
	id := c.Param("id")
	var payload struct {
		Role models.Role `json:"role"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	if err := h.DB.Model(&models.User{}).Where("id = ?", id).Update("role", payload.Role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update role"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *UserHandler) SetBadgeIssued(c *gin.Context) {
	id := c.Param("id")
	var payload struct {
		BadgeIssued bool `json:"badge_issued"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	var user models.User
	if err := h.DB.First(&user, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	if user.UserType == models.UserTypeOnline && payload.BadgeIssued {
		c.JSON(http.StatusBadRequest, gin.H{"error": "badge can be prepared only for offline participants"})
		return
	}

	if err := h.DB.Model(&models.User{}).Where("id = ?", id).Update("badge_issued", payload.BadgeIssued).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update badge status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "badge_issued": payload.BadgeIssued})
}

func (h *UserHandler) DeleteUser(c *gin.Context) {
	id := c.Param("id")
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", id).Delete(&models.Profile{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.Feedback{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.ChatMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.ProgramAssignment{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.CheckIn{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.Certificate{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.ArticleSubmission{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", id).Delete(&models.ConsentLog{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.User{}, id).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
