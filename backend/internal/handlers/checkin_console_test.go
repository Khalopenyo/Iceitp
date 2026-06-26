package handlers

import (
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newCheckinRouter(db *gorm.DB, orgID, confID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", uint(999)) // the verifying staff member
		tenant.SetScope(c, tenant.Scope{OrgID: orgID, ConfID: confID})
		c.Next()
	})
	h := &CheckInHandler{DB: db}
	r.POST("/admin/checkin/manual", h.ManualCheckIn)
	r.GET("/admin/checkin/recent", h.RecentCheckIns)
	return r
}

func seedConfAndParticipant(t *testing.T, db *gorm.DB) (confID, userID, sectionID uint) {
	t.Helper()
	one := uint(1)
	conf := models.Conference{OrganizationID: &one, Title: "Конф", Onboarded: true}
	if err := db.Create(&conf).Error; err != nil {
		t.Fatalf("create conf: %v", err)
	}
	section := models.Section{ConferenceID: &conf.ID, Title: "ИИ и данные"}
	if err := db.Create(&section).Error; err != nil {
		t.Fatalf("create section: %v", err)
	}
	user := models.User{
		Email:          "attendee@vuz.ru",
		PasswordHash:   "x",
		Role:           models.RoleParticipant,
		UserType:       models.UserTypeOffline,
		OrganizationID: &one,
		Profile:        models.Profile{FullName: "Алексей Корнеев", SectionID: &section.ID},
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return conf.ID, user.ID, section.ID
}

// TestManualCheckInIdempotent marks a participant present, is idempotent on a
// repeat, and refuses a non-participant.
func TestManualCheckInIdempotent(t *testing.T) {
	db := newAuthTestDB(t)
	confID, userID, _ := seedConfAndParticipant(t, db)
	r := newCheckinRouter(db, 1, confID)

	w := doJSON(t, r, http.MethodPost, "/admin/checkin/manual", map[string]any{"user_id": userID})
	if w.Code != http.StatusCreated {
		t.Fatalf("first check-in -> %d (%s), want 201", w.Code, w.Body.String())
	}
	var resp struct {
		AlreadyCheckedIn bool `json:"already_checked_in"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.AlreadyCheckedIn {
		t.Error("first check-in should not be already_checked_in")
	}

	w2 := doJSON(t, r, http.MethodPost, "/admin/checkin/manual", map[string]any{"user_id": userID})
	if w2.Code != http.StatusOK {
		t.Errorf("repeat check-in -> %d, want 200", w2.Code)
	}
	json.Unmarshal(w2.Body.Bytes(), &resp)
	if !resp.AlreadyCheckedIn {
		t.Error("repeat check-in should be already_checked_in")
	}

	var count int64
	db.Model(&models.CheckIn{}).Where("conference_id = ? AND user_id = ?", confID, userID).Count(&count)
	if count != 1 {
		t.Errorf("check-in rows = %d, want 1 (idempotent)", count)
	}

	// A non-participant (the staff verifier id 999 has no user row; use an org user).
	owner := seedOrgOwner(t, db, 1, "owner-ci@vuz.ru", "O")
	if w := doJSON(t, r, http.MethodPost, "/admin/checkin/manual", map[string]any{"user_id": owner.ID}); w.Code != http.StatusBadRequest {
		t.Errorf("check-in of non-participant -> %d, want 400", w.Code)
	}

	// An ONLINE participant is not physically present → 400 (keeps stats consistent).
	one := uint(1)
	online := models.User{
		Email: "online@vuz.ru", PasswordHash: "x", Role: models.RoleParticipant,
		UserType: models.UserTypeOnline, OrganizationID: &one,
		Profile: models.Profile{FullName: "Онлайн Участник"},
	}
	if err := db.Create(&online).Error; err != nil {
		t.Fatalf("create online: %v", err)
	}
	if w := doJSON(t, r, http.MethodPost, "/admin/checkin/manual", map[string]any{"user_id": online.ID}); w.Code != http.StatusBadRequest {
		t.Errorf("check-in of online participant -> %d, want 400", w.Code)
	}
}

// TestRecentCheckIns returns the roster of recent check-ins with section + progress.
func TestRecentCheckIns(t *testing.T) {
	db := newAuthTestDB(t)
	confID, userID, _ := seedConfAndParticipant(t, db)
	r := newCheckinRouter(db, 1, confID)

	doJSON(t, r, http.MethodPost, "/admin/checkin/manual", map[string]any{"user_id": userID})

	w := doJSON(t, r, http.MethodGet, "/admin/checkin/recent", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("recent -> %d", w.Code)
	}
	var body struct {
		Recent []recentCheckInView `json:"recent"`
		Stats  struct {
			CheckedIn int64 `json:"checked_in"`
			Total     int64 `json:"total"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Recent) != 1 {
		t.Fatalf("recent = %d, want 1", len(body.Recent))
	}
	if body.Recent[0].Name != "Алексей Корнеев" || body.Recent[0].Section != "ИИ и данные" {
		t.Errorf("recent row = %+v, want name+section resolved", body.Recent[0])
	}
	if body.Stats.CheckedIn != 1 || body.Stats.Total != 1 {
		t.Errorf("stats = %d/%d, want 1/1", body.Stats.CheckedIn, body.Stats.Total)
	}
}
