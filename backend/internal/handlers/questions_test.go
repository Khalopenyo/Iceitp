package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const questionTestJWTSecret = "test-secret"

func newQuestionTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Profile{},
		&models.Conference{},
		&models.Question{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newQuestionTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		userID, _ := strconv.ParseUint(c.GetHeader("X-User-ID"), 10, 64)
		role := models.Role(strings.TrimSpace(c.GetHeader("X-User-Role")))
		if role == "" {
			role = models.RoleParticipant
		}
		c.Set("user_id", uint(userID))
		c.Set("role", role)
		c.Next()
	})

	handler := &QuestionHandler{
		DB:         db,
		JWTSecret:  questionTestJWTSecret,
		AppBaseURL: "http://localhost:5173",
	}
	router.GET("/api/questions/public", handler.PublicQuestionContext)
	router.GET("/api/questions/approved", handler.ApprovedQuestions)
	router.POST("/api/questions/public", handler.CreatePublicQuestion)
	router.GET("/api/admin/questions/qr", func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != models.RoleAdmin && role != models.RoleOrg {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		handler.QuestionQR(c)
	})
	router.GET("/api/admin/questions", func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != models.RoleAdmin && role != models.RoleOrg {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		handler.ListQuestions(c)
	})
	router.PATCH("/api/admin/questions/:id", func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != models.RoleAdmin && role != models.RoleOrg {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		handler.UpdateQuestionStatus(c)
	})
	return router
}

func seedQuestionUser(t *testing.T, db *gorm.DB, email string, role models.Role, fullName string) models.User {
	t.Helper()

	user := models.User{
		Email:        email,
		PasswordHash: "hash",
		Role:         role,
		UserType:     models.UserTypeOffline,
		Profile: models.Profile{
			FullName:     fullName,
			Organization: "Организация",
			Position:     "Участник",
			ConsentGiven: true,
		},
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func seedQuestionConference(t *testing.T, db *gorm.DB) models.Conference {
	t.Helper()

	conf := models.Conference{
		Title:  "Тестовая конференция",
		Status: "in_progress",
	}
	if err := db.Create(&conf).Error; err != nil {
		t.Fatalf("create conference: %v", err)
	}
	return conf
}

func signQuestionToken(t *testing.T, conferenceID uint) string {
	t.Helper()

	claims := jwt.MapClaims{
		"type":          "question",
		"conference_id": conferenceID,
		"iat":           time.Now().Unix(),
		"exp":           time.Now().Add(2 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(questionTestJWTSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func performQuestionJSONRequest(
	t *testing.T,
	router *gin.Engine,
	method, path string,
	payload any,
	user *models.User,
) *httptest.ResponseRecorder {
	t.Helper()

	var body []byte
	if payload != nil {
		var err error
		body, err = json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if user != nil {
		req.Header.Set("X-User-ID", strconv.FormatUint(uint64(user.ID), 10))
		req.Header.Set("X-User-Role", string(user.Role))
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestCreatePublicQuestion(t *testing.T) {
	db := newQuestionTestDB(t)
	router := newQuestionTestRouter(db)
	conf := seedQuestionConference(t, db)
	token := signQuestionToken(t, conf.ID)

	recorder := performQuestionJSONRequest(t, router, http.MethodPost, "/api/questions/public", map[string]any{
		"token":       token,
		"author_name": "Мария Иванова",
		"text":        "  Когда начнется работа секций?  ",
	}, nil)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var question models.Question
	if err := db.First(&question).Error; err != nil {
		t.Fatalf("load question: %v", err)
	}
	if question.Status != models.QuestionStatusPending {
		t.Fatalf("expected pending status, got %q", question.Status)
	}
	if question.AuthorName != "Мария Иванова" {
		t.Fatalf("expected author name, got %q", question.AuthorName)
	}
	if question.Text != "Когда начнется работа секций?" {
		t.Fatalf("expected trimmed question text, got %q", question.Text)
	}
}

func TestCreatePublicQuestionWithoutAuthorName(t *testing.T) {
	db := newQuestionTestDB(t)
	router := newQuestionTestRouter(db)
	conf := seedQuestionConference(t, db)
	token := signQuestionToken(t, conf.ID)

	recorder := performQuestionJSONRequest(t, router, http.MethodPost, "/api/questions/public", map[string]any{
		"token": token,
		"text":  "Можно ли подключиться онлайн?",
	}, nil)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var question models.Question
	if err := db.First(&question).Error; err != nil {
		t.Fatalf("load question: %v", err)
	}
	if question.AuthorName != "" {
		t.Fatalf("expected empty author name, got %q", question.AuthorName)
	}
	if question.Text != "Можно ли подключиться онлайн?" {
		t.Fatalf("expected question text, got %q", question.Text)
	}
}

func TestPublicQuestionContextReturnsConference(t *testing.T) {
	db := newQuestionTestDB(t)
	router := newQuestionTestRouter(db)
	conf := seedQuestionConference(t, db)
	token := signQuestionToken(t, conf.ID)

	recorder := performQuestionJSONRequest(t, router, http.MethodGet, "/api/questions/public?token="+token, nil, nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		Conference struct {
			Title string `json:"title"`
		} `json:"conference"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Conference.Title != conf.Title {
		t.Fatalf("expected conference title %q, got %q", conf.Title, response.Conference.Title)
	}
}

func TestAdminQuestionQRReturnsPublicURL(t *testing.T) {
	db := newQuestionTestDB(t)
	router := newQuestionTestRouter(db)
	admin := seedQuestionUser(t, db, "admin@example.com", models.RoleAdmin, "Администратор")
	conf := seedQuestionConference(t, db)

	recorder := performQuestionJSONRequest(t, router, http.MethodGet, "/api/admin/questions/qr", nil, &admin)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		URL         string `json:"url"`
		ApprovedURL string `json:"approved_url"`
		QRDataURL   string `json:"qr_data_url"`
		Conference  struct {
			ID uint `json:"id"`
		} `json:"conference"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Conference.ID != conf.ID {
		t.Fatalf("expected conference id %d, got %d", conf.ID, response.Conference.ID)
	}
	if !strings.Contains(response.URL, "/questions/") {
		t.Fatalf("expected public question url, got %q", response.URL)
	}
	if !strings.Contains(response.ApprovedURL, "/questions/") || !strings.HasSuffix(response.ApprovedURL, "/approved") {
		t.Fatalf("expected approved questions url, got %q", response.ApprovedURL)
	}
	if !strings.HasPrefix(response.QRDataURL, "data:image/png;base64,") {
		t.Fatalf("expected png data url, got %q", response.QRDataURL)
	}
}

func TestApprovedQuestionsReturnsOnlyApprovedItems(t *testing.T) {
	db := newQuestionTestDB(t)
	router := newQuestionTestRouter(db)
	conf := seedQuestionConference(t, db)
	token := signQuestionToken(t, conf.ID)

	approvedAt := time.Now().UTC()
	approved := models.Question{
		ConferenceID: conf.ID,
		AuthorName:   "Мария Иванова",
		Text:         "Когда начнется пленарное заседание?",
		Status:       models.QuestionStatusApproved,
		ModeratedAt:  &approvedAt,
	}
	pending := models.Question{
		ConferenceID: conf.ID,
		AuthorName:   "Иван Петров",
		Text:         "Будет ли запись докладов?",
		Status:       models.QuestionStatusPending,
	}
	if err := db.Create(&approved).Error; err != nil {
		t.Fatalf("create approved question: %v", err)
	}
	if err := db.Create(&pending).Error; err != nil {
		t.Fatalf("create pending question: %v", err)
	}

	recorder := performQuestionJSONRequest(t, router, http.MethodGet, "/api/questions/approved?token="+token, nil, nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var response struct {
		Conference struct {
			ID uint `json:"id"`
		} `json:"conference"`
		Items []struct {
			AuthorName string `json:"author_name"`
			Text       string `json:"text"`
			Status     string `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Conference.ID != conf.ID {
		t.Fatalf("expected conference id %d, got %d", conf.ID, response.Conference.ID)
	}
	if len(response.Items) != 1 {
		t.Fatalf("expected 1 approved question, got %d", len(response.Items))
	}
	if response.Items[0].AuthorName != approved.AuthorName {
		t.Fatalf("expected author %q, got %q", approved.AuthorName, response.Items[0].AuthorName)
	}
	if response.Items[0].Text != approved.Text {
		t.Fatalf("expected text %q, got %q", approved.Text, response.Items[0].Text)
	}
}

func TestAdminCanModerateQuestion(t *testing.T) {
	db := newQuestionTestDB(t)
	router := newQuestionTestRouter(db)
	admin := seedQuestionUser(t, db, "admin@example.com", models.RoleAdmin, "Администратор")
	conf := seedQuestionConference(t, db)

	question := models.Question{
		ConferenceID: conf.ID,
		AuthorName:   "Мария Иванова",
		Text:         "Можно ли задать вопрос после доклада?",
		Status:       models.QuestionStatusPending,
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatalf("create question: %v", err)
	}

	recorder := performQuestionJSONRequest(t, router, http.MethodPatch, "/api/admin/questions/"+strconv.FormatUint(uint64(question.ID), 10), map[string]any{
		"status": "approved",
	}, &admin)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	if err := db.First(&question, question.ID).Error; err != nil {
		t.Fatalf("reload question: %v", err)
	}
	if question.Status != models.QuestionStatusApproved {
		t.Fatalf("expected approved status, got %q", question.Status)
	}
	if question.ModeratedByID == nil || *question.ModeratedByID != admin.ID {
		t.Fatalf("expected moderator id %d, got %+v", admin.ID, question.ModeratedByID)
	}
}
