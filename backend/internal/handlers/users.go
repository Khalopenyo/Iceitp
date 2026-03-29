package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"

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
	profile.FullName = payload.FullName
	profile.Organization = payload.Organization
	profile.Position = payload.Position
	profile.City = payload.City
	profile.Degree = payload.Degree
	profile.SectionID = payload.SectionID
	profile.TalkTitle = payload.TalkTitle
	profile.Phone = payload.Phone
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
