package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"errors"
	"fmt"
	"image/png"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jung-kurt/gofpdf"
	qrcode "github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

type DocumentHandler struct {
	DB         *gorm.DB
	JWTSecret  string
	AppBaseURL string
}

const officialProgramPendingText = "Официальная программа еще не утверждена."

const (
	documentStatusAvailable     = "available"
	documentStatusBlocked       = "blocked"
	documentStatusNotApplicable = "not_applicable"
)

type programPDFView struct {
	Mode          string
	PersonalEntry *authoritativeProgramEntry
	Groups        []authoritativeProgramSectionGroup
	StatusMessage string
}

type documentStatusItem struct {
	Status    string `json:"status"`
	Available bool   `json:"available"`
	Message   string `json:"message,omitempty"`
	Filename  string `json:"filename,omitempty"`
	URL       string `json:"url,omitempty"`
}

type documentStatusResponse struct {
	CurrentUserType  models.UserType         `json:"current_user_type"`
	ConferenceID     uint                    `json:"conference_id"`
	ConferenceTitle  string                  `json:"conference_title"`
	ConferenceStatus models.ConferenceStatus `json:"conference_status"`
	PersonalProgram  documentStatusItem      `json:"personal_program"`
	FullProgram      documentStatusItem      `json:"full_program"`
	Badge            documentStatusItem      `json:"badge"`
	Certificate      documentStatusItem      `json:"certificate"`
	Proceedings      documentStatusItem      `json:"proceedings"`
}

type documentRuntimeContext struct {
	User   models.User
	Conf   models.Conference
	Status *documentStatusResponse
}

// loadProgramPDFView keeps ProgramPDF sourced from authoritative ProgramAssignment records.
func loadProgramPDFView(db *gorm.DB, userID uint, rawMode string) (*programPDFView, error) {
	view := &programPDFView{Mode: "personal"}
	if strings.EqualFold(strings.TrimSpace(rawMode), "full") {
		view.Mode = "full"
	}

	entries, err := loadAuthoritativeProgramEntries(db, authoritativeProgramFilter{})
	if view.Mode == "personal" {
		entries, err = loadAuthoritativeProgramEntries(db, authoritativeProgramFilter{UserID: &userID})
	}
	if err != nil {
		return nil, err
	}

	if view.Mode == "personal" {
		if len(entries) == 0 {
			view.StatusMessage = officialProgramPendingText
			return view, nil
		}

		entry := entries[0]
		view.PersonalEntry = &entry
		return view, nil
	}

	view.Groups = groupAuthoritativeEntriesBySection(entries)
	if len(view.Groups) == 0 {
		view.StatusMessage = officialProgramPendingText
	}
	return view, nil
}

func availableDocumentStatus(filename, message string) documentStatusItem {
	return documentStatusItem{
		Status:    documentStatusAvailable,
		Available: true,
		Message:   message,
		Filename:  filename,
	}
}

func blockedDocumentStatus(filename, message string) documentStatusItem {
	return documentStatusItem{
		Status:    documentStatusBlocked,
		Available: false,
		Message:   message,
		Filename:  filename,
	}
}

func notApplicableDocumentStatus(filename, message string) documentStatusItem {
	return documentStatusItem{
		Status:    documentStatusNotApplicable,
		Available: false,
		Message:   message,
		Filename:  filename,
	}
}

func loadDocumentStatus(db *gorm.DB, user models.User, conf models.Conference) (*documentStatusResponse, error) {
	scheduleView, err := loadParticipantScheduleView(db, user)
	if err != nil {
		return nil, err
	}

	personalView, err := loadProgramPDFView(db, user.ID, "personal")
	if err != nil {
		return nil, err
	}
	hasStaticFullProgram := fullProgramPDFPath() != ""
	var fullView *programPDFView
	if !hasStaticFullProgram {
		fullView, err = loadProgramPDFView(db, user.ID, "full")
		if err != nil {
			return nil, err
		}
	}

	effectiveUserType := user.UserType
	if scheduleView != nil && scheduleView.UserType != "" {
		effectiveUserType = scheduleView.UserType
	}

	status := &documentStatusResponse{
		CurrentUserType:  effectiveUserType,
		ConferenceID:     conf.ID,
		ConferenceTitle:  conf.Title,
		ConferenceStatus: conf.Status,
		PersonalProgram:  availableDocumentStatus("program-personal.pdf", "Персональная программа готова к скачиванию."),
		FullProgram:      availableDocumentStatus("program-full.pdf", "Полная программа готова к скачиванию."),
		Badge:            availableDocumentStatus("badge.pdf", "QR-бейдж готов к скачиванию."),
		Certificate:      availableDocumentStatus("certificate.pdf", "Сертификат готов к скачиванию."),
		Proceedings:      availableDocumentStatus("", "Сборник трудов доступен для открытия."),
	}

	if personalView.StatusMessage != "" || personalView.PersonalEntry == nil {
		status.PersonalProgram = blockedDocumentStatus("program-personal.pdf", officialProgramPendingText)
	}

	if !hasStaticFullProgram && (fullView.StatusMessage != "" || len(fullView.Groups) == 0) {
		status.FullProgram = blockedDocumentStatus("program-full.pdf", officialProgramPendingText)
	}

	if effectiveUserType == models.UserTypeOnline {
		status.Badge = notApplicableDocumentStatus("badge.pdf", "QR-бейдж нужен только офлайн-участникам для регистрации на площадке.")
	} else if !user.BadgeIssued {
		status.Badge = blockedDocumentStatus("badge.pdf", "Бейдж станет доступен после подготовки в админке.")
	}

	proceedingsURL := strings.TrimSpace(conf.ProceedingsURL)
	if conf.Status != models.ConferenceStatusFinished {
		status.Proceedings = blockedDocumentStatus("", "Сборник будет доступен после завершения конференции.")
	} else if proceedingsURL == "" {
		status.Proceedings = blockedDocumentStatus("", "Оргкомитет еще не загрузил сборник трудов.")
	} else {
		status.Proceedings = availableDocumentStatus("", "Сборник трудов доступен для открытия.")
		status.Proceedings.URL = proceedingsURL
	}

	return status, nil
}

func (h *DocumentHandler) loadDocumentRuntimeContext(userID uint) (*documentRuntimeContext, error) {
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		return nil, err
	}

	conf, err := h.getConference()
	if err != nil {
		return nil, err
	}

	status, err := loadDocumentStatus(h.DB, user, *conf)
	if err != nil {
		return nil, err
	}

	return &documentRuntimeContext{
		User:   user,
		Conf:   *conf,
		Status: status,
	}, nil
}

func writeBlockedDocumentError(c *gin.Context, item documentStatusItem) {
	c.JSON(http.StatusConflict, gin.H{"error": item.Message})
}

func (h *DocumentHandler) DocumentStatus(c *gin.Context) {
	context, err := h.loadDocumentRuntimeContext(c.GetUint("user_id"))
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load document status"})
		}
		return
	}

	c.JSON(http.StatusOK, context.Status)
}

func (h *DocumentHandler) ProgramPDF(c *gin.Context) {
	context, err := h.loadDocumentRuntimeContext(c.GetUint("user_id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	mode := strings.ToLower(strings.TrimSpace(c.DefaultQuery("type", "personal")))
	switch mode {
	case "full":
		if !context.Status.FullProgram.Available {
			writeBlockedDocumentError(c, context.Status.FullProgram)
			return
		}
		if staticPath := fullProgramPDFPath(); staticPath != "" {
			writePDFFile(c, staticPath, "program-full.pdf")
			return
		}
	default:
		if !context.Status.PersonalProgram.Available {
			writeBlockedDocumentError(c, context.Status.PersonalProgram)
			return
		}
	}

	view, err := loadProgramPDFView(h.DB, context.User.ID, mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load authoritative program"})
		return
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	fontFamily := configureDocumentFont(pdf)
	pdf.SetTitle("Program", false)
	pdf.AddPage()
	pdf.SetFont(fontFamily, "", 15)
	pdf.MultiCell(0, 8, normalizeText(context.Conf.Title), "", "L", false)
	pdf.Ln(2)
	pdf.SetFont(fontFamily, "", 11)
	pdf.Cell(0, 7, fmt.Sprintf("Тип программы: %s", map[bool]string{true: "Полная", false: "Персональная"}[view.Mode == "full"]))
	pdf.Ln(10)
	if view.Mode == "personal" {
		pdf.Cell(0, 7, fmt.Sprintf("Участник: %s", normalizeText(context.User.Profile.FullName)))
		pdf.Ln(8)
	}
	if view.Mode == "personal" {
		entry := *view.PersonalEntry
		pdf.SetFont(fontFamily, "", 12)
		pdf.MultiCell(0, 7, normalizeText(fallbackSectionTitle(entry.SectionTitle, valueOrZero(entry.SectionID))), "", "L", false)
		pdf.SetFont(fontFamily, "", 10)
		room := entry.RoomName
		if room == "" {
			room = "Без аудитории"
		}
		pdf.MultiCell(
			0,
			6,
			fmt.Sprintf("Локация: %s | Время: %s", normalizeText(room), formatProgramTimeRange(entry.StartsAt, entry.EndsAt)),
			"",
			"L",
			false,
		)
		line := normalizeText(context.User.Profile.FullName)
		if entry.TalkTitle != "" {
			line = fmt.Sprintf("%s — %s", line, normalizeText(entry.TalkTitle))
		}
		pdf.MultiCell(0, 6, line, "", "L", false)
		if entry.JoinURL != "" {
			pdf.MultiCell(0, 6, fmt.Sprintf("Ссылка для подключения: %s", entry.JoinURL), "", "L", false)
		}
		writePDF(c, pdf, "program.pdf")
		return
	}

	for _, group := range view.Groups {
		pdf.SetFont(fontFamily, "", 12)
		pdf.MultiCell(0, 7, normalizeText(group.SectionTitle), "", "L", false)
		pdf.SetFont(fontFamily, "", 10)
		for i, entry := range group.Entries {
			room := entry.RoomName
			if room == "" {
				room = "Без аудитории"
			}
			line := fmt.Sprintf(
				"%d. %s | %s | %s",
				i+1,
				formatProgramTimeRange(entry.StartsAt, entry.EndsAt),
				normalizeText(room),
				normalizeText(entry.FullName),
			)
			if entry.TalkTitle != "" {
				line = fmt.Sprintf("%s — %s", line, normalizeText(entry.TalkTitle))
			}
			pdf.MultiCell(0, 6, line, "", "L", false)
		}
		pdf.Ln(4)
	}
	writePDF(c, pdf, "program.pdf")
}

func (h *DocumentHandler) CertificatePDF(c *gin.Context) {
	context, err := h.loadDocumentRuntimeContext(c.GetUint("user_id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	if !context.Status.Certificate.Available {
		writeBlockedDocumentError(c, context.Status.Certificate)
		return
	}

	cert, err := h.ensureCertificate(context.Conf.ID, context.User.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue certificate"})
		return
	}

	talkTitle := context.User.Profile.TalkTitle
	var sectionTitle string
	personalView, err := loadProgramPDFView(h.DB, context.User.ID, "personal")
	if err == nil && personalView.PersonalEntry != nil {
		if personalView.PersonalEntry.TalkTitle != "" {
			talkTitle = personalView.PersonalEntry.TalkTitle
		}
		sectionTitle = fallbackSectionTitle(personalView.PersonalEntry.SectionTitle, valueOrZero(personalView.PersonalEntry.SectionID))
	}
	if sectionTitle == "" && context.User.Profile.SectionID != nil {
		var sec models.Section
		if err := h.DB.Select("id", "title").First(&sec, *context.User.Profile.SectionID).Error; err == nil {
			sectionTitle = sec.Title
		}
	}

	pdf := gofpdf.New("L", "mm", "A4", "")
	fontFamily := configureDocumentFont(pdf)
	pdf.SetTitle("Certificate", false)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetMargins(0, 0, 0)
	pdf.AddPage()

	if !renderCertificateTemplate(pdf, fontFamily, normalizeText(context.User.Profile.FullName), cert) {
		pdf.SetMargins(18, 20, 18)
		pdf.SetFont(fontFamily, "B", 26)
		pdf.Cell(0, 20, "СЕРТИФИКАТ УЧАСТНИКА")
		pdf.Ln(18)
		pdf.SetFont(fontFamily, "", 16)
		pdf.MultiCell(
			0,
			12,
			fmt.Sprintf("%s принял(а) участие в конференции \"%s\".", normalizeText(context.User.Profile.FullName), normalizeText(context.Conf.Title)),
			"",
			"L",
			false,
		)
		pdf.Ln(12)
		pdf.SetFont(fontFamily, "", 12)
		if talkTitle != "" {
			pdf.MultiCell(0, 8, fmt.Sprintf("Тема доклада: %s", normalizeText(talkTitle)), "", "L", false)
		}
		if sectionTitle != "" {
			pdf.MultiCell(0, 8, fmt.Sprintf("Секция: %s", normalizeText(sectionTitle)), "", "L", false)
		}
		pdf.MultiCell(0, 8, fmt.Sprintf("Номер сертификата: %s", cert.Number), "", "L", false)
		pdf.MultiCell(0, 8, fmt.Sprintf("Дата выдачи: %s", cert.IssuedAt.Format("02.01.2006")), "", "L", false)
	}
	writePDF(c, pdf, "certificate.pdf")
}

func (h *DocumentHandler) BadgePDF(c *gin.Context) {
	context, err := h.loadDocumentRuntimeContext(c.GetUint("user_id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	if !context.Status.Badge.Available {
		writeBlockedDocumentError(c, context.Status.Badge)
		return
	}

	h.writeBadgePDF(c, context)
}

func (h *DocumentHandler) AdminBadgePDF(c *gin.Context) {
	userID := c.Param("id")
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	context, err := h.loadDocumentRuntimeContext(user.ID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	if context.Status.CurrentUserType == models.UserTypeOnline {
		writeBlockedDocumentError(c, notApplicableDocumentStatus("badge.pdf", "QR-бейдж нужен только офлайн-участникам для регистрации на площадке."))
		return
	}

	h.writeBadgePDF(c, context)
}

func (h *DocumentHandler) writeBadgePDF(c *gin.Context, context *documentRuntimeContext) {

	token, err := h.generateBadgeToken(context.User.ID, context.Conf.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate badge token"})
		return
	}

	templatePath := badgeTemplatePath()
	var pdf *gofpdf.Fpdf
	var fontFamily string
	if templatePath != "" {
		width, height := badgeTemplatePageSize(templatePath)
		pdf = gofpdf.NewCustom(&gofpdf.InitType{
			UnitStr: "mm",
			Size:    gofpdf.SizeType{Wd: width, Ht: height},
		})
		fontFamily = configureDocumentFont(pdf)
	} else {
		pdf = gofpdf.New("P", "mm", "A6", "")
		fontFamily = configureDocumentFont(pdf)
	}
	pdf.SetTitle("Badge", false)
	pdf.AddPage()
	qr, err := qrcode.Encode(h.badgeScanURL(token), qrcode.Medium, 120)
	if err == nil && renderBadgeTemplate(pdf, templatePath, qr) {
		writePDF(c, pdf, "badge.pdf")
		return
	}

	pdf.SetFont(fontFamily, "", 16)
	pdf.MultiCell(0, 8, normalizeText(context.Conf.Title), "", "L", false)
	pdf.Ln(12)
	pdf.SetFont(fontFamily, "", 12)
	pdf.Cell(0, 8, normalizeText(context.User.Profile.FullName))
	pdf.Ln(6)
	pdf.Cell(0, 8, context.User.Email)
	pdf.Ln(12)
	if err == nil {
		pageWidth, _ := pdf.GetPageSize()
		qrSize := 36.0
		qrX := (pageWidth - qrSize) / 2
		qrY := pdf.GetY()
		pdf.RegisterImageOptionsReader("qr", gofpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(qr))
		pdf.ImageOptions("qr", qrX, qrY, qrSize, qrSize, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	}
	writePDF(c, pdf, "badge.pdf")
}

func (h *DocumentHandler) Proceedings(c *gin.Context) {
	context, err := h.loadDocumentRuntimeContext(c.GetUint("user_id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	if !context.Status.Proceedings.Available {
		if context.Conf.Status == models.ConferenceStatusFinished && strings.TrimSpace(context.Conf.ProceedingsURL) == "" {
			c.JSON(http.StatusNotFound, gin.H{"error": context.Status.Proceedings.Message})
			return
		}
		writeBlockedDocumentError(c, context.Status.Proceedings)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"url":   strings.TrimSpace(context.Conf.ProceedingsURL),
		"title": context.Conf.Title,
	})
}

func (h *DocumentHandler) VerifyCertificate(c *gin.Context) {
	number := strings.TrimSpace(c.Param("number"))
	if number == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "certificate number is required"})
		return
	}

	var cert models.Certificate
	if err := h.DB.Where("number = ?", number).First(&cert).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
		return
	}

	var user models.User
	if err := h.DB.Preload("Profile").First(&user, cert.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "certificate owner not found"})
		return
	}

	var conf models.Conference
	if err := h.DB.First(&conf, cert.ConferenceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "conference not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"number":    cert.Number,
		"issued_at": cert.IssuedAt,
		"user": gin.H{
			"id":        user.ID,
			"full_name": user.Profile.FullName,
		},
		"conference": gin.H{
			"id":    conf.ID,
			"title": conf.Title,
		},
	})
}

func (h *DocumentHandler) getConference() (*models.Conference, error) {
	var conf models.Conference
	if err := h.DB.Order("id asc").First(&conf).Error; err != nil {
		return nil, err
	}
	return &conf, nil
}

func (h *DocumentHandler) generateBadgeToken(userID, conferenceID uint) (string, error) {
	claims := jwt.MapClaims{
		"type":          "badge",
		"user_id":       userID,
		"conference_id": conferenceID,
		"iat":           time.Now().Unix(),
		"exp":           time.Now().Add(72 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.JWTSecret))
}

func (h *DocumentHandler) badgeScanURL(token string) string {
	base := strings.TrimSpace(h.AppBaseURL)
	if base == "" {
		return "/badge/" + url.PathEscape(token)
	}
	return strings.TrimSuffix(base, "/") + "/badge/" + url.PathEscape(token)
}

func (h *DocumentHandler) ensureCertificate(conferenceID, userID uint) (*models.Certificate, error) {
	var cert models.Certificate
	if err := h.DB.Where("conference_id = ? AND user_id = ?", conferenceID, userID).First(&cert).Error; err == nil {
		return &cert, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		// Re-check inside transaction to avoid duplicate creation.
		if err := tx.Where("conference_id = ? AND user_id = ?", conferenceID, userID).First(&cert).Error; err == nil {
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		now := time.Now()
		cert = models.Certificate{
			ConferenceID: conferenceID,
			UserID:       userID,
			Number:       fmt.Sprintf("TMP-%d-%d-%d", conferenceID, userID, now.UnixNano()),
			IssuedAt:     now,
		}
		if err := tx.Create(&cert).Error; err != nil {
			return err
		}
		cert.Number = fmt.Sprintf("CERT-%d-%06d", now.Year(), cert.ID)
		return tx.Model(&cert).Update("number", cert.Number).Error
	})
	if err != nil {
		return nil, err
	}

	return &cert, nil
}

func configureDocumentFont(pdf *gofpdf.Fpdf) string {
	fontPath := firstExistingFile([]string{
		"backend/assets/fonts/Arial.ttf",
		"assets/fonts/Arial.ttf",
		"backend/assets/fonts/DejaVuSans.ttf",
		"assets/fonts/DejaVuSans.ttf",
		"/System/Library/Fonts/Supplemental/Arial.ttf",
		"/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
		"/Library/Fonts/Arial Unicode.ttf",
		"/Library/Fonts/Arial.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
	})
	if fontPath == "" {
		return "Helvetica"
	}

	fontBytes, err := os.ReadFile(fontPath)
	if err != nil {
		return "Helvetica"
	}
	pdf.AddUTF8FontFromBytes("DocSans", "", fontBytes)
	if pdf.Err() {
		pdf.ClearError()
		return "Helvetica"
	}

	boldPath := firstExistingFile([]string{
		"backend/assets/fonts/Arial-Bold.ttf",
		"assets/fonts/Arial-Bold.ttf",
		"backend/assets/fonts/DejaVuSans-Bold.ttf",
		"assets/fonts/DejaVuSans-Bold.ttf",
		"/System/Library/Fonts/Supplemental/Arial Bold.ttf",
		"/Library/Fonts/Arial Bold.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
		"/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
	})
	if boldPath != "" {
		if boldBytes, err := os.ReadFile(boldPath); err == nil {
			pdf.AddUTF8FontFromBytes("DocSans", "B", boldBytes)
			if pdf.Err() {
				pdf.ClearError()
			}
		}
	}
	return "DocSans"
}

func certificateTemplatePath() string {
	return firstExistingFile([]string{
		"backend/assets/certificates/certificate-template.png",
		"assets/certificates/certificate-template.png",
		"/app/assets/certificates/certificate-template.png",
	})
}

func fullProgramPDFPath() string {
	return firstExistingFile([]string{
		"backend/assets/certificates/programa.pdf",
		"assets/certificates/programa.pdf",
		"/app/assets/certificates/programa.pdf",
	})
}

func badgeTemplatePath() string {
	return firstExistingFile([]string{
		"backend/assets/badges/badge-template.png",
		"assets/badges/badge-template.png",
		"/app/assets/badges/badge-template.png",
	})
}

func badgeTemplatePageSize(templatePath string) (float64, float64) {
	const defaultWidth = 105.0
	const defaultHeight = 148.0

	file, err := os.Open(templatePath)
	if err != nil {
		return defaultWidth, defaultHeight
	}
	defer file.Close()

	cfg, err := png.DecodeConfig(file)
	if err != nil || cfg.Width == 0 || cfg.Height == 0 {
		return defaultWidth, defaultHeight
	}

	height := defaultWidth * float64(cfg.Height) / float64(cfg.Width)
	return defaultWidth, height
}

func fitTextToWidth(pdf *gofpdf.Fpdf, family, style, text string, maxWidth, maxSize, minSize float64) float64 {
	size := maxSize
	for size > minSize {
		pdf.SetFont(family, style, size)
		if pdf.GetStringWidth(text) <= maxWidth {
			return size
		}
		size -= 1
	}
	return minSize
}

func renderCertificateTemplate(pdf *gofpdf.Fpdf, fontFamily, fullName string, cert *models.Certificate) bool {
	templatePath := certificateTemplatePath()
	if templatePath == "" {
		return false
	}

	pdf.ImageOptions(
		templatePath,
		0,
		0,
		297,
		210,
		false,
		gofpdf.ImageOptions{ImageType: "PNG", ReadDpi: true},
		0,
		"",
	)

	pdf.SetTextColor(33, 61, 135)
	nameFontSize := fitTextToWidth(pdf, fontFamily, "B", fullName, 195, 30, 16)
	pdf.SetFont(fontFamily, "B", nameFontSize)
	pdf.SetXY(51, 92)
	pdf.CellFormat(195, 14, fullName, "", 0, "C", false, 0, "")

	pdf.SetTextColor(76, 82, 96)
	pdf.SetFont(fontFamily, "", 8.5)
	pdf.SetXY(24, 188)
	pdf.CellFormat(90, 6, fmt.Sprintf("№ %s", cert.Number), "", 0, "L", false, 0, "")
	pdf.SetXY(183, 188)
	pdf.CellFormat(90, 6, fmt.Sprintf("Дата выдачи: %s", cert.IssuedAt.Format("02.01.2006")), "", 0, "R", false, 0, "")

	return true
}

func renderBadgeTemplate(pdf *gofpdf.Fpdf, templatePath string, qr []byte) bool {
	if templatePath == "" || len(qr) == 0 {
		return false
	}

	pageWidth, pageHeight := pdf.GetPageSize()
	pdf.ImageOptions(
		templatePath,
		0,
		0,
		pageWidth,
		pageHeight,
		false,
		gofpdf.ImageOptions{ImageType: "PNG", ReadDpi: true},
		0,
		"",
	)

	qrSize := minFloat(pageWidth, pageHeight) * 0.42
	qrX := (pageWidth - qrSize) / 2
	qrY := (pageHeight - qrSize) / 2
	pdf.RegisterImageOptionsReader("badge-qr", gofpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(qr))
	pdf.ImageOptions("badge-qr", qrX, qrY, qrSize, qrSize, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	return true
}

func firstExistingFile(paths []string) string {
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func valueOrZero(value *uint) uint {
	if value == nil {
		return 0
	}
	return *value
}

func normalizeText(input string) string {
	text := strings.TrimSpace(input)
	if text == "" {
		return text
	}
	// Typical mojibake from UTF-8 text decoded as Latin-1 starts with these markers.
	if !strings.ContainsAny(text, "ÐÑ") {
		return text
	}

	buf := make([]byte, 0, len(text))
	for _, r := range text {
		b, ok := runeToByteCP1252(r)
		if !ok {
			return text
		}
		buf = append(buf, b)
	}
	if !utf8.Valid(buf) {
		return text
	}

	decoded := string(buf)
	if !containsCyrillic(decoded) {
		return text
	}
	return decoded
}

func runeToByteCP1252(r rune) (byte, bool) {
	if r >= 0 && r <= 255 {
		return byte(r), true
	}
	switch r {
	case 0x20AC:
		return 0x80, true
	case 0x201A:
		return 0x82, true
	case 0x0192:
		return 0x83, true
	case 0x201E:
		return 0x84, true
	case 0x2026:
		return 0x85, true
	case 0x2020:
		return 0x86, true
	case 0x2021:
		return 0x87, true
	case 0x02C6:
		return 0x88, true
	case 0x2030:
		return 0x89, true
	case 0x0160:
		return 0x8A, true
	case 0x2039:
		return 0x8B, true
	case 0x0152:
		return 0x8C, true
	case 0x017D:
		return 0x8E, true
	case 0x2018:
		return 0x91, true
	case 0x2019:
		return 0x92, true
	case 0x201C:
		return 0x93, true
	case 0x201D:
		return 0x94, true
	case 0x2022:
		return 0x95, true
	case 0x2013:
		return 0x96, true
	case 0x2014:
		return 0x97, true
	case 0x02DC:
		return 0x98, true
	case 0x2122:
		return 0x99, true
	case 0x0161:
		return 0x9A, true
	case 0x203A:
		return 0x9B, true
	case 0x0153:
		return 0x9C, true
	case 0x017E:
		return 0x9E, true
	case 0x0178:
		return 0x9F, true
	default:
		return 0, false
	}
}

func containsCyrillic(s string) bool {
	for _, r := range s {
		if unicode.In(r, unicode.Cyrillic) {
			return true
		}
	}
	return false
}

func writePDF(c *gin.Context, pdf *gofpdf.Fpdf, filename string) {
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate pdf"})
		return
	}
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Data(http.StatusOK, "application/pdf", buf.Bytes())
}

func writePDFFile(c *gin.Context, path, filename string) {
	content, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read pdf"})
		return
	}
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Data(http.StatusOK, "application/pdf", content)
}
