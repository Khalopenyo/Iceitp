package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"conferenceplatforma/internal/antiplagiat"
	"conferenceplatforma/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SubmissionHandler struct {
	DB      *gorm.DB
	Service *antiplagiat.Service
}

type antiplagiatConfigPayload struct {
	SiteURL             string   `json:"site_url"`
	WSDLURL             string   `json:"wsdl_url"`
	APILogin            string   `json:"api_login"`
	APIPassword         string   `json:"api_password"`
	Enabled             bool     `json:"enabled"`
	AddToIndex          bool     `json:"add_to_index"`
	CheckServices       []string `json:"check_services"`
	AllowShortReport    bool     `json:"allow_short_report"`
	AllowReadonlyReport bool     `json:"allow_readonly_report"`
	AllowEditableReport bool     `json:"allow_editable_report"`
	AllowPdfReport      bool     `json:"allow_pdf_report"`
}

const maxSubmissionFileSize = 20 * 1024 * 1024

func (h *SubmissionHandler) ListSubmissions(c *gin.Context) {
	userID := c.GetUint("user_id")

	var submissions []models.ArticleSubmission
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load submissions"})
		return
	}

	cfg, err := h.Service.LoadConfig()
	response := gin.H{
		"items":      submissions,
		"configured": false,
		"enabled":    false,
		"permissions": gin.H{
			"editable_report": false,
			"readonly_report": false,
			"short_report":    false,
			"pdf_report":      false,
		},
	}
	if err == nil {
		response["configured"] = true
		response["enabled"] = cfg.Enabled
		response["permissions"] = gin.H{
			"editable_report": cfg.AllowEditableReport,
			"readonly_report": cfg.AllowReadonlyReport,
			"short_report":    cfg.AllowShortReport,
			"pdf_report":      cfg.AllowPdfReport,
		}
	} else if !errors.Is(err, antiplagiat.ErrConfigNotFound) {
		response["message"] = err.Error()
	}

	c.JSON(http.StatusOK, response)
}

func (h *SubmissionHandler) CreateSubmission(c *gin.Context) {
	cfg, err := h.Service.LoadConfig()
	if err != nil {
		if errors.Is(err, antiplagiat.ErrConfigNotFound) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "antiplagiat is not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load antiplagiat config"})
		return
	}
	if !cfg.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "antiplagiat integration is disabled"})
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

	targetPath, err := antiplagiat.StoragePath(userID, file.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare upload storage"})
		return
	}
	if err := c.SaveUploadedFile(file, targetPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save uploaded file"})
		return
	}

	submission := models.ArticleSubmission{
		UserID:    userID,
		Title:     title,
		FileName:  filepath.Base(file.Filename),
		FileType:  fileType,
		FilePath:  targetPath,
		FileSize:  file.Size,
		Status:    models.SubmissionStatusUploaded,
		PDFStatus: models.PDFStatusNone,
	}
	if err := h.DB.Create(&submission).Error; err != nil {
		_ = removeFileQuietly(targetPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create submission"})
		return
	}
	submission.ExternalUserID = buildExternalUserID(userID, submission.ID)
	if err := h.DB.Model(&submission).Update("external_user_id", submission.ExternalUserID).Error; err != nil {
		_ = removeFileQuietly(targetPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize submission metadata"})
		return
	}

	h.Service.QueueSubmission(submission.ID)
	c.JSON(http.StatusCreated, submission)
}

func (h *SubmissionHandler) RetrySubmission(c *gin.Context) {
	submission, err := h.loadOwnedSubmission(c)
	if err != nil {
		return
	}
	updated, err := h.Service.RetrySubmission(submission.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to restart check", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *SubmissionHandler) RefreshSubmission(c *gin.Context) {
	submission, err := h.loadOwnedSubmission(c)
	if err != nil {
		return
	}
	updated, err := h.Service.RefreshSubmission(submission.ID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to refresh results", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *SubmissionHandler) RequestPDF(c *gin.Context) {
	submission, err := h.loadOwnedSubmission(c)
	if err != nil {
		return
	}
	updated, err := h.Service.RequestPDF(submission.ID)
	if err != nil {
		switch {
		case errors.Is(err, antiplagiat.ErrSubmissionNotReady):
			c.JSON(http.StatusConflict, gin.H{"error": "submission is not ready yet"})
		case errors.Is(err, antiplagiat.ErrPDFNotAllowed):
			c.JSON(http.StatusForbidden, gin.H{"error": "pdf reports are disabled"})
		default:
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to request pdf report", "details": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *SubmissionHandler) GetConfig(c *gin.Context) {
	envOverrides := h.Service.GetEnvOverrideState()
	cfg, err := h.Service.LoadConfig()
	if err != nil {
		if errors.Is(err, antiplagiat.ErrConfigNotFound) {
			c.JSON(http.StatusOK, gin.H{
				"site_url":              "",
				"wsdl_url":              "",
				"api_login":             "",
				"enabled":               false,
				"add_to_index":          false,
				"check_services":        []string{},
				"allow_short_report":    true,
				"allow_readonly_report": true,
				"allow_editable_report": false,
				"allow_pdf_report":      true,
				"has_password":          false,
				"env_overrides":         envOverrides,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load antiplagiat config"})
		return
	}

	c.JSON(http.StatusOK, buildAntiplagiatConfigResponse(cfg, envOverrides))
}

func (h *SubmissionHandler) SaveConfig(c *gin.Context) {
	var payload antiplagiatConfigPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	cfg, err := h.Service.SaveConfig(antiplagiat.ConfigInput{
		SiteURL:             payload.SiteURL,
		WSDLURL:             payload.WSDLURL,
		APILogin:            payload.APILogin,
		APIPassword:         payload.APIPassword,
		Enabled:             payload.Enabled,
		AddToIndex:          payload.AddToIndex,
		CheckServices:       payload.CheckServices,
		AllowShortReport:    payload.AllowShortReport,
		AllowReadonlyReport: payload.AllowReadonlyReport,
		AllowEditableReport: payload.AllowEditableReport,
		AllowPdfReport:      payload.AllowPdfReport,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to save antiplagiat config", "details": err.Error()})
		return
	}
	if resolved, loadErr := h.Service.LoadConfig(); loadErr == nil {
		cfg = resolved
	}

	c.JSON(http.StatusOK, buildAntiplagiatConfigResponse(cfg, h.Service.GetEnvOverrideState()))
}

func (h *SubmissionHandler) PingConfig(c *gin.Context) {
	result, err := h.Service.PingSavedConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to ping antiplagiat", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "result": result})
}

func (h *SubmissionHandler) ListCheckServices(c *gin.Context) {
	items, err := h.Service.GetAvailableCheckServices(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to load check services", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
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

func buildExternalUserID(userID, submissionID uint) string {
	value := fmt.Sprintf("u%d-s%d-%d", userID, submissionID, time.Now().UnixNano())
	if len(value) > 40 {
		return value[:40]
	}
	return value
}

func removeFileQuietly(path string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	err := os.Remove(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func buildAntiplagiatConfigResponse(cfg *models.AntiplagiatConfig, envOverrides antiplagiat.EnvOverrideState) gin.H {
	return gin.H{
		"site_url":              cfg.SiteURL,
		"wsdl_url":              cfg.WSDLURL,
		"api_login":             cfg.APILogin,
		"enabled":               cfg.Enabled,
		"add_to_index":          cfg.AddToIndex,
		"check_services":        parseCheckServicesCSV(cfg.CheckServices),
		"allow_short_report":    cfg.AllowShortReport,
		"allow_readonly_report": cfg.AllowReadonlyReport,
		"allow_editable_report": cfg.AllowEditableReport,
		"allow_pdf_report":      cfg.AllowPdfReport,
		"has_password":          strings.TrimSpace(cfg.APIPassword) != "",
		"env_overrides":         envOverrides,
	}
}

func parseCheckServicesCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		result = append(result, part)
	}
	return result
}
