package handlers

import (
	"errors"
	"net/http"
	"time"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// manualCheckInRequest marks a participant present by user id — the camera-free
// on-site registration path (staff find the attendee and tap «Отметить»).
type manualCheckInRequest struct {
	UserID uint `json:"user_id"`
}

// ManualCheckIn records an in-person check-in for a participant chosen from the
// roster (no QR scan). Idempotent: a second call returns the existing check-in.
// Available to the whole team (стендисты included), org-scoped via IdentityScope.
func (h *CheckInHandler) ManualCheckIn(c *gin.Context) {
	var req manualCheckInRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "не указан участник"})
		return
	}
	db := tenant.DB(c, h.DB)
	confID := tenant.ConfID(c)
	if confID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "конференция ещё не настроена"})
		return
	}
	var user models.User
	if err := db.Scopes(tenant.ByOrg(c)).Preload("Profile").First(&user, req.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "участник не найден"})
		return
	}
	if user.Role != models.RoleParticipant {
		c.JSON(http.StatusBadRequest, gin.H{"error": "отметить можно только участника конференции"})
		return
	}
	// On-site registration is physical presence — only offline participants attend
	// the venue. Matches the badge path (rejects online) and keeps the progress
	// denominator (offline participants) consistent with the checked-in count.
	if user.UserType != models.UserTypeOffline {
		c.JSON(http.StatusBadRequest, gin.H{"error": "отметить можно только очного участника"})
		return
	}
	var conf models.Conference
	if err := db.Scopes(tenant.ByOrg(c)).First(&conf, confID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conference"})
		return
	}

	var checkIn models.CheckIn
	err := db.Scopes(tenant.ByConference(c)).Where("user_id = ?", user.ID).First(&checkIn).Error
	if err == nil {
		c.JSON(http.StatusOK, buildCheckInResponse(checkIn.CheckedInAt, true, user, conf))
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check in"})
		return
	}
	verifier := c.GetUint("user_id")
	checkIn = models.CheckIn{
		ConferenceID:     confID,
		UserID:           user.ID,
		CheckedInAt:      time.Now(),
		VerifiedByUserID: &verifier,
		Source:           "manual_admin",
	}
	if err := db.Create(&checkIn).Error; err != nil {
		// Two staffers (or a double-tap) can both pass the existence check then race
		// the insert; the unique (conference_id, user_id) index makes the loser a
		// duplicate — honour the idempotency contract by returning the existing row.
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			var existing models.CheckIn
			if e := db.Scopes(tenant.ByConference(c)).Where("user_id = ?", user.ID).First(&existing).Error; e == nil {
				c.JSON(http.StatusOK, buildCheckInResponse(existing.CheckedInAt, true, user, conf))
				return
			}
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check in"})
		return
	}
	c.JSON(http.StatusCreated, buildCheckInResponse(checkIn.CheckedInAt, false, user, conf))
}

type recentCheckInView struct {
	UserID      uint      `json:"user_id"`
	Name        string    `json:"name"`
	Section     string    `json:"section"`
	CheckedInAt time.Time `json:"checked_in_at"`
}

// RecentCheckIns powers the console check-in screen: the most recent check-ins
// (name + section + time) plus progress (checked-in / total offline participants).
func (h *CheckInHandler) RecentCheckIns(c *gin.Context) {
	db := tenant.DB(c, h.DB)
	confID := tenant.ConfID(c)
	recent := []recentCheckInView{}
	if confID == 0 {
		c.JSON(http.StatusOK, gin.H{"recent": recent, "stats": gin.H{"checked_in": 0, "total": 0}})
		return
	}

	var checkins []models.CheckIn
	if err := db.Scopes(tenant.ByConference(c)).
		Order("checked_in_at desc").Limit(15).Find(&checkins).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load check-ins"})
		return
	}

	// Resolve names + section titles for the listed users.
	ids := make([]uint, 0, len(checkins))
	for _, ci := range checkins {
		ids = append(ids, ci.UserID)
	}
	users := map[uint]models.User{}
	if len(ids) > 0 {
		var loaded []models.User
		db.Scopes(tenant.ByOrg(c)).Preload("Profile").Where("id IN ?", ids).Find(&loaded)
		for _, u := range loaded {
			users[u.ID] = u
		}
	}
	sectionTitle := map[uint]string{}
	var sections []models.Section
	db.Scopes(tenant.ByConference(c)).Find(&sections)
	for _, s := range sections {
		sectionTitle[s.ID] = s.Title
	}

	for _, ci := range checkins {
		u := users[ci.UserID]
		section := ""
		if u.Profile.SectionID != nil {
			section = sectionTitle[*u.Profile.SectionID]
		}
		recent = append(recent, recentCheckInView{
			UserID:      ci.UserID,
			Name:        nameOrEmail(u.Profile.FullName, u.Email),
			Section:     section,
			CheckedInAt: ci.CheckedInAt,
		})
	}

	// Numerator and denominator must span the SAME population (offline participants),
	// else a stray/online check-in or a post-check-in role change makes checked_in
	// exceed total and the progress reads >100%.
	var total, checkedIn int64
	db.Model(&models.User{}).Scopes(tenant.ByOrg(c)).
		Where("role = ? AND user_type = ?", models.RoleParticipant, models.UserTypeOffline).Count(&total)
	db.Model(&models.CheckIn{}).
		Joins("JOIN users ON users.id = check_ins.user_id").
		Where("check_ins.conference_id = ? AND users.role = ? AND users.user_type = ?",
			confID, models.RoleParticipant, models.UserTypeOffline).Count(&checkedIn)

	// All checked-in user ids (not just the recent 15) so the search list can show an
	// already-present participant as ✓ even after a reload or a check-in elsewhere.
	checkedInIDs := []uint{}
	db.Model(&models.CheckIn{}).Scopes(tenant.ByConference(c)).Pluck("user_id", &checkedInIDs)

	c.JSON(http.StatusOK, gin.H{
		"recent":         recent,
		"stats":          gin.H{"checked_in": checkedIn, "total": total},
		"checked_in_ids": checkedInIDs,
	})
}
