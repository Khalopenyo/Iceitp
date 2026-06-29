package db

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// TestRLSIdentityScopeRepinsTenant is the regression gate for the control-plane
// scoping bug: the organizer console is served from the bare app/marketing domain,
// where tenant.Middleware resolves the Host to DefaultOrgID and RLSMiddleware pins
// the request transaction to it BEFORE auth runs. tenant.IdentityScope then adopts
// the authenticated principal's org — and must RE-PIN the RLS session to it, else
// every console query stays filtered by the wrong tenant under RLS enforcement.
//
// It runs the real middleware chain (Middleware → RLSMiddleware(enforced) →
// auth-stub → IdentityScope) against the restricted (non-BYPASSRLS) role and proves
// a request whose JWT names org B, arriving on the bare domain, reads exactly org
// B's rows. The control run without IdentityScope stays pinned to DefaultOrgID and
// sees nothing — proving the re-pin is what adopts the identity at the DB layer.
func TestRLSIdentityScopeRepinsTenant(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (clean Postgres) to run the IdentityScope RLS re-pin gate")
	}
	owner, scratchDSN := freshScratchDB(t, dsn, "rls_repin")
	if err := RunMigrations(owner); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	provisionRLSTestRole(t, owner)

	// Occupy id=1 (DefaultOrgID, the bare-domain fallback) with an empty platform org
	// so neither orgA nor orgB collides with it — otherwise the bare-Host fallback
	// would resolve straight to a test org and mask the re-pin.
	mustCreate(t, owner, &models.Organization{Slug: "rls-repin-platform", DisplayName: "Platform"})
	orgA := models.Organization{Slug: "rls-repin-a", DisplayName: "RA"}
	orgB := models.Organization{Slug: "rls-repin-b", DisplayName: "RB"}
	mustCreate(t, owner, &orgA)
	mustCreate(t, owner, &orgB)
	mustCreate(t, owner, &models.User{Email: "repin-a@x.test", Role: models.RoleParticipant, OrganizationID: &orgA.ID})
	mustCreate(t, owner, &models.User{Email: "repin-b@x.test", Role: models.RoleOrg, OrganizationID: &orgB.ID})
	emails := []string{"repin-a@x.test", "repin-b@x.test"}

	appDSN, err := withUser(scratchDSN, rlsTestRole, rlsTestPass)
	if err != nil {
		t.Fatalf("app dsn: %v", err)
	}
	app, err := gorm.Open(postgres.Open(appDSN), &gorm.Config{TranslateError: true})
	if err != nil {
		t.Fatalf("open app role: %v", err)
	}

	gin.SetMode(gin.TestMode)
	// probe reads users through the request-scoped (RLS) handle, so it sees only the
	// tenant the transaction is currently pinned to.
	probe := func(c *gin.Context) {
		var us []models.User
		if err := tenant.DB(c, app).Where("email IN ?", emails).Order("email").Find(&us).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		out := make([]string, 0, len(us))
		for _, u := range us {
			out = append(out, u.Email)
		}
		c.JSON(http.StatusOK, gin.H{"emails": out})
	}

	// buildRouter wires the real chain. withIdentity toggles IdentityScope so the
	// control run proves the re-pin (not something else) is responsible.
	buildRouter := func(withIdentity bool) *gin.Engine {
		r := gin.New()
		r.Use(tenant.Middleware(owner, 0))                // bare Host → DefaultOrgID, HostMatched=false
		r.Use(tenant.RLSMiddleware(app, true))         // pins the tx to DefaultOrgID
		r.Use(func(c *gin.Context) {                   // stand in for auth.Middleware
			c.Set("jwt_org_id", orgB.ID)
			c.Next()
		})
		if withIdentity {
			r.Use(tenant.IdentityScope(owner)) // re-pins the tx to org B
		}
		r.GET("/probe", probe)
		return r
	}

	call := func(r *gin.Engine) []string {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/probe", nil)
		req.Host = "app.kvorum.ru" // bare marketing domain — no tenant subdomain
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("probe -> %d: %s", w.Code, w.Body.String())
		}
		var body struct {
			Emails []string `json:"emails"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode probe body: %v", err)
		}
		return body.Emails
	}

	// Without IdentityScope: tx stays pinned to DefaultOrgID, which owns neither user.
	if got := call(buildRouter(false)); len(got) != 0 {
		t.Errorf("no-identity probe saw %v, want [] (tx pinned to DefaultOrgID, fail-closed)", got)
	}

	// With IdentityScope: the re-pin adopts org B at the DB layer → only org B's user.
	got := call(buildRouter(true))
	if len(got) != 1 || got[0] != "repin-b@x.test" {
		t.Errorf("identity-scoped probe saw %v, want [repin-b@x.test] (re-pinned to org B's RLS)", got)
	}
}
