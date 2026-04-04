package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"errors"
	"fmt"
	"net/http"
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
	DB        *gorm.DB
	JWTSecret string
}

const officialProgramPendingText = "Официальная программа еще не утверждена."

type programPDFView struct {
	Mode          string
	PersonalEntry *authoritativeProgramEntry
	Groups        []authoritativeProgramSectionGroup
	StatusMessage string
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

func (h *DocumentHandler) ProgramPDF(c *gin.Context) {
	userID := c.GetUint("user_id")
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	conf, err := h.getConference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	view, err := loadProgramPDFView(h.DB, userID, c.DefaultQuery("type", "personal"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load authoritative program"})
		return
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	fontFamily := configureDocumentFont(pdf)
	pdf.SetTitle("Program", false)
	pdf.AddPage()
	pdf.SetFont(fontFamily, "", 15)
	pdf.MultiCell(0, 8, normalizeText(conf.Title), "", "L", false)
	pdf.Ln(2)
	pdf.SetFont(fontFamily, "", 11)
	pdf.Cell(0, 7, fmt.Sprintf("Тип программы: %s", map[bool]string{true: "Полная", false: "Персональная"}[view.Mode == "full"]))
	pdf.Ln(10)
	if view.Mode == "personal" {
		pdf.Cell(0, 7, fmt.Sprintf("Участник: %s", normalizeText(user.Profile.FullName)))
		pdf.Ln(8)
	}
	if view.Mode == "personal" {
		if view.StatusMessage != "" || view.PersonalEntry == nil {
			pdf.Cell(0, 7, officialProgramPendingText)
			writePDF(c, pdf, "program.pdf")
			return
		}

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
		line := normalizeText(user.Profile.FullName)
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

	if view.StatusMessage != "" || len(view.Groups) == 0 {
		pdf.Cell(0, 7, officialProgramPendingText)
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
	userID := c.GetUint("user_id")
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	conf, err := h.getConference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	var checkIn models.CheckIn
	if err := h.DB.Where("conference_id = ? AND user_id = ?", conf.ID, userID).First(&checkIn).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "сертификат доступен после check-in"})
		return
	}

	cert, err := h.ensureCertificate(conf.ID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue certificate"})
		return
	}

	var sectionTitle string
	if user.Profile.SectionID != nil {
		var sec models.Section
		if err := h.DB.Select("id", "title").First(&sec, *user.Profile.SectionID).Error; err == nil {
			sectionTitle = sec.Title
		}
	}

	pdf := gofpdf.New("L", "mm", "A4", "")
	fontFamily := configureDocumentFont(pdf)
	pdf.SetTitle("Certificate", false)
	pdf.AddPage()
	pdf.SetFont(fontFamily, "", 26)
	pdf.Cell(0, 20, "СЕРТИФИКАТ УЧАСТНИКА")
	pdf.Ln(18)
	pdf.SetFont(fontFamily, "", 16)
	pdf.MultiCell(
		0,
		12,
		fmt.Sprintf("%s принял(а) участие в конференции \"%s\".", normalizeText(user.Profile.FullName), normalizeText(conf.Title)),
		"",
		"L",
		false,
	)
	pdf.Ln(12)
	pdf.SetFont(fontFamily, "", 12)
	if user.Profile.TalkTitle != "" {
		pdf.MultiCell(0, 8, fmt.Sprintf("Тема доклада: %s", normalizeText(user.Profile.TalkTitle)), "", "L", false)
	}
	if sectionTitle != "" {
		pdf.MultiCell(0, 8, fmt.Sprintf("Секция: %s", normalizeText(sectionTitle)), "", "L", false)
	}
	pdf.MultiCell(0, 8, fmt.Sprintf("Номер сертификата: %s", cert.Number), "", "L", false)
	pdf.MultiCell(0, 8, fmt.Sprintf("Дата выдачи: %s", cert.IssuedAt.Format("02.01.2006")), "", "L", false)
	writePDF(c, pdf, "certificate.pdf")
}

func (h *DocumentHandler) BadgePDF(c *gin.Context) {
	userID := c.GetUint("user_id")
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	conf, err := h.getConference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	token, err := h.generateBadgeToken(user.ID, conf.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate badge token"})
		return
	}

	pdf := gofpdf.New("P", "mm", "A6", "")
	fontFamily := configureDocumentFont(pdf)
	pdf.SetTitle("Badge", false)
	pdf.AddPage()
	pdf.SetFont(fontFamily, "", 16)
	pdf.MultiCell(0, 8, normalizeText(conf.Title), "", "L", false)
	pdf.Ln(12)
	pdf.SetFont(fontFamily, "", 12)
	pdf.Cell(0, 8, normalizeText(user.Profile.FullName))
	pdf.Ln(6)
	pdf.Cell(0, 8, user.Email)
	pdf.Ln(8)
	qr, err := qrcode.Encode(token, qrcode.Medium, 120)
	if err == nil {
		pdf.RegisterImageOptionsReader("qr", gofpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(qr))
		pdf.ImageOptions("qr", 10, 40, 30, 30, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	}
	writePDF(c, pdf, "badge.pdf")
}

func (h *DocumentHandler) Proceedings(c *gin.Context) {
	conf, err := h.getConference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	if conf.Status != models.ConferenceStatusFinished {
		c.JSON(http.StatusForbidden, gin.H{"error": "сборник будет доступен после завершения конференции"})
		return
	}
	if strings.TrimSpace(conf.ProceedingsURL) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "сборник пока не загружен"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"url":   strings.TrimSpace(conf.ProceedingsURL),
		"title": conf.Title,
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
	return "DocSans"
}

func firstExistingFile(paths []string) string {
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
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
