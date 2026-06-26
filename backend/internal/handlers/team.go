package handlers

import (
	"errors"
	netmail "net/mail"
	"net/http"
	"strconv"
	"strings"
	"time"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// inviteTokenTTL is how long a team-invite link (a password-reset token under the
// hood) stays valid — generous because invitees may not act immediately.
const inviteTokenTTL = 7 * 24 * time.Hour

// TeamHandler manages an organization's staff roster (Команда оргкомитета): the
// account owner invites colleagues, who become staff Users with one Membership
// each. All operations are scoped to the authenticated organizer's org (the admin
// group runs under IdentityScope), and mutations are owner-only (router gate).
//
// RLS: the invite's User/Membership/token writes go through tenant.DB, i.e. the
// per-request RLS transaction re-pinned to the owner's org (IdentityScope →
// RepinRLS), so they satisfy WITH CHECK when enforcement is on. The one read that
// must see ACROSS tenants — the global email-uniqueness pre-check — uses OwnerDB
// (the BYPASSRLS owner pool), mirroring AuthHandler; on the app pool RLS would hide
// every other tenant's email and the friendly 409 could never fire.
type TeamHandler struct {
	DB         *gorm.DB
	OwnerDB    *gorm.DB
	AppBaseURL string
}

type teamMemberView struct {
	ID    uint   `json:"id"`    // membership id (0 for the owner row)
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`  // curator/moderator/editor/booth (owner shown as curator)
	Owner bool   `json:"owner"`
}

type inviteMemberRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

type updateMemberRequest struct {
	Role string `json:"role"`
}

func nameOrEmail(name, email string) string {
	if n := strings.TrimSpace(name); n != "" {
		return n
	}
	return email
}

// List returns the team roster: the owner first, then each staff membership.
func (h *TeamHandler) List(c *gin.Context) {
	db := tenant.DB(c, h.DB)
	out := []teamMemberView{}

	// Owner row — the User with Role=org in this org (created at signup).
	var owner models.User
	if err := db.Scopes(tenant.ByOrg(c)).Preload("Profile").
		Where("role = ?", models.RoleOrg).Order("id asc").First(&owner).Error; err == nil {
		out = append(out, teamMemberView{
			ID:    0,
			Name:  nameOrEmail(owner.Profile.FullName, owner.Email),
			Email: owner.Email,
			Role:  string(models.MembershipRoleCurator),
			Owner: true,
		})
	}

	var members []models.Membership
	if err := db.Scopes(tenant.ByOrg(c)).Preload("User.Profile").
		Order("created_at asc").Find(&members).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load team"})
		return
	}
	for _, m := range members {
		out = append(out, teamMemberView{
			ID:    m.ID,
			Name:  nameOrEmail(m.User.Profile.FullName, m.User.Email),
			Email: m.User.Email,
			Role:  string(m.Role),
			Owner: false,
		})
	}
	c.JSON(http.StatusOK, gin.H{"members": out})
}

// Invite creates a staff User + Membership for a new colleague and returns a
// one-time invite link (they set their password via the existing reset flow, then
// log into the console). Owner-only (router gate).
func (h *TeamHandler) Invite(c *gin.Context) {
	var req inviteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	email := normalizeEmail(req.Email)
	name := strings.TrimSpace(req.Name)
	role := models.MembershipRole(strings.TrimSpace(req.Role))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "укажите e-mail коллеги"})
		return
	}
	if _, err := netmail.ParseAddress(email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "укажите корректный e-mail"})
		return
	}
	if !models.ValidMembershipRole(role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "выберите роль из списка"})
		return
	}
	orgID := tenant.OrgID(c)
	if orgID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "организация не определена"})
		return
	}
	// Invited colleagues must be new accounts: a global email collision would mean
	// claiming or re-homing an existing user across tenants.
	if _, err := h.findExistingUser(email); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "пользователь с таким e-mail уже зарегистрирован"})
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate user"})
		return
	}

	// Random placeholder password — the invitee sets their own via the invite link.
	seed, err := generateRawPasswordResetToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare invite"})
		return
	}
	passwordHash, err := hashPassword(seed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare invite"})
		return
	}
	rawInvite, err := generateRawPasswordResetToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare invite"})
		return
	}
	inviteURL, err := buildPasswordResetURL(h.appBaseURL(), rawInvite)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build invite link"})
		return
	}

	oid := orgID
	user := models.User{
		Email:          email,
		PasswordHash:   passwordHash,
		Role:           models.RoleStaff,
		UserType:       models.UserTypeOnline,
		OrganizationID: &oid,
		Profile:        models.Profile{FullName: name, Organization: ""},
	}
	db := tenant.DB(c, h.DB)
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.Membership{
			OrganizationID: orgID,
			UserID:         user.ID,
			Role:           role,
		}).Error; err != nil {
			return err
		}
		return tx.Create(&models.PasswordResetToken{
			UserID:    user.ID,
			TokenHash: hashPasswordResetToken(rawInvite),
			ExpiresAt: time.Now().Add(inviteTokenTTL),
		}).Error
	})
	if err != nil {
		// A genuine duplicate (email race that slipped past the pre-check) is a 409;
		// anything else is a real server fault the operator should see as a 500.
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			c.JSON(http.StatusConflict, gin.H{"error": "пользователь с таким e-mail уже зарегистрирован"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "не удалось пригласить — повторите попытку"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"member": teamMemberView{
			ID:    0, // refetched by the client via List
			Name:  nameOrEmail(name, email),
			Email: email,
			Role:  string(role),
			Owner: false,
		},
		"invite_url": inviteURL,
	})
}

// UpdateRole changes a staff member's functional role. Owner-only (router gate).
func (h *TeamHandler) UpdateRole(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member id"})
		return
	}
	var req updateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	role := models.MembershipRole(strings.TrimSpace(req.Role))
	if !models.ValidMembershipRole(role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "выберите роль из списка"})
		return
	}
	db := tenant.DB(c, h.DB)
	res := db.Model(&models.Membership{}).Scopes(tenant.ByOrg(c)).
		Where("id = ?", id).Update("role", role)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update member"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "участник не найден"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Remove deletes a staff membership and the associated staff User. Owner-only.
func (h *TeamHandler) Remove(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member id"})
		return
	}
	db := tenant.DB(c, h.DB)
	var m models.Membership
	if err := db.Scopes(tenant.ByOrg(c)).Where("id = ?", id).First(&m).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "участник не найден"})
		return
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", m.ID).Delete(&models.Membership{}).Error; err != nil {
			return err
		}
		// The staff account + its profile + any pending invite token exist only to
		// serve this membership — delete them too so no orphan rows (or a still-usable
		// invite link) linger after removal.
		if err := tx.Where("user_id = ?", m.UserID).Delete(&models.PasswordResetToken{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", m.UserID).Delete(&models.Profile{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND role = ?", m.UserID, models.RoleStaff).Delete(&models.User{}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove member"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// findExistingUser looks up a user by email GLOBALLY (email is unique across all
// tenants), so an invite can detect collisions. It must run on the owner pool: on
// the RLS-scoped app pool every other tenant's user is invisible. Falls back to DB
// when OwnerDB is unset (tests / RLS-off, where the two pools are the same).
func (h *TeamHandler) findExistingUser(email string) (models.User, error) {
	db := h.OwnerDB
	if db == nil {
		db = h.DB
	}
	var user models.User
	err := db.Where("LOWER(email) = ?", normalizeEmail(email)).First(&user).Error
	return user, err
}

func (h *TeamHandler) appBaseURL() string {
	if h.AppBaseURL == "" {
		return defaultAppBaseURL
	}
	return h.AppBaseURL
}
