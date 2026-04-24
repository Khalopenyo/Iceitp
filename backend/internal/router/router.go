package router

import (
	"conferenceplatforma/internal/auth"
	"conferenceplatforma/internal/config"
	"conferenceplatforma/internal/handlers"
	"conferenceplatforma/internal/mail"
	"conferenceplatforma/internal/objectstore"
	"conferenceplatforma/internal/ratelimit"
	"conferenceplatforma/internal/sms"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func Setup(db *gorm.DB, cfg config.Config, store objectstore.Store) *gin.Engine {
	r := gin.Default()
	corsConfig := cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Disposition"},
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
		DB:                      db,
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
	conferenceHandler := &handlers.ConferenceHandler{DB: db}
	programHandler := &handlers.ProgramHandler{DB: db}
	checkInHandler := &handlers.CheckInHandler{DB: db, JWTSecret: cfg.JWTSecret}
	submissionHandler := &handlers.SubmissionHandler{DB: db, Store: store}

	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	registrationLimiter := ratelimit.New(20, 10*time.Minute)
	verificationLimiter := ratelimit.New(10, 10*time.Minute)
	loginLimiter := ratelimit.New(10, 10*time.Minute)
	resetLimiter := ratelimit.New(5, 15*time.Minute)
	questionLimiter := ratelimit.New(8, 5*time.Minute)

	api := r.Group("/api")
	api.POST("/auth/register", registrationLimiter.Middleware("auth_register"), authHandler.RequestRegistrationCode)
	api.POST("/auth/register/request-code", registrationLimiter.Middleware("auth_register_request_code"), authHandler.RequestRegistrationCode)
	api.POST("/auth/register/verify", verificationLimiter.Middleware("auth_register_verify"), authHandler.VerifyRegistrationCode)
	api.POST("/auth/login", loginLimiter.Middleware("auth_login"), authHandler.Login)
	api.POST("/auth/logout", authHandler.Logout)
	api.POST("/auth/forgot-password", resetLimiter.Middleware("auth_forgot_password"), authHandler.ForgotPassword)
	api.POST("/auth/reset-password", authHandler.ResetPassword)
	api.GET("/sections", sectionHandler.ListSections)
	api.GET("/rooms", roomHandler.ListRooms)
	api.GET("/map/markers", mapMarkerHandler.ListMarkers)
	api.GET("/map/routes", mapRouteHandler.ListRoutes)
	api.GET("/conference", conferenceHandler.GetConference)
	api.GET("/certificates/:number", docHandler.VerifyCertificate)
	api.GET("/questions/public", questionHandler.PublicQuestionContext)
	api.GET("/questions/approved", questionHandler.ApprovedQuestions)
	api.POST("/questions/public", questionLimiter.Middleware("public_questions"), questionHandler.CreatePublicQuestion)
	protected := api.Group("")
	protected.Use(auth.Middleware(cfg.JWTSecret))
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
	protected.GET("/documents/proceedings", docHandler.Proceedings)
	protected.GET("/submissions", submissionHandler.ListSubmissions)
	protected.POST("/submissions", submissionHandler.CreateSubmission)
	protected.GET("/submissions/:id/file", submissionHandler.DownloadSubmissionFile)

	admin := api.Group("/admin")
	admin.Use(auth.Middleware(cfg.JWTSecret))
	admin.Use(auth.RequireRole("admin", "org"))
	admin.GET("/users", userHandler.ListUsers)
	admin.PUT("/users/:id/role", userHandler.UpdateUserRole)
	admin.PUT("/users/:id/badge", userHandler.SetBadgeIssued)
	admin.GET("/users/:id/badge", docHandler.AdminBadgePDF)
	admin.DELETE("/users/:id", userHandler.DeleteUser)
	admin.POST("/sections", sectionHandler.CreateSection)
	admin.PUT("/sections/:id", sectionHandler.UpdateSection)
	admin.DELETE("/sections/:id", sectionHandler.DeleteSection)
	admin.POST("/rooms", roomHandler.CreateRoom)
	admin.DELETE("/rooms/:id", roomHandler.DeleteRoom)
	admin.PUT("/map/markers", mapMarkerHandler.ReplaceMarkers)
	admin.PUT("/map/routes", mapRouteHandler.UpsertRoute)
	admin.POST("/seed-demo", scheduleHandler.SeedDemo)
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
	admin.PUT("/conference", conferenceHandler.UpdateConference)
	admin.POST("/checkin/verify", checkInHandler.VerifyBadge)

	return r
}
