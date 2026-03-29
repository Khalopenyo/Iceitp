package antiplagiat

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"conferenceplatforma/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrConfigNotFound     = errors.New("antiplagiat is not configured")
	ErrConfigDisabled     = errors.New("antiplagiat integration is disabled")
	ErrSubmissionNotReady = errors.New("submission is not ready")
	ErrPDFNotAllowed      = errors.New("pdf reports are disabled in settings")
)

const (
	defaultSubmissionTimeout = 12 * time.Minute
	defaultPDFTimeout        = 12 * time.Minute
	defaultWorkerLease       = 90 * time.Second
	defaultWorkerIdleSleep   = 2 * time.Second
	defaultWorkerMinDelay    = 5 * time.Second
	configRetryDelay         = 1 * time.Minute
)

type ConfigInput struct {
	SiteURL             string
	WSDLURL             string
	APILogin            string
	APIPassword         string
	Enabled             bool
	AddToIndex          bool
	CheckServices       []string
	AllowShortReport    bool
	AllowReadonlyReport bool
	AllowEditableReport bool
	AllowPdfReport      bool
}

type EnvOverrideState struct {
	SiteURL     bool `json:"site_url"`
	WSDLURL     bool `json:"wsdl_url"`
	APILogin    bool `json:"api_login"`
	APIPassword bool `json:"api_password"`
	Enabled     bool `json:"enabled"`
}

type envOverrides struct {
	SiteURL     string
	WSDLURL     string
	APILogin    string
	APIPassword string
	Enabled     *bool
}

type WorkerOptions struct {
	WorkerID      string
	LeaseDuration time.Duration
	IdleSleep     time.Duration
}

type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ResumePending() {
	now := time.Now()
	submissionDeadline := now.Add(defaultSubmissionTimeout)
	pdfDeadline := now.Add(defaultPDFTimeout)
	pendingStatuses := []models.SubmissionStatus{
		models.SubmissionStatusUploaded,
		models.SubmissionStatusChecking,
	}

	_ = s.DB.Model(&models.ArticleSubmission{}).
		Where("status IN ? AND next_poll_at IS NULL", pendingStatuses).
		Update("next_poll_at", now).Error
	_ = s.DB.Model(&models.ArticleSubmission{}).
		Where("status IN ? AND processing_deadline_at IS NULL", pendingStatuses).
		Update("processing_deadline_at", submissionDeadline).Error
	_ = s.DB.Model(&models.ArticleSubmission{}).
		Where("pdf_status = ? AND next_poll_at IS NULL", models.PDFStatusInProgress).
		Update("next_poll_at", now).Error
	_ = s.DB.Model(&models.ArticleSubmission{}).
		Where("pdf_status = ? AND pdf_deadline_at IS NULL", models.PDFStatusInProgress).
		Update("pdf_deadline_at", pdfDeadline).Error
}

func (s *Service) QueueSubmission(submissionID uint) {
	var submission models.ArticleSubmission
	if err := s.DB.First(&submission, submissionID).Error; err != nil {
		return
	}

	now := time.Now()
	updates := map[string]any{
		"next_poll_at": now,
	}
	if submission.Status == models.SubmissionStatusUploaded || submission.Status == models.SubmissionStatusChecking {
		if submission.ProcessingDeadlineAt == nil {
			updates["processing_deadline_at"] = now.Add(defaultSubmissionTimeout)
		}
	}
	if submission.PDFStatus == models.PDFStatusInProgress {
		if submission.PDFDeadlineAt == nil {
			updates["pdf_deadline_at"] = now.Add(defaultPDFTimeout)
		}
	}
	_ = s.DB.Model(&models.ArticleSubmission{}).Where("id = ?", submissionID).Updates(updates).Error
}

func (s *Service) LoadConfig() (*models.AntiplagiatConfig, error) {
	cfg, err := s.loadStoredConfig()
	if err != nil {
		if !errors.Is(err, ErrConfigNotFound) {
			return nil, err
		}
		cfg = &models.AntiplagiatConfig{}
	}
	applyEnvOverrides(cfg)
	if !hasResolvedConfig(*cfg) {
		return nil, ErrConfigNotFound
	}
	return cfg, nil
}

func (s *Service) loadStoredConfig() (*models.AntiplagiatConfig, error) {
	var cfg models.AntiplagiatConfig
	if err := s.DB.Order("id asc").First(&cfg).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrConfigNotFound
		}
		return nil, err
	}
	return &cfg, nil
}

func (s *Service) SaveConfig(input ConfigInput) (*models.AntiplagiatConfig, error) {
	cfg, err := s.loadStoredConfig()
	if err != nil {
		if !errors.Is(err, ErrConfigNotFound) {
			return nil, err
		}
		cfg = &models.AntiplagiatConfig{}
	}

	cfg.SiteURL = strings.TrimSpace(input.SiteURL)
	cfg.WSDLURL = strings.TrimSpace(input.WSDLURL)
	cfg.APILogin = strings.TrimSpace(input.APILogin)
	cfg.Enabled = input.Enabled
	cfg.AddToIndex = input.AddToIndex
	cfg.CheckServices = joinCheckServices(input.CheckServices)
	cfg.AllowShortReport = input.AllowShortReport
	cfg.AllowReadonlyReport = input.AllowReadonlyReport
	cfg.AllowEditableReport = input.AllowEditableReport
	cfg.AllowPdfReport = input.AllowPdfReport
	if strings.TrimSpace(input.APIPassword) != "" {
		cfg.APIPassword = input.APIPassword
	}

	resolved := *cfg
	applyEnvOverrides(&resolved)
	if resolved.SiteURL == "" || resolved.WSDLURL == "" || resolved.APILogin == "" {
		return nil, fmt.Errorf("site url, wsdl url and api login are required")
	}
	if strings.TrimSpace(resolved.APIPassword) == "" {
		return nil, fmt.Errorf("api password is required")
	}

	if cfg.ID == 0 {
		if err := s.DB.Create(cfg).Error; err != nil {
			return nil, err
		}
		return cfg, nil
	}
	if err := s.DB.Save(cfg).Error; err != nil {
		return nil, err
	}
	return cfg, nil
}

func (s *Service) GetAvailableCheckServices(ctx context.Context) ([]CheckServiceInfo, error) {
	cfg, err := s.LoadConfig()
	if err != nil {
		return nil, err
	}
	client := NewClient(clientConfigFromModel(*cfg))
	return client.GetCheckServices(ctx)
}

func (s *Service) GetEnvOverrideState() EnvOverrideState {
	overrides := currentEnvOverrides()
	return EnvOverrideState{
		SiteURL:     overrides.SiteURL != "",
		WSDLURL:     overrides.WSDLURL != "",
		APILogin:    overrides.APILogin != "",
		APIPassword: overrides.APIPassword != "",
		Enabled:     overrides.Enabled != nil,
	}
}

func (s *Service) PingSavedConfig(ctx context.Context) (string, error) {
	cfg, err := s.LoadConfig()
	if err != nil {
		return "", err
	}
	client := NewClient(clientConfigFromModel(*cfg))
	return client.Ping(ctx)
}

func (s *Service) RefreshSubmission(submissionID uint) (*models.ArticleSubmission, error) {
	submission, cfg, err := s.loadSubmissionAndConfig(submissionID)
	if err != nil {
		return nil, err
	}
	if submission.AntiplagiatDocID == nil || *submission.AntiplagiatDocID == 0 {
		return submission, nil
	}

	client := NewClient(clientConfigFromModel(*cfg))
	status, err := client.GetCheckStatus(context.Background(), *submission.AntiplagiatDocID)
	if err != nil {
		return nil, err
	}
	if err := s.applyCheckStatus(submissionID, status); err != nil {
		return nil, err
	}

	if err := s.DB.First(submission, submissionID).Error; err != nil {
		return nil, err
	}
	return submission, nil
}

func (s *Service) RetrySubmission(submissionID uint) (*models.ArticleSubmission, error) {
	var submission models.ArticleSubmission
	if err := s.DB.First(&submission, submissionID).Error; err != nil {
		return nil, err
	}

	now := time.Now()
	updates := map[string]any{
		"status":                 models.SubmissionStatusUploaded,
		"error_details":          "",
		"external_user_id":       buildRetryExternalUserID(submission.UserID, submission.ID),
		"antiplagiat_doc_id":     nil,
		"antiplagiat_doc_ext":    "",
		"report_num":             nil,
		"estimated_wait_time":    nil,
		"score":                  0,
		"plagiarism_score":       0,
		"legal_score":            0,
		"self_cite_score":        0,
		"originality_score":      0,
		"is_suspicious":          false,
		"report_url":             "",
		"readonly_report_url":    "",
		"short_report_url":       "",
		"summary_report_url":     "",
		"pdf_status":             models.PDFStatusNone,
		"pdf_url":                "",
		"checked_at":             nil,
		"next_poll_at":           now,
		"worker_id":              "",
		"worker_lease_until":     nil,
		"processing_deadline_at": now.Add(defaultSubmissionTimeout),
		"pdf_deadline_at":        nil,
	}
	if err := s.DB.Model(&submission).Updates(updates).Error; err != nil {
		return nil, err
	}

	if err := s.DB.First(&submission, submissionID).Error; err != nil {
		return nil, err
	}
	return &submission, nil
}

func (s *Service) RequestPDF(submissionID uint) (*models.ArticleSubmission, error) {
	submission, cfg, err := s.loadSubmissionAndConfig(submissionID)
	if err != nil {
		return nil, err
	}
	if !cfg.AllowPdfReport {
		return nil, ErrPDFNotAllowed
	}
	if submission.Status != models.SubmissionStatusReady || submission.AntiplagiatDocID == nil || submission.ReportNum == nil {
		return nil, ErrSubmissionNotReady
	}
	now := time.Now()
	updates := map[string]any{
		"pdf_status":          models.PDFStatusInProgress,
		"pdf_url":             "",
		"error_details":       "",
		"estimated_wait_time": nil,
		"next_poll_at":        now,
		"worker_id":           "",
		"worker_lease_until":  nil,
		"pdf_deadline_at":     now.Add(defaultPDFTimeout),
	}
	if err := s.DB.Model(submission).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := s.DB.First(submission, submissionID).Error; err != nil {
		return nil, err
	}
	return submission, nil
}

func DefaultWorkerOptions() WorkerOptions {
	return WorkerOptions{
		LeaseDuration: defaultWorkerLease,
		IdleSleep:     defaultWorkerIdleSleep,
	}
}

func (s *Service) RunWorker(ctx context.Context, opts WorkerOptions) error {
	if opts.LeaseDuration <= 0 {
		opts.LeaseDuration = defaultWorkerLease
	}
	if opts.IdleSleep <= 0 {
		opts.IdleSleep = defaultWorkerIdleSleep
	}
	if strings.TrimSpace(opts.WorkerID) == "" {
		opts.WorkerID = buildWorkerID()
	}

	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		submission, err := s.claimNextSubmission(opts.WorkerID, opts.LeaseDuration)
		if err != nil {
			log.Printf("antiplagiat worker %s: claim failed: %v", opts.WorkerID, err)
			if !sleepWithContext(ctx, opts.IdleSleep) {
				return nil
			}
			continue
		}
		if submission == nil {
			if !sleepWithContext(ctx, opts.IdleSleep) {
				return nil
			}
			continue
		}

		if err := s.processClaimedSubmission(ctx, submission, opts.WorkerID); err != nil {
			log.Printf("antiplagiat worker %s: submission %d failed: %v", opts.WorkerID, submission.ID, err)
		}
	}
}

func (s *Service) claimNextSubmission(workerID string, leaseDuration time.Duration) (*models.ArticleSubmission, error) {
	now := time.Now()
	pendingStatuses := []models.SubmissionStatus{
		models.SubmissionStatusUploaded,
		models.SubmissionStatusChecking,
	}

	tx := s.DB.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	var submission models.ArticleSubmission
	result := tx.
		Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
		Where("(status IN ? OR pdf_status = ?) AND (next_poll_at IS NULL OR next_poll_at <= ?) AND (worker_lease_until IS NULL OR worker_lease_until <= ?)",
			pendingStatuses,
			models.PDFStatusInProgress,
			now,
			now).
		Order("next_poll_at ASC NULLS FIRST").
		Order("updated_at ASC").
		Limit(1).
		Find(&submission)
	if result.Error != nil {
		tx.Rollback()
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		tx.Rollback()
		return nil, nil
	}

	leaseUntil := now.Add(leaseDuration)
	if err := tx.Model(&models.ArticleSubmission{}).
		Where("id = ?", submission.ID).
		Updates(map[string]any{
			"worker_id":          workerID,
			"worker_lease_until": leaseUntil,
		}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	submission.WorkerID = workerID
	submission.WorkerLeaseUntil = &leaseUntil
	return &submission, nil
}

func (s *Service) processClaimedSubmission(ctx context.Context, submission *models.ArticleSubmission, workerID string) error {
	cfg, err := s.loadActiveConfig()
	if err != nil {
		switch {
		case errors.Is(err, ErrConfigDisabled), errors.Is(err, ErrConfigNotFound):
			return s.releaseWithDelay(submission.ID, workerID, configRetryDelay)
		default:
			return s.releaseWithDelay(submission.ID, workerID, configRetryDelay)
		}
	}

	var user models.User
	if err := s.DB.Preload("Profile").First(&user, submission.UserID).Error; err != nil {
		s.markSubmissionFailed(submission.ID, fmt.Sprintf("failed to load user: %v", err))
		return nil
	}

	client := NewClient(clientConfigFromModel(*cfg))
	if submission.AntiplagiatDocID == nil || *submission.AntiplagiatDocID == 0 {
		if deadlineExceeded(submission.ProcessingDeadlineAt) {
			s.markSubmissionFailed(submission.ID, "timed out while waiting for antiplagiat result")
			return nil
		}
		if err := s.uploadAndStartCheck(ctx, client, cfg, submission, &user); err != nil {
			s.markSubmissionFailed(submission.ID, err.Error())
			return nil
		}
		return s.releaseWithDelay(submission.ID, workerID, defaultWorkerMinDelay)
	}

	if submission.Status != models.SubmissionStatusReady {
		if deadlineExceeded(submission.ProcessingDeadlineAt) {
			s.markSubmissionFailed(submission.ID, "timed out while waiting for antiplagiat result")
			return nil
		}
		status, err := client.GetCheckStatus(ctx, *submission.AntiplagiatDocID)
		if err != nil {
			s.markSubmissionFailed(submission.ID, err.Error())
			return nil
		}
		if err := s.applyCheckStatus(submission.ID, status); err != nil {
			s.markSubmissionFailed(submission.ID, err.Error())
			return nil
		}

		switch status.Status {
		case "InProgress", "None":
			return s.releaseWithDelay(submission.ID, workerID, nextDelayFromEstimate(status.EstimatedWaitTime))
		case "Failed":
			s.markSubmissionFailed(submission.ID, status.FailDetails)
			return nil
		case "Ready":
			if err := s.DB.First(submission, submission.ID).Error; err != nil {
				return s.releaseWithDelay(submission.ID, workerID, defaultWorkerMinDelay)
			}
		default:
			return s.releaseWithDelay(submission.ID, workerID, defaultWorkerMinDelay)
		}
	}

	if submission.Status == models.SubmissionStatusReady && submission.PDFStatus == models.PDFStatusInProgress {
		if submission.ReportNum == nil || submission.AntiplagiatDocID == nil {
			s.markPDFFailed(submission.ID, "pdf export cannot start without report number")
			return nil
		}
		if deadlineExceeded(submission.PDFDeadlineAt) {
			s.markPDFFailed(submission.ID, "timed out while waiting for pdf export")
			return nil
		}
		result, err := client.ExportReportToPDF(ctx, *submission.AntiplagiatDocID, *submission.ReportNum, true)
		if err != nil {
			s.markPDFFailed(submission.ID, err.Error())
			return nil
		}
		if err := s.applyPDFStatus(submission.ID, result); err != nil {
			s.markPDFFailed(submission.ID, err.Error())
			return nil
		}
		switch result.Status {
		case "InProgress":
			return s.releaseWithDelay(submission.ID, workerID, nextDelayFromEstimate(result.EstimatedWaitTime))
		case "Ready":
			return s.clearClaim(submission.ID, workerID, map[string]any{
				"next_poll_at":        nil,
				"pdf_deadline_at":     nil,
				"estimated_wait_time": nil,
			})
		default:
			s.markPDFFailed(submission.ID, "pdf export failed")
			return nil
		}
	}

	return s.clearClaim(submission.ID, workerID, map[string]any{
		"next_poll_at":           nil,
		"processing_deadline_at": nil,
		"estimated_wait_time":    nil,
	})
}

func (s *Service) uploadAndStartCheck(ctx context.Context, client *Client, cfg *models.AntiplagiatConfig, submission *models.ArticleSubmission, user *models.User) error {
	data, err := os.ReadFile(submission.FilePath)
	if err != nil {
		return fmt.Errorf("failed to read uploaded file: %w", err)
	}

	author := strings.TrimSpace(user.Profile.FullName)
	if author == "" {
		author = strings.TrimSpace(user.Email)
	}

	result, err := client.UploadDocument(ctx, UploadParams{
		FileName:       submission.FileName,
		FileType:       submission.FileType,
		Data:           data,
		ExternalUserID: submission.ExternalUserID,
		Title:          submission.Title,
		Author:         author,
		AddToIndex:     cfg.AddToIndex,
	})
	if err != nil {
		return err
	}
	if result.Reason != "" && result.Reason != "NoError" {
		fail := result.Reason
		if result.FailDetails != "" {
			fail = result.FailDetails
		}
		return errors.New(fail)
	}
	if result.DocumentID == 0 {
		return fmt.Errorf("upload completed without antiplagiat document id")
	}
	checkServices := splitCheckServices(cfg.CheckServices)
	if len(checkServices) == 0 {
		availableServices, svcErr := client.GetCheckServices(ctx)
		if svcErr == nil {
			checkServices = checkServiceCodes(availableServices)
		}
	}
	if err := client.StartCheck(ctx, result.DocumentID, checkServices); err != nil {
		return err
	}

	updates := map[string]any{
		"status":                 models.SubmissionStatusChecking,
		"error_details":          "",
		"antiplagiat_doc_id":     result.DocumentID,
		"antiplagiat_doc_ext":    "",
		"next_poll_at":           time.Now().Add(defaultWorkerMinDelay),
		"processing_deadline_at": ensureDeadline(submission.ProcessingDeadlineAt, defaultSubmissionTimeout),
	}
	return s.DB.Model(submission).Updates(updates).Error
}

func (s *Service) applyCheckStatus(submissionID uint, status *CheckStatus) error {
	updates := map[string]any{
		"estimated_wait_time": nil,
	}
	switch status.Status {
	case "InProgress", "None":
		updates["status"] = models.SubmissionStatusChecking
		updates["error_details"] = ""
		if status.EstimatedWaitTime != nil {
			updates["estimated_wait_time"] = *status.EstimatedWaitTime
		}
	case "Ready":
		now := time.Now()
		updates["status"] = models.SubmissionStatusReady
		updates["error_details"] = ""
		updates["checked_at"] = &now
		if status.Summary != nil {
			updates["report_num"] = status.Summary.ReportNum
			updates["score"] = status.Summary.Score
			updates["plagiarism_score"] = status.Summary.Plagiarism
			updates["legal_score"] = status.Summary.Legal
			updates["self_cite_score"] = status.Summary.SelfCite
			updates["originality_score"] = status.Summary.Originality
			updates["is_suspicious"] = status.Summary.IsSuspicious
			updates["report_url"] = status.Summary.ReportURL
			updates["readonly_report_url"] = status.Summary.ReadonlyReportURL
			updates["short_report_url"] = status.Summary.ShortReportURL
			updates["summary_report_url"] = status.Summary.SummaryReportURL
		}
	case "Failed":
		updates["status"] = models.SubmissionStatusFailed
		updates["error_details"] = status.FailDetails
	default:
		updates["status"] = models.SubmissionStatusChecking
		if status.EstimatedWaitTime != nil {
			updates["estimated_wait_time"] = *status.EstimatedWaitTime
		}
	}
	return s.DB.Model(&models.ArticleSubmission{}).Where("id = ?", submissionID).Updates(updates).Error
}

func (s *Service) applyPDFStatus(submissionID uint, result *PDFExportResult) error {
	updates := map[string]any{}
	switch result.Status {
	case "Ready":
		updates["pdf_status"] = models.PDFStatusReady
		updates["pdf_url"] = result.DownloadLink
		updates["estimated_wait_time"] = nil
	case "InProgress":
		updates["pdf_status"] = models.PDFStatusInProgress
		if result.EstimatedWaitTime != nil {
			updates["estimated_wait_time"] = *result.EstimatedWaitTime
		}
	case "Failed":
		updates["pdf_status"] = models.PDFStatusFailed
	default:
		updates["pdf_status"] = models.PDFStatusFailed
	}
	return s.DB.Model(&models.ArticleSubmission{}).Where("id = ?", submissionID).Updates(updates).Error
}

func (s *Service) markSubmissionFailed(submissionID uint, message string) {
	updates := map[string]any{
		"status":                 models.SubmissionStatusFailed,
		"error_details":          strings.TrimSpace(message),
		"next_poll_at":           nil,
		"worker_id":              "",
		"worker_lease_until":     nil,
		"processing_deadline_at": nil,
		"estimated_wait_time":    nil,
	}
	_ = s.DB.Model(&models.ArticleSubmission{}).Where("id = ?", submissionID).Updates(updates).Error
}

func (s *Service) markPDFFailed(submissionID uint, message string) {
	updates := map[string]any{
		"pdf_status":          models.PDFStatusFailed,
		"error_details":       strings.TrimSpace(message),
		"estimated_wait_time": nil,
		"next_poll_at":        nil,
		"worker_id":           "",
		"worker_lease_until":  nil,
		"pdf_deadline_at":     nil,
	}
	_ = s.DB.Model(&models.ArticleSubmission{}).Where("id = ?", submissionID).Updates(updates).Error
}

func (s *Service) loadSubmissionAndConfig(submissionID uint) (*models.ArticleSubmission, *models.AntiplagiatConfig, error) {
	var submission models.ArticleSubmission
	if err := s.DB.First(&submission, submissionID).Error; err != nil {
		return nil, nil, err
	}
	cfg, err := s.loadActiveConfig()
	if err != nil {
		return nil, nil, err
	}
	return &submission, cfg, nil
}

func (s *Service) loadActiveConfig() (*models.AntiplagiatConfig, error) {
	cfg, err := s.LoadConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled {
		return nil, ErrConfigDisabled
	}
	return cfg, nil
}

func (s *Service) releaseWithDelay(submissionID uint, workerID string, delay time.Duration) error {
	if delay <= 0 {
		delay = defaultWorkerMinDelay
	}
	nextPollAt := time.Now().Add(delay)
	return s.clearClaim(submissionID, workerID, map[string]any{
		"next_poll_at": nextPollAt,
	})
}

func (s *Service) clearClaim(submissionID uint, workerID string, updates map[string]any) error {
	if updates == nil {
		updates = map[string]any{}
	}
	updates["worker_id"] = ""
	updates["worker_lease_until"] = nil
	return s.DB.Model(&models.ArticleSubmission{}).
		Where("id = ? AND worker_id = ?", submissionID, workerID).
		Updates(updates).Error
}

func clientConfigFromModel(cfg models.AntiplagiatConfig) ClientConfig {
	return ClientConfig{
		SiteURL:  cfg.SiteURL,
		WSDLURL:  cfg.WSDLURL,
		Login:    cfg.APILogin,
		Password: cfg.APIPassword,
	}
}

func currentEnvOverrides() envOverrides {
	return envOverrides{
		SiteURL:     strings.TrimSpace(os.Getenv("ANTIPLAGIAT_SITE_URL")),
		WSDLURL:     strings.TrimSpace(os.Getenv("ANTIPLAGIAT_WSDL_URL")),
		APILogin:    strings.TrimSpace(os.Getenv("ANTIPLAGIAT_API_LOGIN")),
		APIPassword: strings.TrimSpace(os.Getenv("ANTIPLAGIAT_API_PASSWORD")),
		Enabled:     envBoolPtr("ANTIPLAGIAT_ENABLED"),
	}
}

func applyEnvOverrides(cfg *models.AntiplagiatConfig) {
	overrides := currentEnvOverrides()
	if overrides.SiteURL != "" {
		cfg.SiteURL = overrides.SiteURL
	}
	if overrides.WSDLURL != "" {
		cfg.WSDLURL = overrides.WSDLURL
	}
	if overrides.APILogin != "" {
		cfg.APILogin = overrides.APILogin
	}
	if overrides.APIPassword != "" {
		cfg.APIPassword = overrides.APIPassword
	}
	if overrides.Enabled != nil {
		cfg.Enabled = *overrides.Enabled
	}
}

func hasResolvedConfig(cfg models.AntiplagiatConfig) bool {
	return strings.TrimSpace(cfg.SiteURL) != "" &&
		strings.TrimSpace(cfg.WSDLURL) != "" &&
		strings.TrimSpace(cfg.APILogin) != "" &&
		strings.TrimSpace(cfg.APIPassword) != ""
}

func splitCheckServices(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return normalizeCheckServices(strings.Split(value, ","))
}

func joinCheckServices(values []string) string {
	return strings.Join(normalizeCheckServices(values), ",")
}

func checkServiceCodes(items []CheckServiceInfo) []string {
	if len(items) == 0 {
		return nil
	}
	codes := make([]string, 0, len(items))
	for _, item := range items {
		code := strings.TrimSpace(item.Code)
		if code == "" {
			continue
		}
		codes = append(codes, code)
	}
	return normalizeCheckServices(codes)
}

func envBoolPtr(key string) *bool {
	value, ok := os.LookupEnv(key)
	if !ok {
		return nil
	}
	value = strings.TrimSpace(strings.ToLower(value))
	switch value {
	case "1", "true", "yes", "on":
		result := true
		return &result
	case "0", "false", "no", "off":
		result := false
		return &result
	default:
		return nil
	}
}

func buildWorkerID() string {
	host, err := os.Hostname()
	if err != nil || strings.TrimSpace(host) == "" {
		host = "worker"
	}
	return fmt.Sprintf("%s-%d", host, os.Getpid())
}

func sleepWithContext(ctx context.Context, duration time.Duration) bool {
	if duration <= 0 {
		duration = defaultWorkerIdleSleep
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func nextDelayFromEstimate(estimate *int) time.Duration {
	if estimate != nil && *estimate > 0 && *estimate <= 60 {
		return time.Duration(*estimate) * time.Second
	}
	return defaultWorkerMinDelay
}

func ensureDeadline(current *time.Time, duration time.Duration) time.Time {
	if current != nil && !current.IsZero() {
		return *current
	}
	return time.Now().Add(duration)
}

func deadlineExceeded(deadline *time.Time) bool {
	if deadline == nil || deadline.IsZero() {
		return false
	}
	return time.Now().After(*deadline)
}

func StoragePath(userID uint, fileName string) (string, error) {
	cleanName := sanitizeFileName(fileName)
	targetDir := filepath.Join("storage", "submissions", fmt.Sprintf("%d", userID))
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(targetDir, fmt.Sprintf("%d-%s", time.Now().UnixNano(), cleanName)), nil
}

func sanitizeFileName(fileName string) string {
	fileName = strings.TrimSpace(filepath.Base(fileName))
	fileName = strings.ReplaceAll(fileName, " ", "-")
	fileName = strings.ReplaceAll(fileName, "/", "-")
	fileName = strings.ReplaceAll(fileName, "\\", "-")
	if fileName == "" || fileName == "." {
		return "document.txt"
	}
	return fileName
}

func buildRetryExternalUserID(userID, submissionID uint) string {
	value := fmt.Sprintf("u%d-s%d-%d", userID, submissionID, time.Now().UnixNano())
	if len(value) > 40 {
		return value[:40]
	}
	return value
}
