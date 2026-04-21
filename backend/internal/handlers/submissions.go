package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/objectstore"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SubmissionHandler struct {
	DB    *gorm.DB
	Store objectstore.Store
}

const maxSubmissionFileSize = 20 * 1024 * 1024

func (h *SubmissionHandler) ListSubmissions(c *gin.Context) {
	userID := c.GetUint("user_id")

	var submissions []models.ArticleSubmission
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load submissions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":               submissions,
		"storage_configured":  h.Store != nil,
		"max_file_size_bytes": maxSubmissionFileSize,
	})
}

func (h *SubmissionHandler) CreateSubmission(c *gin.Context) {
	if h.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage is not configured"})
		return
	}

	userID := c.GetUint("user_id")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	fileType := normalizeSubmissionType(file.Filename)
	if !isSupportedSubmissionType(fileType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type"})
		return
	}
	if file.Size <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty file"})
		return
	}
	if file.Size > maxSubmissionFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is too large", "details": "maximum file size is 20 MB"})
		return
	}

	title := strings.TrimSpace(c.PostForm("title"))
	if title == "" {
		title = strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open uploaded file"})
		return
	}
	defer src.Close()

	submission := models.ArticleSubmission{
		UserID:   userID,
		Title:    title,
		FileName: filepath.Base(file.Filename),
		FileType: fileType,
		FileSize: file.Size,
		Status:   models.SubmissionStatusUploaded,
	}
	if err := h.DB.Create(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create submission"})
		return
	}

	objectKey := buildSubmissionObjectKey(userID, submission.ID, submission.FileName)
	if err := h.Store.Put(c.Request.Context(), objectKey, src, file.Size, file.Header.Get("Content-Type")); err != nil {
		_ = h.DB.Delete(&models.ArticleSubmission{}, submission.ID).Error
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to upload file to object storage"})
		return
	}

	submission.ObjectKey = objectKey
	submission.Status = models.SubmissionStatusReady
	if err := h.DB.Model(&submission).Updates(map[string]any{
		"file_path": submission.ObjectKey,
		"status":    submission.Status,
	}).Error; err != nil {
		_ = h.Store.Delete(c.Request.Context(), objectKey)
		_ = h.DB.Delete(&models.ArticleSubmission{}, submission.ID).Error
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize submission"})
		return
	}

	c.JSON(http.StatusCreated, submission)
}

func (h *SubmissionHandler) DownloadSubmissionFile(c *gin.Context) {
	submission, err := h.loadOwnedSubmission(c)
	if err != nil {
		return
	}
	if h.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage is not configured"})
		return
	}
	if strings.TrimSpace(submission.ObjectKey) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission file not found"})
		return
	}

	obj, err := h.Store.Get(c.Request.Context(), submission.ObjectKey)
	if err != nil {
		if errors.Is(err, objectstore.ErrObjectNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "submission file not found"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to load submission file"})
		return
	}
	defer obj.Body.Close()

	if obj.ContentType != "" {
		c.Header("Content-Type", obj.ContentType)
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", submission.FileName))
	c.Header("Content-Length", strconv.FormatInt(obj.Size, 10))
	_, _ = c.Writer.ReadFrom(obj.Body)
}

func (h *SubmissionHandler) loadOwnedSubmission(c *gin.Context) (*models.ArticleSubmission, error) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid submission id"})
		return nil, err
	}
	userID := c.GetUint("user_id")

	var submission models.ArticleSubmission
	if err := h.DB.Where("id = ? AND user_id = ?", uint(id), userID).First(&submission).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
			return nil, err
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load submission"})
		return nil, err
	}
	return &submission, nil
}

func normalizeSubmissionType(fileName string) string {
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(fileName)))
	if ext == "" {
		return ""
	}
	if strings.HasPrefix(ext, ".") {
		return ext
	}
	return "." + ext
}

func isSupportedSubmissionType(fileType string) bool {
	switch fileType {
	case ".txt", ".doc", ".docx", ".pdf", ".rtf", ".odt":
		return true
	default:
		return false
	}
}

func buildSubmissionObjectKey(userID, submissionID uint, fileName string) string {
	return fmt.Sprintf("submissions/user-%d/submission-%d/%d-%s", userID, submissionID, time.Now().UnixNano(), filepath.Base(fileName))
}
