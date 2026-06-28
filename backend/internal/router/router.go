package router

import (
	"conferenceplatforma/internal/auth"
	"conferenceplatforma/internal/config"
	"conferenceplatforma/internal/handlers"
	"conferenceplatforma/internal/mail"
	"conferenceplatforma/internal/objectstore"
	"conferenceplatforma/internal/ratelimit"
	"conferenceplatforma/internal/sms"
	"conferenceplatforma/internal/tenant"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Setup wires the routes. appDB serves tenant-scoped requests (the RLS-enforced
// conf_app pool when RLS_ENFORCED is on); ownerDB is the table-owner pool that
// bypasses RLS — used to RESOLVE the tenant (reads conferences) and for auth's
// global-uniqueness queries. With RLS off the two are the same connection.
func Setup(appDB, ownerDB *gorm.DB, cfg config.Config, store objectstore.Store) *gin.Engine {
	db := appDB // tenant-scoped handlers serve on the app pool
	r := gin.Default()
	corsConfig := cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Disposition", "X-Bulk-Truncated"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if len(corsConfig.AllowOrigins) == 0 {
		corsConfig.AllowOrigins = []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	}
	if len(cfg.CORSOrigins) == 1 && cfg.CORSOrigins[0] == "*" {
		corsConfig.AllowCredentials = false
		corsConfig.AllowAllOrigins = true
		corsConfig.AllowOrigins = nil
	}
	r.Use(cors.New(corsConfig))
	if len(cfg.TrustedProxies) == 0 {
		_ = r.SetTrustedProxies(nil)
	} else {
		_ = r.SetTrustedProxies(cfg.TrustedProxies)
	}

	authHandler := &handlers.AuthHandler{
		// Owner pool: auth must read/write users globally (global email/phone
		// uniqueness, login across the whole DB) — it bypasses RLS by design.
		DB:                      ownerDB,
		JWTSecret:               cfg.JWTSecret,
		AccessTokenTTL:          cfg.AccessTokenTTL,
		AppBaseURL:              cfg.AppBaseURL,
		PasswordResetTTL:        cfg.PasswordResetTTL,
		PhoneAuthCodeTTL:        cfg.PhoneAuthCodeTTL,
		PhoneAuthResendCooldown: cfg.PhoneAuthResendCooldown,
		PhoneAuthMaxAttempts:    cfg.PhoneAuthMaxAttempts,
		MailSender:              mail.NewPasswordResetSender(cfg),
		AuthCodeSender:          sms.NewAuthCodeSender(cfg),
	}
	userHandler := &handlers.UserHandler{DB: db}
	sectionHandler := &handlers.SectionHandler{DB: db}
	scheduleHandler := &handlers.ScheduleHandler{DB: db}
	feedbackHandler := &handlers.FeedbackHandler{DB: db}
	questionHandler := &handlers.QuestionHandler{DB: db, JWTSecret: cfg.JWTSecret, AppBaseURL: cfg.AppBaseURL}
	chatHandler := &handlers.ChatHandler{DB: db, Store: store}
	docHandler := &handlers.DocumentHandler{DB: db, JWTSecret: cfg.JWTSecret, AppBaseURL: cfg.AppBaseURL}
	consentHandler := &handlers.ConsentHandler{DB: db}
	roomHandler := &handlers.RoomHandler{DB: db}
	mapMarkerHandler := &handlers.MapMarkerHandler{DB: db}
	mapRouteHandler := &handlers.MapRouteHandler{DB: db}
	venueMapHandler := &handlers.VenueMapHandler{DB: db}
	conferenceHandler := &handlers.ConferenceHandler{DB: db}
	programHandler := &handlers.ProgramHandler{DB: db}
	checkInHandler := &handlers.CheckInHandler{DB: db, JWTSecret: cfg.JWTSecret}
	submissionHandler := &handlers.SubmissionHandler{DB: db, Store: store}
	orgHandler := &handlers.OrganizationHandler{DB: db, Store: store}
	teamHandler := &handlers.TeamHandler{DB: db, OwnerDB: ownerDB, AppBaseURL: cfg.AppBaseURL}
	// OPS — кросс-тенантная зона: owner-пул (bypass RLS), без tenant-скоупа.
	opsHandler := &handlers.OpsHandler{DB: ownerDB}
	contentHandler := &handlers.ContentHandler{DB: db}
	personHandler := &handlers.PersonHandler{DB: db}

	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	registrationLimiter := ratelimit.New(20, 10*time.Minute)
	verificationLimiter := ratelimit.New(10, 10*time.Minute)
	loginLimiter := ratelimit.New(10, 10*time.Minute)
	resetLimiter := ratelimit.New(5, 15*time.Minute)
	questionLimiter := ratelimit.New(8, 5*time.Minute)
	// Публичная верификация сертификата: троттлим перебор последовательных
	// номеров (защита от массового сбора ФИО обладателей).
	certVerifyLimiter := ratelimit.New(30, 10*time.Minute)

	api := r.Group("/api")
	// Phase 2.1: resolve org (single existing org) + active conference into the
	// request scope. Phase 2.2 replaces org resolution with subdomain/Host lookup.
	// Resolve the tenant on the OWNER pool: it reads the RLS-protected conferences
	// table and must bypass RLS, otherwise ConfID would always be 0 once enforced.
	api.Use(tenant.Middleware(ownerDB))
	// Phase 2.5: when RLS_ENFORCED, wrap each request in a transaction on the APP
	// pool that sets the app.org_id/app.conf_id session variables so Postgres RLS
	// enforces tenant isolation. No-op (and zero overhead) when the flag is off.
	// Must run after the scope resolver above.
	api.Use(tenant.RLSMiddleware(appDB, cfg.RLSEnforced))
	// Self-service organizer (вуз) sign-up — provisions a new tenant + its owner.
	orgSignupLimiter := ratelimit.New(10, 30*time.Minute)
	api.POST("/org/signup", orgSignupLimiter.Middleware("org_signup"), authHandler.SignupOrganizer)
	api.POST("/auth/register", registrationLimiter.Middleware("auth_register"), authHandler.RequestRegistrationCode)
	api.POST("/auth/register/request-code", registrationLimiter.Middleware("auth_register_request_code"), authHandler.RequestRegistrationCode)
	api.POST("/auth/register/verify", verificationLimiter.Middleware("auth_register_verify"), authHandler.VerifyRegistrationCode)
	api.POST("/auth/login", loginLimiter.Middleware("auth_login"), authHandler.Login)
	api.POST("/auth/logout", authHandler.Logout)
	api.POST("/auth/forgot-password", resetLimiter.Middleware("auth_forgot_password"), authHandler.ForgotPassword)
	api.POST("/auth/reset-password", authHandler.ResetPassword)
	api.GET("/sections", sectionHandler.ListSections)
	api.GET("/sections/:id", sectionHandler.GetSection)
	api.GET("/rooms", roomHandler.ListRooms)
	api.GET("/map", venueMapHandler.GetMap)
	api.GET("/map/markers", mapMarkerHandler.ListMarkers)
	api.GET("/map/routes", mapRouteHandler.ListRoutes)
	api.GET("/conference", conferenceHandler.GetConference)
	api.GET("/landing", conferenceHandler.GetLanding)
	api.GET("/org", orgHandler.GetOrg)
	api.GET("/orgs/:slug/logo", orgHandler.GetOrgLogo)
	api.GET("/content", contentHandler.ListPublic)
	api.GET("/speakers", personHandler.ListPublic)
	api.GET("/certificates/:number", certVerifyLimiter.Middleware("cert_verify"), docHandler.VerifyCertificate)
	api.GET("/questions/public", questionHandler.PublicQuestionContext)
	api.GET("/questions/approved", questionHandler.ApprovedQuestions)
	api.POST("/questions/public", questionLimiter.Middleware("public_questions"), questionHandler.CreatePublicQuestion)
	protected := api.Group("")
	protected.Use(auth.Middleware(cfg.JWTSecret))
	// Scope authenticated requests by the principal's org (identity), not the Host:
	// on the bare app domain the Host resolves to no tenant, and the signed-in user's
	// own data must follow who they are. No-op on a real subdomain where Host == JWT.
	protected.Use(tenant.IdentityScope(ownerDB))
	protected.GET("/me", userHandler.Me)
	protected.PUT("/me/profile", userHandler.UpdateProfile)
	protected.GET("/schedule", scheduleHandler.UserSchedule)
	protected.GET("/schedule/with-participants", scheduleHandler.ParticipantSchedule)
	protected.POST("/feedback", feedbackHandler.CreateFeedback)
	protected.GET("/chat", chatHandler.ListMessages)
	protected.POST("/chat", chatHandler.PostMessage)
	protected.GET("/chat/attachments/:id", chatHandler.DownloadAttachment)
	protected.PATCH("/chat/:id", chatHandler.UpdateMessage)
	protected.DELETE("/chat/:id", chatHandler.DeleteMessage)
	protected.GET("/documents/status", docHandler.DocumentStatus)
	protected.GET("/documents/program", docHandler.ProgramPDF)
	protected.GET("/documents/certificate", docHandler.CertificatePDF)
	protected.GET("/documents/badge", docHandler.BadgePDF)
	protected.GET("/documents/badge/qr", docHandler.BadgeQR)
	protected.GET("/documents/proceedings", docHandler.Proceedings)
	protected.GET("/submissions", submissionHandler.ListSubmissions)
	protected.POST("/submissions", submissionHandler.CreateSubmission)
	protected.GET("/submissions/:id/file", submissionHandler.DownloadSubmissionFile)

	admin := api.Group("/admin")
	admin.Use(auth.Middleware(cfg.JWTSecret))
	// Owner + invited staff reach the console; owner-only operations (money,
	// identity, team, user management, conference lifecycle) add ownerOnly below.
	admin.Use(auth.RequireRole("admin", "org", "staff"))
	ownerOnly := auth.RequireRole("admin", "org")
	// The organizer console is served from the bare app domain; scope it to the
	// authenticated organizer's own org (identity), re-resolving that org's
	// conference — never the Host-resolved tenant. Then reject suspended/deleted
	// tenants so a still-valid token cannot mutate data after a platform suspend.
	admin.Use(tenant.IdentityScope(ownerDB))
	admin.Use(tenant.RequireActiveOrg(ownerDB))
	admin.GET("/users", userHandler.ListUsers)
	admin.PUT("/users/:id/profile", userHandler.UpdateParticipant)
	admin.PUT("/users/:id/role", ownerOnly, userHandler.UpdateUserRole)
	admin.PUT("/users/:id/badge", userHandler.SetBadgeIssued)
	admin.GET("/users/:id/badge", docHandler.AdminBadgePDF)
	admin.GET("/documents/bulk", docHandler.AdminBulkExport)
	admin.DELETE("/users/:id", ownerOnly, userHandler.DeleteUser)
	admin.GET("/sections", sectionHandler.ListSectionsAdmin)
	admin.POST("/sections", sectionHandler.CreateSection)
	admin.PUT("/sections/:id", sectionHandler.UpdateSection)
	admin.DELETE("/sections/:id", sectionHandler.DeleteSection)
	admin.POST("/rooms", roomHandler.CreateRoom)
	admin.DELETE("/rooms/:id", roomHandler.DeleteRoom)
	// Identity-scoped карта для конструктора консоли (публичный /api/map* — по Host).
	// Конструктор грузит/сохраняет всю карту разом: GET/PUT /admin/map.
	admin.GET("/map", venueMapHandler.GetMap)
	admin.PUT("/map", venueMapHandler.ReplaceMap)
	admin.GET("/map/markers", mapMarkerHandler.ListMarkers)
	admin.PUT("/map/markers", mapMarkerHandler.ReplaceMarkers)
	admin.PUT("/map/routes", mapRouteHandler.UpsertRoute)
	admin.POST("/seed-demo", ownerOnly, scheduleHandler.SeedDemo)
	admin.GET("/schedule", scheduleHandler.AdminSchedule)
	admin.GET("/program", programHandler.ListProgram)
	admin.PUT("/program/:userID", programHandler.UpsertProgramAssignment)
	admin.GET("/consents", consentHandler.ListConsents)
	admin.GET("/feedback", feedbackHandler.ListFeedback)
	admin.GET("/questions/qr", questionHandler.QuestionQR)
	admin.GET("/questions", questionHandler.ListQuestions)
	admin.PATCH("/questions/:id", questionHandler.UpdateQuestionStatus)
	admin.DELETE("/questions/:id", questionHandler.DeleteQuestion)
	admin.GET("/conference", conferenceHandler.GetConference)
	admin.POST("/conference", ownerOnly, conferenceHandler.CreateConference)
	admin.PUT("/conference", ownerOnly, conferenceHandler.UpdateConference)
	// Identity-scoped reads for the console: the public /org and /landing resolve by
	// Host (the bare app domain → DefaultOrgID), so the console must read its own
	// tenant's branding and stats through the admin (IdentityScope) group instead.
	admin.GET("/org", orgHandler.GetOrg)
	admin.GET("/landing", conferenceHandler.GetLanding)
	admin.PUT("/org", ownerOnly, orgHandler.UpdateOrg)
	admin.POST("/org/logo", ownerOnly, orgHandler.UploadLogo)
	admin.PUT("/billing", ownerOnly, orgHandler.SelectPlan)
	// Команда оргкомитета: список видит вся команда, приглашения/роли/удаление —
	// только владелец.
	admin.GET("/team", teamHandler.List)
	admin.POST("/team", ownerOnly, teamHandler.Invite)
	admin.PUT("/team/:id", ownerOnly, teamHandler.UpdateRole)
	admin.DELETE("/team/:id", ownerOnly, teamHandler.Remove)
	admin.GET("/content", contentHandler.ListAdmin)
	admin.POST("/content", contentHandler.Create)
	admin.PUT("/content/:id", contentHandler.Update)
	admin.DELETE("/content/:id", contentHandler.Delete)
	admin.GET("/speakers", personHandler.ListAdmin)
	admin.POST("/speakers", personHandler.Create)
	admin.PUT("/speakers/:id", personHandler.Update)
	admin.DELETE("/speakers/:id", personHandler.Delete)
	admin.POST("/checkin/verify", checkInHandler.VerifyBadge)
	// Регистрация на месте без камеры: отметка участника из ростера + лента/прогресс.
	admin.POST("/checkin/manual", checkInHandler.ManualCheckIn)
	admin.GET("/checkin/recent", checkInHandler.RecentCheckIns)

	// ── Операторская консоль платформы (OPS, зона super-admin) ──
	// КРОСС-ТЕНАНТНАЯ: НЕ применяем IdentityScope/RequireActiveOrg (оператор видит
	// все вузы); работаем на owner-пуле (bypass RLS). Доступ — только RoleOperator;
	// auth.Middleware привязывает к платформенному домену (на тенант-поддомене 403).
	ops := api.Group("/ops")
	ops.Use(auth.Middleware(cfg.JWTSecret))
	ops.Use(auth.RequireRole("operator"))
	ops.GET("/stats", opsHandler.Stats)
	ops.GET("/tenants", opsHandler.ListTenants)
	ops.PUT("/tenants/:id/status", opsHandler.SetTenantStatus)
	ops.PUT("/tenants/:id/plan", opsHandler.SetTenantPlan)

	return r
}
