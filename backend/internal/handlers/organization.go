package handlers

import (
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/objectstore"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxLogoFileSize = 2 << 20 // 2 MiB

// Разрешённые типы лого: растровые + svg. Ключ — нормализованный content-type.
var allowedLogoTypes = map[string]string{
	"image/png":     ".png",
	"image/jpeg":    ".jpg",
	"image/webp":    ".webp",
	"image/svg+xml": ".svg",
}

type OrganizationHandler struct {
	DB    *gorm.DB
	Store objectstore.Store
}

// orgBranding is the public per-tenant branding surface the frontend themes from.
type orgBranding struct {
	Slug         string `json:"slug"`
	DisplayName  string `json:"display_name"`
	LogoURL      string `json:"logo_url"`
	PrimaryColor string `json:"primary_color"`
	Theme        string `json:"theme"`
	Status       string `json:"status"`
	Plan         string `json:"plan"`
	CustomDomain string `json:"custom_domain"`
}

var hexColorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

// Кастомный домен: валидный hostname (минимум один уровень + TLD), строчные буквы.
var customDomainRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)

// validOrgThemes — направления оформления публичного сайта (см. EventShell).
var validOrgThemes = map[string]bool{"academic": true, "digital": true}

func brandingOf(org models.Organization) orgBranding {
	theme := org.Theme
	if !validOrgThemes[theme] {
		theme = "academic"
	}
	return orgBranding{
		Slug:         org.Slug,
		DisplayName:  org.DisplayName,
		LogoURL:      org.LogoURL,
		PrimaryColor: org.PrimaryColor,
		Theme:        theme,
		Status:       string(org.Status),
		Plan:         string(org.Plan),
		CustomDomain: org.CustomDomain,
	}
}

// SelectPlan — мок-оформление подписки: организатор выбирает платный тариф
// (без реального платёжного провайдера). Тариф снимает гейт на публикацию сайта.
func (h *OrganizationHandler) SelectPlan(c *gin.Context) {
	var payload struct {
		Plan string `json:"plan"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	plan := models.OrganizationPlan(strings.TrimSpace(payload.Plan))
	switch plan {
	case models.OrganizationPlanFree, models.OrganizationPlanKafedra, models.OrganizationPlanInstitut, models.OrganizationPlanUniversitet:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown plan"})
		return
	}

	if err := tenant.DB(c, h.DB).Model(&models.Organization{}).Where("id = ?", tenant.OrgID(c)).Update("plan", plan).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update plan"})
		return
	}

	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load organization"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}

// GetOrg returns the resolved tenant's branding. Public — the frontend needs it to
// theme before login. The organization id comes from the resolved scope (Host
// subdomain), never from user input, so a caller can only ever read its own org.
func (h *OrganizationHandler) GetOrg(c *gin.Context) {
	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}

// UpdateOrg updates the resolved tenant's branding (admin only). Only the
// resolved org is touched (id from scope), so an admin cannot edit another tenant.
func (h *OrganizationHandler) UpdateOrg(c *gin.Context) {
	var payload struct {
		DisplayName  *string `json:"display_name"`
		LogoURL      *string `json:"logo_url"`
		PrimaryColor *string `json:"primary_color"`
		Theme        *string `json:"theme"`
		CustomDomain *string `json:"custom_domain"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	updates := map[string]any{}
	if payload.DisplayName != nil {
		name := strings.TrimSpace(*payload.DisplayName)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "display_name cannot be empty"})
			return
		}
		updates["display_name"] = name
	}
	if payload.LogoURL != nil {
		logo := strings.TrimSpace(*payload.LogoURL)
		// Логотип рендерится как <img src> на публичном сайте — допускаем только
		// https-URL или относительный путь (не http/data/js-схемы), с лимитом длины.
		if logo != "" && (len(logo) > 500 || !(strings.HasPrefix(logo, "https://") || strings.HasPrefix(logo, "/"))) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "logo_url must be an https:// URL or a relative path"})
			return
		}
		updates["logo_url"] = logo
	}
	if payload.PrimaryColor != nil {
		color := strings.TrimSpace(*payload.PrimaryColor)
		if color != "" && !hexColorRe.MatchString(color) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "primary_color must be a #RRGGBB hex value"})
			return
		}
		updates["primary_color"] = color
	}
	if payload.Theme != nil {
		theme := strings.TrimSpace(*payload.Theme)
		if !validOrgThemes[theme] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "theme must be 'academic' or 'digital'"})
			return
		}
		updates["theme"] = theme
	}
	if payload.CustomDomain != nil {
		domain := strings.ToLower(strings.TrimSpace(*payload.CustomDomain))
		if domain != "" {
			// Пустое = очистить. Иначе валидный hostname...
			if len(domain) > 253 || !customDomainRe.MatchString(domain) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "custom_domain must be a valid domain like conf.university.ru"})
				return
			}
			// ...и не платформенная/системная зона: симметрично reservedSlugs у поддоменов,
			// чтобы тенант не присвоил kvorum.ru / *.kvorum.ru / app.* / admin.* и т.п.
			labels := strings.Split(domain, ".")
			if domain == "kvorum.ru" || strings.HasSuffix(domain, ".kvorum.ru") || reservedSlugs[labels[0]] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "this domain is reserved by the platform"})
				return
			}
			// NB: глобальная уникальность custom_domain пока НЕ enforced (колонка не unique и
			// домен ещё не используется в резолве хоста) — добавить при включении резолва по домену.
		}
		updates["custom_domain"] = domain
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	res := tenant.DB(c, h.DB).Model(&models.Organization{}).Where("id = ?", tenant.OrgID(c)).Updates(updates)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update organization"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}

	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load organization"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}

// UploadLogo — загрузка файла логотипа (owner-only). Файл кладётся в objectstore,
// LogoURL переключается на публичный /api/orgs/:slug/logo?v=... (cache-bust), а
// внешний URL-логотип (если был) перекрывается. Отдаёт обновлённый брендинг.
func (h *OrganizationHandler) UploadLogo(c *gin.Context) {
	if h.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file storage is not configured"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	if file.Size <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty file"})
		return
	}
	if file.Size > maxLogoFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is too large", "details": "maximum logo size is 2 MB"})
		return
	}
	contentType := normalizeLogoType(file)
	if _, ok := allowedLogoTypes[contentType]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported image type", "details": "allowed: PNG, JPEG, WEBP, SVG"})
		return
	}
	// Растровые типы реально декодируем — не доверяем заголовку/расширению клиента.
	// (SVG — текстовый; защищён строгим CSP+sandbox при отдаче. WEBP-декодер не в stdlib.)
	if contentType == "image/png" || contentType == "image/jpeg" {
		probe, perr := file.Open()
		if perr == nil {
			_, _, derr := image.DecodeConfig(probe)
			probe.Close()
			if derr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "файл не распознан как изображение"})
				return
			}
		}
	}

	var org models.Organization
	if err := tenant.DB(c, h.DB).First(&org, tenant.OrgID(c)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open uploaded file"})
		return
	}
	defer src.Close()

	// Один логотип на тенант — стабильный ключ (перезапись при повторной загрузке).
	objectKey := fmt.Sprintf("org-logos/%d", org.ID)
	if err := h.Store.Put(c.Request.Context(), objectKey, src, file.Size, contentType); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to save logo"})
		return
	}

	publicURL := fmt.Sprintf("/api/orgs/%s/logo?v=%d", org.Slug, time.Now().Unix())
	if err := tenant.DB(c, h.DB).Model(&models.Organization{}).Where("id = ?", org.ID).Updates(map[string]any{
		"logo_object_key":   objectKey,
		"logo_content_type": contentType,
		"logo_url":          publicURL,
	}).Error; err != nil {
		_ = h.Store.Delete(c.Request.Context(), objectKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save logo"})
		return
	}

	if err := tenant.DB(c, h.DB).First(&org, org.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load organization"})
		return
	}
	c.JSON(http.StatusOK, brandingOf(org))
}

// GetOrgLogo — публичная раздача загруженного лого по slug вуза. Без авторизации
// (логотип показывается на публичном сайте и в auth). CSP отключает скрипты/сеть,
// чтобы SVG-лого нельзя было использовать как вектор XSS при прямом открытии.
func (h *OrganizationHandler) GetOrgLogo(c *gin.Context) {
	if h.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file storage is not configured"})
		return
	}
	slug := strings.ToLower(strings.TrimSpace(c.Param("slug")))
	if slug == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "logo not found"})
		return
	}
	var org models.Organization
	if err := h.DB.Where("slug = ?", slug).First(&org).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "logo not found"})
		return
	}
	if strings.TrimSpace(org.LogoObjectKey) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "logo not found"})
		return
	}
	obj, err := h.Store.Get(c.Request.Context(), org.LogoObjectKey)
	if err != nil {
		if errors.Is(err, objectstore.ErrObjectNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "logo not found"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to load logo"})
		return
	}
	defer obj.Body.Close()

	// Тип берём из сохранённого при загрузке (filesystem-стор пере-сниффит и ломает SVG);
	// фолбэк — то, что вернул стор.
	contentType := strings.TrimSpace(org.LogoContentType)
	if contentType == "" {
		contentType = obj.ContentType
	}
	if contentType != "" {
		c.Header("Content-Type", contentType)
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	c.Header("Cache-Control", "public, max-age=300")
	if obj.Size > 0 {
		c.Header("Content-Length", strconv.FormatInt(obj.Size, 10))
	}
	_, _ = io.Copy(c.Writer, obj.Body)
}

// normalizeLogoType определяет content-type загруженного лого: по заголовку, с
// фолбэком на расширение имени файла (некоторые клиенты не шлют тип для svg).
func normalizeLogoType(file *multipart.FileHeader) string {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(file.Header.Get("Content-Type"), ";")[0]))
	if _, ok := allowedLogoTypes[ct]; ok {
		return ct
	}
	switch strings.ToLower(filepath.Ext(file.Filename)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	}
	return ct
}
