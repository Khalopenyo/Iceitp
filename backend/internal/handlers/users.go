package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"
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
		profile.Phone = phone
	} else {
		profile.Phone = ""
	}
	if err := h.DB.Save(&profile).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}
	c.JSON(http.StatusOK, profile)
}

func (h *UserHandler) ListUsers(c *gin.Context) {
	var users []models.User
	if err := h.DB.Preload("Profile").Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}
	c.JSON(http.StatusOK, users)
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
