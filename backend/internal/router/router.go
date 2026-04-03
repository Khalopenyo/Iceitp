package router

import (
	"conferenceplatforma/internal/antiplagiat"
	"conferenceplatforma/internal/auth"
	"conferenceplatforma/internal/handlers"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func Setup(db *gorm.DB, jwtSecret string, antiplagiatService *antiplagiat.Service, corsOrigins []string, trustedProxies []string) *gin.Engine {
	r := gin.Default()
	corsConfig := cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Disposition"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}
	if len(corsOrigins) == 1 && corsOrigins[0] == "*" {
		corsConfig.AllowAllOrigins = true
		corsConfig.AllowOrigins = nil
	} else if len(corsOrigins) > 0 {
		corsConfig.AllowOrigins = corsOrigins
	}
	r.Use(cors.New(corsConfig))
	if len(trustedProxies) == 0 {
		_ = r.SetTrustedProxies(nil)
	} else {
		_ = r.SetTrustedProxies(trustedProxies)
	}

	authHandler := &handlers.AuthHandler{DB: db, JWTSecret: jwtSecret}
	userHandler := &handlers.UserHandler{DB: db}
	sectionHandler := &handlers.SectionHandler{DB: db}
	scheduleHandler := &handlers.ScheduleHandler{DB: db}
	feedbackHandler := &handlers.FeedbackHandler{DB: db}
	chatHandler := &handlers.ChatHandler{DB: db}
	docHandler := &handlers.DocumentHandler{DB: db, JWTSecret: jwtSecret}
	consentHandler := &handlers.ConsentHandler{DB: db}
	roomHandler := &handlers.RoomHandler{DB: db}
	mapMarkerHandler := &handlers.MapMarkerHandler{DB: db}
	mapRouteHandler := &handlers.MapRouteHandler{DB: db}
	conferenceHandler := &handlers.ConferenceHandler{DB: db}
	programHandler := &handlers.ProgramHandler{DB: db}
	checkInHandler := &handlers.CheckInHandler{DB: db, JWTSecret: jwtSecret}
	submissionHandler := &handlers.SubmissionHandler{DB: db, Service: antiplagiatService}

	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	api := r.Group("/api")
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/forgot-password", authHandler.ForgotPassword)
	api.GET("/sections", sectionHandler.ListSections)
	api.GET("/rooms", roomHandler.ListRooms)
	api.GET("/map/markers", mapMarkerHandler.ListMarkers)
	api.GET("/map/routes", mapRouteHandler.ListRoutes)
	api.GET("/conference", conferenceHandler.GetConference)
	api.GET("/certificates/:number", docHandler.VerifyCertificate)

	protected := api.Group("")
	protected.Use(auth.Middleware(jwtSecret))
	protected.GET("/me", userHandler.Me)
	protected.PUT("/me/profile", userHandler.UpdateProfile)
	protected.GET("/schedule", scheduleHandler.UserSchedule)
	protected.GET("/schedule/with-participants", scheduleHandler.ParticipantSchedule)
	protected.POST("/feedback", feedbackHandler.CreateFeedback)
	protected.GET("/chat", chatHandler.ListMessages)
	protected.POST("/chat", chatHandler.PostMessage)
	protected.PATCH("/chat/:id", chatHandler.UpdateMessage)
	protected.DELETE("/chat/:id", chatHandler.DeleteMessage)
	protected.GET("/documents/program", docHandler.ProgramPDF)
	protected.GET("/documents/certificate", docHandler.CertificatePDF)
	protected.GET("/documents/badge", docHandler.BadgePDF)
	protected.GET("/documents/proceedings", docHandler.Proceedings)
	protected.GET("/submissions", submissionHandler.ListSubmissions)
	protected.POST("/submissions", submissionHandler.CreateSubmission)
	protected.POST("/submissions/:id/retry", submissionHandler.RetrySubmission)
	protected.POST("/submissions/:id/refresh", submissionHandler.RefreshSubmission)
	protected.POST("/submissions/:id/pdf", submissionHandler.RequestPDF)

	admin := api.Group("/admin")
	admin.Use(auth.Middleware(jwtSecret))
	admin.Use(auth.RequireRole("admin", "org"))
	admin.GET("/users", userHandler.ListUsers)
	admin.PUT("/users/:id/role", userHandler.UpdateUserRole)
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
	admin.GET("/conference", conferenceHandler.GetConference)
	admin.PUT("/conference", conferenceHandler.UpdateConference)
	admin.POST("/checkin/verify", checkInHandler.VerifyBadge)
	admin.GET("/antiplagiat/config", submissionHandler.GetConfig)
	admin.GET("/antiplagiat/services", submissionHandler.ListCheckServices)
	admin.PUT("/antiplagiat/config", submissionHandler.SaveConfig)
	admin.POST("/antiplagiat/ping", submissionHandler.PingConfig)

	return r
}
