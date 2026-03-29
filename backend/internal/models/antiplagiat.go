package models

import "time"

type SubmissionStatus string

type PDFStatus string

const (
	SubmissionStatusUploaded SubmissionStatus = "uploaded"
	SubmissionStatusChecking SubmissionStatus = "checking"
	SubmissionStatusReady    SubmissionStatus = "ready"
	SubmissionStatusFailed   SubmissionStatus = "failed"
)

const (
	PDFStatusNone       PDFStatus = "none"
	PDFStatusInProgress PDFStatus = "in_progress"
	PDFStatusReady      PDFStatus = "ready"
	PDFStatusFailed     PDFStatus = "failed"
)

type AntiplagiatConfig struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	SiteURL             string    `gorm:"not null" json:"site_url"`
	WSDLURL             string    `gorm:"not null" json:"wsdl_url"`
	APILogin            string    `gorm:"not null" json:"api_login"`
	APIPassword         string    `gorm:"not null" json:"-"`
	Enabled             bool      `gorm:"not null;default:true" json:"enabled"`
	AddToIndex          bool      `gorm:"not null;default:false" json:"add_to_index"`
	CheckServices       string    `gorm:"type:text" json:"-"`
	AllowShortReport    bool      `gorm:"not null;default:true" json:"allow_short_report"`
	AllowReadonlyReport bool      `gorm:"not null;default:true" json:"allow_readonly_report"`
	AllowEditableReport bool      `gorm:"not null;default:false" json:"allow_editable_report"`
	AllowPdfReport      bool      `gorm:"not null;default:true" json:"allow_pdf_report"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type ArticleSubmission struct {
	ID                   uint             `gorm:"primaryKey" json:"id"`
	UserID               uint             `gorm:"index;not null" json:"user_id"`
	Title                string           `gorm:"not null" json:"title"`
	FileName             string           `gorm:"not null" json:"file_name"`
	FileType             string           `gorm:"not null" json:"file_type"`
	FilePath             string           `gorm:"not null" json:"-"`
	FileSize             int64            `gorm:"not null" json:"file_size"`
	Status               SubmissionStatus `gorm:"type:varchar(20);not null;default:'uploaded';index" json:"status"`
	ErrorDetails         string           `gorm:"type:text" json:"error_details"`
	ExternalUserID       string           `gorm:"size:40;index" json:"external_user_id"`
	AntiplagiatDocID     *int             `gorm:"index" json:"antiplagiat_doc_id"`
	AntiplagiatDocExt    string           `json:"antiplagiat_doc_external"`
	ReportNum            *int             `json:"report_num"`
	EstimatedWaitTime    *int             `json:"estimated_wait_time"`
	Score                float64          `json:"score"`
	PlagiarismScore      float64          `json:"plagiarism_score"`
	LegalScore           float64          `json:"legal_score"`
	SelfCiteScore        float64          `json:"self_cite_score"`
	OriginalityScore     float64          `json:"originality_score"`
	IsSuspicious         bool             `json:"is_suspicious"`
	ReportURL            string           `json:"report_url"`
	ReadonlyReportURL    string           `json:"readonly_report_url"`
	ShortReportURL       string           `json:"short_report_url"`
	SummaryReportURL     string           `json:"summary_report_url"`
	PDFStatus            PDFStatus        `gorm:"type:varchar(20);not null;default:'none'" json:"pdf_status"`
	PDFURL               string           `json:"pdf_url"`
	NextPollAt           *time.Time       `gorm:"index" json:"-"`
	WorkerID             string           `gorm:"size:120;index" json:"-"`
	WorkerLeaseUntil     *time.Time       `gorm:"index" json:"-"`
	ProcessingDeadlineAt *time.Time       `gorm:"index" json:"-"`
	PDFDeadlineAt        *time.Time       `gorm:"index" json:"-"`
	CheckedAt            *time.Time       `json:"checked_at"`
	CreatedAt            time.Time        `json:"created_at"`
	UpdatedAt            time.Time        `json:"updated_at"`
}
