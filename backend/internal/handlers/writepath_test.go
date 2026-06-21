package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	appdb "conferenceplatforma/internal/db"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestWritePathStampsConferenceID verifies the end-to-end Phase 2 write path:
// the tenant middleware resolves the active conference into the scope, and a
// mutating handler stamps conference_id on the created row.
func TestWritePathStampsConferenceID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:writepath_stamp?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := appdb.RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	conf := models.Conference{Title: "Conf"}
	if err := db.Create(&conf).Error; err != nil {
		t.Fatalf("create conference: %v", err)
	}
	user := models.User{Email: "p@x.ru", PasswordHash: "h", Role: models.RoleParticipant, UserType: models.UserTypeOnline}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	r := gin.New()
	r.Use(tenant.Middleware(db))
	r.Use(func(c *gin.Context) { c.Set("user_id", user.ID); c.Next() })
	r.POST("/feedback", (&FeedbackHandler{DB: db}).CreateFeedback)

	body, _ := json.Marshal(map[string]any{"rating": 5, "comment": "всё отлично"})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/feedback", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	var fb models.Feedback
	if err := db.First(&fb).Error; err != nil {
		t.Fatalf("load feedback: %v", err)
	}
	if fb.ConferenceID == nil || *fb.ConferenceID != conf.ID {
		t.Fatalf("feedback.conference_id = %v, want %d", fb.ConferenceID, conf.ID)
	}
}
