package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ConferenceHandler struct {
	DB *gorm.DB
}

// Все строковые поля — указатели: частичный апдейт применяет только присланные,
// чтобы PUT {status:"live"} не затирал title/описание/контакты/стримы.
type updateConferencePayload struct {
	Title          *string                 `json:"title"`
	Description    *string                 `json:"description"`
	StartsAt       *time.Time              `json:"starts_at"`
	EndsAt         *time.Time              `json:"ends_at"`
	Status         models.ConferenceStatus `json:"status"`
	Format         *string                 `json:"format"`
	ProceedingsURL *string                 `json:"proceedings_url"`
	SupportEmail   *string                 `json:"support_email"`
	SupportPhone   *string                 `json:"support_phone"`
	VenueAddress   *string                 `json:"venue_address"`
	VenueMapURL    *string                 `json:"venue_map_url"`
	VenueTransport *string                 `json:"venue_transport"`
	FloorPlanURL   *string                 `json:"floor_plan_url"`
	LiveStreamURL  *string                 `json:"live_stream_url"`
	StreamVKURL    *string                 `json:"stream_vk_url"`
	StreamYouTube  *string                 `json:"stream_youtube_url"`
	StreamRutube   *string                 `json:"stream_rutube_url"`
}

func (h *ConferenceHandler) GetConference(c *gin.Context) {
	conf, err := h.getConferenceOrNil(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	if conf == nil {
		// Read-эндпоинт не создаёт строку: пока организатор не прошёл онбординг,
		// конференции нет. Фронт это переживает (Layout/OrgConsoleLayout ловят
		// ошибку и трактуют как conference=null → заглушка/редирект на онбординг).
		c.JSON(http.StatusNotFound, gin.H{"error": "conference not found"})
		return
	}
	c.JSON(http.StatusOK, conf)
}

func (h *ConferenceHandler) UpdateConference(c *gin.Context) {
	conf, err := h.getOrCreateConference(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	var payload updateConferencePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	setStr := func(dst *string, src *string) {
		if src != nil {
			*dst = strings.TrimSpace(*src)
		}
	}
	setStr(&conf.Title, payload.Title)
	setStr(&conf.Description, payload.Description)
	if payload.StartsAt != nil {
		conf.StartsAt = *payload.StartsAt
	}
	if payload.EndsAt != nil {
		conf.EndsAt = *payload.EndsAt
	}
	setStr(&conf.SupportEmail, payload.SupportEmail)
	setStr(&conf.SupportPhone, payload.SupportPhone)
	setStr(&conf.VenueAddress, payload.VenueAddress)
	setStr(&conf.VenueMapURL, payload.VenueMapURL)
	setStr(&conf.VenueTransport, payload.VenueTransport)
	if payload.FloorPlanURL != nil {
		// План рендерится как <img src> — допускаем только https-URL или относительный путь.
		// Протокол-относительные («//host/..») и «/\..» — это внешняя загрузка в обход
		// https-only намерения; явно отклоняем их.
		plan := strings.TrimSpace(*payload.FloorPlanURL)
		isRelPath := strings.HasPrefix(plan, "/") && !strings.HasPrefix(plan, "//") && !strings.HasPrefix(plan, "/\\")
		if plan != "" && (len(plan) > 500 || !(strings.HasPrefix(plan, "https://") || isRelPath)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "floor_plan_url must be an https:// URL or a relative path"})
			return
		}
		conf.FloorPlanURL = plan
	}
	setStr(&conf.LiveStreamURL, payload.LiveStreamURL)
	setStr(&conf.StreamVKURL, payload.StreamVKURL)
	setStr(&conf.StreamYouTube, payload.StreamYouTube)
	setStr(&conf.StreamRutube, payload.StreamRutube)
	setStr(&conf.ProceedingsURL, payload.ProceedingsURL)
	if payload.Format != nil {
		switch strings.TrimSpace(*payload.Format) {
		case "offline", "online", "hybrid":
			conf.Format = strings.TrimSpace(*payload.Format)
		case "":
			// пустое — не трогаем формат
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conference format"})
			return
		}
	}
	if payload.Status != "" {
		switch payload.Status {
		case models.ConferenceStatusDraft, models.ConferenceStatusLive, models.ConferenceStatusFinished:
			conf.Status = payload.Status
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conference status"})
			return
		}
	}

	if conf.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}

	if err := tenant.DB(c, h.DB).Save(conf).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update conference"})
		return
	}

	c.JSON(http.StatusOK, conf)
}

type createConferencePayload struct {
	Title        string     `json:"title"`
	Organization string     `json:"organization"`
	StartsAt     *time.Time `json:"starts_at"`
	EndsAt       *time.Time `json:"ends_at"`
	Format       string     `json:"format"`
}

// CreateConference — онбординг организатора: задаёт реальные данные конференции
// своего вуза и помечает её настроенной (onboarded). Работает по модели
// «одна конференция на вуз»: настраивает авто-созданную заглушку, а не плодит.
func (h *ConferenceHandler) CreateConference(c *gin.Context) {
	var payload createConferencePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	title := strings.TrimSpace(payload.Title)
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}

	conf, err := h.getOrCreateConference(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	conf.Title = title
	if payload.StartsAt != nil {
		conf.StartsAt = *payload.StartsAt
	}
	if payload.EndsAt != nil {
		conf.EndsAt = *payload.EndsAt
	}
	switch strings.TrimSpace(payload.Format) {
	case "offline", "online", "hybrid":
		conf.Format = strings.TrimSpace(payload.Format)
	}
	conf.Onboarded = true

	if err := tenant.DB(c, h.DB).Save(conf).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save conference"})
		return
	}

	// Имя вуза (бренд) обновляем заодно — оно из той же формы онбординга.
	if orgName := strings.TrimSpace(payload.Organization); orgName != "" {
		tenant.DB(c, h.DB).Model(&models.Organization{}).Where("id = ?", tenant.OrgID(c)).Update("display_name", orgName)
	}

	c.JSON(http.StatusCreated, conf)
}

type landingSectionView struct {
	ID          uint      `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Room        string    `json:"room"`
	StartAt     time.Time `json:"start_at"`
	EndAt       time.Time `json:"end_at"`
	TalksCount  int       `json:"talks_count"`
}

type landingStats struct {
	Sections     int64 `json:"sections"`
	Talks        int64 `json:"talks"`
	Participants int64 `json:"participants"`
	Cities       int64 `json:"cities"`
}

// GetLanding отдаёт публичные данные витрины лендинга (SCR-PUB-01) одним
// запросом: конференция, агрегаты (секции/доклады/участники/города), карточки
// секций с числом докладов и превью программы. Всё тенант-скоуплено.
func (h *ConferenceHandler) GetLanding(c *gin.Context) {
	conf, err := h.getConferenceOrNil(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}
	if conf == nil {
		// Публичный анонимный read: у тенанта ещё нет конференции — отдаём пустую
		// витрину без сайд-эффекта записи (fetchLanding на фронте это переживает).
		c.JSON(http.StatusOK, gin.H{
			"conference":      nil,
			"stats":           landingStats{},
			"sections":        []landingSectionView{},
			"program_preview": []landingSectionView{},
		})
		return
	}

	db := tenant.DB(c, h.DB)

	var sections []models.Section
	if err := db.Scopes(tenant.ByConference(c)).Order("start_at asc, id asc").Find(&sections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load sections"})
		return
	}

	// profiles — parent-scoped таблица: своего organization_id у неё НЕТ, поэтому
	// скоупим по родителю users.organization_id (а не tenant.ByOrg на самой profiles).
	// Считаем ТОЛЬКО участников (role=participant): сам организатор (org/admin) тоже
	// имеет профиль, но это не «заявка», иначе у новой конференции висит «1 заявка».
	orgID := tenant.OrgID(c)
	profileByOrg := func(q *gorm.DB) *gorm.DB {
		return q.Where("user_id IN (SELECT id FROM users WHERE organization_id = ? AND role = ?)", orgID, models.RoleParticipant)
	}

	// Число докладов по секциям: профили, сгруппированные по section_id (скоуп по org).
	type sectionCount struct {
		SectionID uint
		Cnt       int
	}
	var rows []sectionCount
	db.Model(&models.Profile{}).
		Scopes(profileByOrg).
		Select("section_id, count(*) as cnt").
		Where("section_id IS NOT NULL").
		Group("section_id").
		Scan(&rows)
	countBySection := make(map[uint]int, len(rows))
	for _, r := range rows {
		countBySection[r.SectionID] = r.Cnt
	}

	sectionViews := make([]landingSectionView, 0, len(sections))
	for _, s := range sections {
		sectionViews = append(sectionViews, landingSectionView{
			ID:          s.ID,
			Title:       s.Title,
			Description: s.Description,
			Room:        s.Room,
			StartAt:     s.StartAt,
			EndAt:       s.EndAt,
			TalksCount:  countBySection[s.ID],
		})
	}

	var stats landingStats
	db.Model(&models.Section{}).Scopes(tenant.ByConference(c)).Count(&stats.Sections)
	db.Model(&models.Profile{}).Scopes(profileByOrg).Count(&stats.Participants)
	db.Model(&models.Profile{}).Scopes(profileByOrg).Where("talk_title <> ''").Count(&stats.Talks)
	db.Model(&models.Profile{}).Scopes(profileByOrg).Where("city <> ''").Distinct("city").Count(&stats.Cities)

	preview := sectionViews
	if len(preview) > 5 {
		preview = preview[:5]
	}

	c.JSON(http.StatusOK, gin.H{
		"conference":      conf,
		"stats":           stats,
		"sections":        sectionViews,
		"program_preview": preview,
	})
}

// getConferenceOrNil читает конференцию тенанта БЕЗ сайд-эффектов: возвращает
// (nil, nil), если её ещё нет. Используется на read-путях (GetConference,
// GetLanding) — анонимный GET не должен мутировать БД. Создание заглушки —
// только на явном write-пути (см. getOrCreateConference).
func (h *ConferenceHandler) getConferenceOrNil(c *gin.Context) (*models.Conference, error) {
	var conf models.Conference
	if err := tenant.DB(c, h.DB).Scopes(tenant.ByOrg(c)).Order("id asc").First(&conf).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &conf, nil
}

// getOrCreateConference — write-путь: возвращает конференцию тенанта, создавая
// нейтральную заглушку, если её ещё нет. Зовётся только из CreateConference
// (онбординг) и UpdateConference, где мутация состояния ожидаема.
func (h *ConferenceHandler) getOrCreateConference(c *gin.Context) (*models.Conference, error) {
	conf, err := h.getConferenceOrNil(c)
	if err != nil {
		return nil, err
	}
	if conf != nil {
		return conf, nil
	}
	// Нейтральная заглушка: без хардкод-конференции и личного email. Реальные
	// данные задаёт организатор в онбординге (CreateConference → onboarded=true).
	stub := models.Conference{
		Title:     "Новая конференция",
		Status:    models.ConferenceStatusDraft,
		Onboarded: false,
		Format:    "hybrid",
	}
	org := tenant.OrgID(c)
	stub.OrganizationID = &org
	if err := tenant.DB(c, h.DB).Create(&stub).Error; err != nil {
		return nil, err
	}
	return &stub, nil
}
