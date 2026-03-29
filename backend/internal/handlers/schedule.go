package handlers

import (
	"conferenceplatforma/internal/models"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type ScheduleHandler struct {
	DB *gorm.DB
}

type SectionWithParticipants struct {
	Section      models.Section    `json:"section"`
	Participants []ParticipantInfo `json:"participants"`
}

type ParticipantInfo struct {
	UserID    uint   `json:"user_id"`
	FullName  string `json:"full_name"`
	TalkTitle string `json:"talk_title"`
}

func (h *ScheduleHandler) SeedDemo(c *gin.Context) {
	type demoUser struct {
		Email     string
		FullName  string
		SectionID uint
		TalkTitle string
	}

	var sectionCount int64
	h.DB.Model(&models.Section{}).Count(&sectionCount)
	if sectionCount == 0 {
		sections := []models.Section{
			{Title: "Экономика, право и управление в условиях цифровой трансформации", Description: "Сессия 1 конференции.", Room: "Хайпарк"},
			{Title: "Современное общество в цифровую эпоху", Description: "Сессия 2 конференции.", Room: "Актовый зал"},
			{Title: "Лингвистика и методика преподавания языков", Description: "Сессия 3 конференции.", Room: "Аркейн"},
			{Title: "Физическое воспитание: инновации и подходы", Description: "Сессия 4 конференции.", Room: "Ученый совет"},
			{Title: "Наука зуммеров и альфа (молодые ученые до 35 лет)", Description: "Сессия 5 конференции.", Room: "Хайпарк"},
		}
		for _, s := range sections {
			h.DB.Create(&s)
		}
	}

	var sections []models.Section
	h.DB.Order("start_at asc, id asc").Find(&sections)
	if len(sections) < 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not enough sections"})
		return
	}

	firstDayStart := time.Date(2026, time.April, 24, 10, 0, 0, 0, time.Local)
	secondDayStart := time.Date(2026, time.April, 25, 10, 0, 0, 0, time.Local)
	starts := []time.Time{
		firstDayStart,
		firstDayStart.Add(2 * time.Hour),
		firstDayStart.Add(4 * time.Hour),
		secondDayStart,
		secondDayStart.Add(2 * time.Hour),
	}

	for i := 0; i < len(sections) && i < len(starts); i++ {
		sections[i].StartAt = starts[i]
		sections[i].EndAt = sections[i].StartAt.Add(90 * time.Minute)
		sections[i].Capacity = 120
		h.DB.Save(&sections[i])
	}

	demoUsers := []demoUser{
		{Email: "demo1@conf.local", FullName: "Иван Петров", SectionID: sections[0].ID, TalkTitle: "Правовые механизмы роста в цифровой экономике"},
		{Email: "demo2@conf.local", FullName: "Мария Смирнова", SectionID: sections[0].ID, TalkTitle: "Управление данными как фактор развития регионов"},
		{Email: "demo3@conf.local", FullName: "Алексей Иванов", SectionID: sections[1].ID, TalkTitle: "Социальные платформы и новые цифровые практики"},
		{Email: "demo4@conf.local", FullName: "Елена Кузнецова", SectionID: sections[1].ID, TalkTitle: "Городские сервисы в цифровую эпоху"},
		{Email: "demo5@conf.local", FullName: "Дмитрий Орлов", SectionID: sections[2].ID, TalkTitle: "Цифровые инструменты в преподавании русского языка"},
		{Email: "demo6@conf.local", FullName: "Ольга Соколова", SectionID: sections[2].ID, TalkTitle: "Методика обучения иностранным языкам онлайн"},
		{Email: "demo7@conf.local", FullName: "Тамерлан Алиев", SectionID: sections[3].ID, TalkTitle: "Инновационные подходы к физическому воспитанию"},
		{Email: "demo8@conf.local", FullName: "Софья Волкова", SectionID: sections[3].ID, TalkTitle: "Цифровые трекеры и спортивная мотивация"},
		{Email: "demo9@conf.local", FullName: "Амина Эльдарова", SectionID: sections[4].ID, TalkTitle: "Научные проекты поколения альфа"},
		{Email: "demo10@conf.local", FullName: "Никита Фролов", SectionID: sections[4].ID, TalkTitle: "Зуммеры как драйвер новой исследовательской культуры"},
	}

	for _, u := range demoUsers {
		var existing models.User
		if err := h.DB.Where("email = ?", u.Email).First(&existing).Error; err == nil {
			continue
		}
		passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Demo123!"), 12)
		user := models.User{
			Email:        u.Email,
			PasswordHash: string(passwordHash),
			Role:         models.RoleParticipant,
			UserType:     models.UserTypeOffline,
			Profile: models.Profile{
				FullName:     u.FullName,
				Organization: "Тестовый университет",
				Position:     "Докладчик",
				City:         "Москва",
				Degree:       "к.т.н.",
				SectionID:    &u.SectionID,
				TalkTitle:    u.TalkTitle,
				Phone:        "+7 900 000-00-00",
				ConsentGiven: true,
			},
		}
		if err := h.DB.Create(&user).Error; err == nil {
			// назначение идёт через выбранную секцию
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "demo seeded"})
}

func (h *ScheduleHandler) AdminSchedule(c *gin.Context) {
	var sections []models.Section
	if err := h.DB.Order("start_at asc").Find(&sections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load sections"})
		return
	}
	result := make([]SectionWithParticipants, 0, len(sections))
	for _, section := range sections {
		var users []models.User
		h.DB.Preload("Profile").
			Joins("JOIN profiles ON profiles.user_id = users.id").
			Where("profiles.section_id = ?", section.ID).
			Order("users.created_at asc").
			Find(&users)
		participants := make([]ParticipantInfo, 0, len(users))
		for _, user := range users {
			participants = append(participants, ParticipantInfo{
				UserID:    user.ID,
				FullName:  user.Profile.FullName,
				TalkTitle: user.Profile.TalkTitle,
			})
		}
		result = append(result, SectionWithParticipants{
			Section:      section,
			Participants: participants,
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *ScheduleHandler) ParticipantSchedule(c *gin.Context) {
	currentUserID := c.GetUint("user_id")
	var sections []models.Section
	if err := h.DB.Order("start_at asc").Find(&sections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load sections"})
		return
	}
	result := make([]SectionWithParticipants, 0, len(sections))
	for _, section := range sections {
		var users []models.User
		h.DB.Preload("Profile").
			Joins("JOIN profiles ON profiles.user_id = users.id").
			Where("profiles.section_id = ?", section.ID).
			Order("users.created_at asc").
			Find(&users)
		participants := make([]ParticipantInfo, 0, len(users))
		for _, user := range users {
			participants = append(participants, ParticipantInfo{
				UserID:    user.ID,
				FullName:  user.Profile.FullName,
				TalkTitle: user.Profile.TalkTitle,
			})
		}
		result = append(result, SectionWithParticipants{
			Section:      section,
			Participants: participants,
		})
	}
	c.JSON(http.StatusOK, gin.H{"current_user_id": currentUserID, "items": result})
}

func (h *ScheduleHandler) UserSchedule(c *gin.Context) {
	userID := c.GetUint("user_id")
	var user models.User
	if err := h.DB.Preload("Profile").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var section *models.Section
	if user.Profile.SectionID != nil {
		var sec models.Section
		if err := h.DB.First(&sec, *user.Profile.SectionID).Error; err == nil {
			section = &sec
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"user":    user,
		"section": section,
	})
}
