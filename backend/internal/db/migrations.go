package db

import (
	"conferenceplatforma/internal/models"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
)

const schemaMigrationsTable = "schema_migrations"

type schemaMigration struct {
	Version   string    `gorm:"primaryKey;size:64"`
	Name      string    `gorm:"not null"`
	AppliedAt time.Time `gorm:"not null"`
}

func (schemaMigration) TableName() string {
	return schemaMigrationsTable
}

type migration struct {
	Version string
	Name    string
	Up      func(db *gorm.DB) error
}

var migrations = []migration{
	{
		Version: "202604210001",
		Name:    "initial_schema",
		Up: func(db *gorm.DB) error {
			return db.AutoMigrate(
				&models.User{},
				&models.Profile{},
				&models.RegistrationAttempt{},
				&models.PasswordResetToken{},
				&models.PhoneAuthCode{},
				&models.ProgramAssignment{},
				&models.ArticleSubmission{},
				&models.Section{},
				&models.Room{},
				&models.Conference{},
				&models.CheckIn{},
				&models.Certificate{},
				&models.ConsentLog{},
				&models.MapMarker{},
				&models.MapRoute{},
				&models.Feedback{},
				&models.ChatMessage{},
				&models.ChatAttachment{},
			)
		},
	},
	{
		Version: "202604210002",
		Name:    "backfill_chat_channels",
		Up: func(db *gorm.DB) error {
			if err := db.Model(&models.ChatMessage{}).
				Where("(channel = '' OR channel IS NULL) AND section_id IS NOT NULL").
				Update("channel", models.ChatChannelSection).Error; err != nil {
				return err
			}
			if err := db.Model(&models.ChatMessage{}).
				Where("(channel = '' OR channel IS NULL) AND section_id IS NULL").
				Update("channel", models.ChatChannelConference).Error; err != nil {
				return err
			}
			return nil
		},
	},
	{
		Version: "202604210003",
		Name:    "normalize_and_unique_profile_phone",
		Up: func(db *gorm.DB) error {
			var profiles []models.Profile
			if err := db.Where("phone IS NOT NULL AND phone <> ''").Find(&profiles).Error; err != nil {
				return err
			}

			seen := make(map[string]uint)
			for _, profile := range profiles {
				normalized, err := normalizePhoneForIndex(profile.Phone)
				if err != nil {
					return fmt.Errorf("invalid phone for profile %d: %w", profile.ID, err)
				}
				if existing, ok := seen[normalized]; ok {
					return fmt.Errorf("duplicate phone detected for profiles %d and %d: %s", existing, profile.ID, normalized)
				}
				seen[normalized] = profile.ID
				if normalized != profile.Phone {
					if err := db.Model(&models.Profile{}).Where("id = ?", profile.ID).Update("phone", normalized).Error; err != nil {
						return err
					}
				}
			}

			createIndexSQL := `
				CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
				ON profiles (phone)
				WHERE phone IS NOT NULL AND phone <> ''
			`
			return db.Exec(createIndexSQL).Error
		},
	},
	{
		Version: "202604220004",
		Name:    "add_questions",
		Up: func(db *gorm.DB) error {
			return db.AutoMigrate(&models.Question{})
		},
	},
	{
		Version: "202604220005",
		Name:    "question_author_name_and_optional_user",
		Up: func(db *gorm.DB) error {
			if err := db.AutoMigrate(&models.Question{}); err != nil {
				return err
			}
			if db.Dialector.Name() == "postgres" {
				if err := db.Exec("ALTER TABLE questions ALTER COLUMN user_id DROP NOT NULL").Error; err != nil {
					return err
				}
			}
			return nil
		},
	},
	{
		Version: "202606200006",
		Name:    "add_conference_soft_delete",
		Up: func(db *gorm.DB) error {
			// Additive: adds nullable conferences.deleted_at + index (ADR-0004).
			return db.AutoMigrate(&models.Conference{})
		},
	},
	{
		Version: "202606200007",
		Name:    "add_organization_and_scoping",
		Up:      addOrganizationAndScoping,
	},
	{
		Version: "202606200008",
		Name:    "tenant_composite_uniqueness",
		Up:      tenantCompositeUniqueness,
	},
	{
		Version: "202606200009",
		Name:    "tenant_row_level_security",
		Up:      tenantRowLevelSecurity,
	},
	{
		Version: "202606200010",
		Name:    "tenant_row_level_security_parent_tables",
		Up:      tenantRLSParentTables,
	},
	{
		Version: "202606200011",
		Name:    "tenant_conference_id_not_null",
		Up:      tenantConferenceIDNotNull,
	},
	{
		Version: "202606200012",
		Name:    "add_content_blocks",
		Up: func(db *gorm.DB) error {
			if err := db.AutoMigrate(&models.ContentBlock{}); err != nil {
				return err
			}
			if db.Dialector.Name() != "postgres" {
				return nil
			}
			// New conference-scoped table → same fail-closed RLS policy as the
			// other conference_id tables (0009 already ran, so apply it here).
			for _, s := range []string{
				"ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY",
				"DROP POLICY IF EXISTS tenant_isolation ON content_blocks",
				"CREATE POLICY tenant_isolation ON content_blocks " +
					"USING (conference_id = NULLIF(current_setting('app.conf_id', true), '')::bigint) " +
					"WITH CHECK (conference_id = NULLIF(current_setting('app.conf_id', true), '')::bigint)",
			} {
				if err := db.Exec(s).Error; err != nil {
					return fmt.Errorf("rls content_blocks: %w", err)
				}
			}
			return nil
		},
	},
	{
		Version: "202606250013",
		Name:    "add_section_chair_and_talk_abstract",
		Up: func(db *gorm.DB) error {
			// Additive nullable-колонки под карточку секции (SCR-PUB-05):
			// sections.chair (председатель) и program_assignments.abstract.
			// AutoMigrate добавляет колонки, не трогая данные.
			return db.AutoMigrate(&models.Section{}, &models.ProgramAssignment{})
		},
	},
	{
		Version: "202606250014",
		Name:    "add_persons",
		Up: func(db *gorm.DB) error {
			if err := db.AutoMigrate(&models.Person{}); err != nil {
				return err
			}
			if db.Dialector.Name() != "postgres" {
				return nil
			}
			// Per-conference таблица → та же fail-closed RLS-политика, что и у
			// остальных conference_id-таблиц (0009 уже отработала).
			for _, s := range []string{
				"ALTER TABLE persons ENABLE ROW LEVEL SECURITY",
				"DROP POLICY IF EXISTS tenant_isolation ON persons",
				"CREATE POLICY tenant_isolation ON persons " +
					"USING (conference_id = NULLIF(current_setting('app.conf_id', true), '')::bigint) " +
					"WITH CHECK (conference_id = NULLIF(current_setting('app.conf_id', true), '')::bigint)",
			} {
				if err := db.Exec(s).Error; err != nil {
					return fmt.Errorf("rls persons: %w", err)
				}
			}
			return nil
		},
	},
}

// tenantConferenceIDNotNull flips the per-event conference_id columns (and
// conferences.organization_id) to NOT NULL — the structural guarantee behind the
// tenant scoping. It backfills any straggler NULLs first (idempotent; no-op on a
// fresh/empty DB, where the seeder runs AFTER migrations and stamps every row).
//
// Postgres-only (the ALTER). No-op on SQLite, whose AutoMigrate'd schema keeps
// the columns nullable so handler unit tests — which create rows with no resolved
// conference — keep working.
//
// users.organization_id is intentionally NOT flipped: bootstrap_admin and the
// future per-tenant membership model may create a user before an org is bound.
func tenantConferenceIDNotNull(db *gorm.DB) error {
	if db.Dialector.Name() != "postgres" {
		return nil
	}
	if err := linkExistingToDefaultOrg(db); err != nil {
		return err
	}
	alters := []string{
		"ALTER TABLE sections ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE rooms ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE map_markers ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE map_routes ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE program_assignments ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE feedbacks ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE chat_messages ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE article_submissions ALTER COLUMN conference_id SET NOT NULL",
		"ALTER TABLE conferences ALTER COLUMN organization_id SET NOT NULL",
	}
	for _, s := range alters {
		if err := db.Exec(s).Error; err != nil {
			return fmt.Errorf("not null flip: %w", err)
		}
	}
	return nil
}

// rlsConfTables is the set migration 0009 applies the conference_id policy to;
// rlsOrgTables the organization_id-scoped ones. Parent-scoped tables (profiles,
// consent_logs, chat_attachments) carry no own tenant column and are covered by
// subquery policies in tenantRLSParentTables (migration 0010). Tables added LATER
// (content_blocks, migration 0012) get their policy in their own migration — they
// cannot be listed here because 0009 runs before they exist.
var rlsConfTables = []string{
	"sections", "rooms", "map_markers", "map_routes", "program_assignments",
	"feedbacks", "chat_messages", "article_submissions", "questions",
	"check_ins", "certificates",
}

var rlsOrgTables = []string{"users", "conferences"}

// tenantRowLevelSecurity installs fail-closed Postgres RLS as a defense-in-depth
// backstop under the application-layer scoping. Each tenant-scoped table gets a
// tenant_isolation policy keyed on a per-request session variable
// (app.conf_id / app.org_id). When the variable is unset or empty the predicate
// is NULL → zero rows (fail-closed).
//
// RLS is NOT forced, so the table owner (the role that runs migrations and the
// current single-tenant app connection) bypasses it — behaviour is unchanged
// until the app connects as a non-owner role WITHOUT BYPASSRLS and sets the
// session variables per request (see RLS_ENFORCED + docs/adr/0006). No-op on
// SQLite (RLS is a Postgres feature; tests rely on the app-layer scoping).
func tenantRowLevelSecurity(db *gorm.DB) error {
	if db.Dialector.Name() != "postgres" {
		return nil
	}

	apply := func(table, column, setting string) error {
		stmts := []string{
			fmt.Sprintf("ALTER TABLE %s ENABLE ROW LEVEL SECURITY", table),
			fmt.Sprintf("DROP POLICY IF EXISTS tenant_isolation ON %s", table),
			fmt.Sprintf(
				"CREATE POLICY tenant_isolation ON %s "+
					"USING (%s = NULLIF(current_setting('%s', true), '')::bigint) "+
					"WITH CHECK (%s = NULLIF(current_setting('%s', true), '')::bigint)",
				table, column, setting, column, setting,
			),
		}
		for _, s := range stmts {
			if err := db.Exec(s).Error; err != nil {
				return fmt.Errorf("rls %s: %w", table, err)
			}
		}
		return nil
	}

	for _, t := range rlsConfTables {
		if err := apply(t, "conference_id", "app.conf_id"); err != nil {
			return err
		}
	}
	for _, t := range rlsOrgTables {
		if err := apply(t, "organization_id", "app.org_id"); err != nil {
			return err
		}
	}
	return nil
}

// rlsParentTable describes a tenant table that has no own scoping column and is
// isolated through its parent (e.g. profiles → users.organization_id).
type rlsParentTable struct {
	table       string // the child table
	parentTable string // the table it joins to
	fk          string // child column referencing parent.id
	parentCol   string // parent's tenant column (organization_id / conference_id)
	setting     string // session variable holding the tenant id
}

var rlsParentTables = []rlsParentTable{
	{"profiles", "users", "user_id", "organization_id", "app.org_id"},
	{"consent_logs", "users", "user_id", "organization_id", "app.org_id"},
	{"chat_attachments", "chat_messages", "message_id", "conference_id", "app.conf_id"},
}

// tenantRLSParentTables installs fail-closed RLS on the parent-scoped tables,
// which carry no own tenant column: the policy admits a row only when its parent
// row belongs to the request's tenant (EXISTS subquery on the parent's tenant
// column, keyed on the same session variable as the direct tables). When the
// variable is unset/empty the predicate is NULL → the EXISTS is false → zero rows
// (fail-closed). NOT forced, so the owner bypasses; no-op on SQLite.
func tenantRLSParentTables(db *gorm.DB) error {
	if db.Dialector.Name() != "postgres" {
		return nil
	}
	for _, p := range rlsParentTables {
		pred := fmt.Sprintf(
			"EXISTS (SELECT 1 FROM %s par WHERE par.id = %s.%s "+
				"AND par.%s = NULLIF(current_setting('%s', true), '')::bigint)",
			p.parentTable, p.table, p.fk, p.parentCol, p.setting,
		)
		stmts := []string{
			fmt.Sprintf("ALTER TABLE %s ENABLE ROW LEVEL SECURITY", p.table),
			fmt.Sprintf("DROP POLICY IF EXISTS tenant_isolation ON %s", p.table),
			fmt.Sprintf("CREATE POLICY tenant_isolation ON %s USING (%s) WITH CHECK (%s)", p.table, pred, pred),
		}
		for _, s := range stmts {
			if err := db.Exec(s).Error; err != nil {
				return fmt.Errorf("rls parent %s: %w", p.table, err)
			}
		}
	}
	return nil
}

// tenantCompositeUniqueness widens the catalog uniqueness constraints from
// global to per-conference, so two tenants can reuse the same room name, marker
// key, route tuple or have a per-conference program assignment without colliding.
// Identity/token uniqueness (User.Email, Profile.Phone, Organization.Slug,
// Certificate.Number, token hashes) stays GLOBAL by design (hybrid SSO).
//
// The old single-column unique indexes are dropped first (IF EXISTS → idempotent
// and a no-op on fresh DBs that already created the composite form from the
// current struct tags), then AutoMigrate recreates them as composite
// (conference_id, …) indexes. Runs after backfill (migration 0007), so every row
// already carries a conference_id and the composite indexes build without
// violation.
func tenantCompositeUniqueness(db *gorm.DB) error {
	for _, idx := range []string{
		"idx_map_markers_key",
		"idx_rooms_name",
		"idx_program_assignments_user_id",
		"idx_map_route",
	} {
		if err := db.Exec("DROP INDEX IF EXISTS " + idx).Error; err != nil {
			return err
		}
	}
	return db.AutoMigrate(
		&models.MapMarker{},
		&models.Room{},
		&models.ProgramAssignment{},
		&models.MapRoute{},
	)
}

// addOrganizationAndScoping introduces the tenant root (Organization) and the
// nullable scoping columns (organization_id / conference_id), then backfills all
// existing rows to organization #1 derived from the single live conference.
// Columns stay NULLABLE — the NOT NULL flip is deferred to Phase 2 (after handlers
// set conference_id on writes; see docs/phase0-writepath-audit.md and ADR-0003).
// Idempotent: backfill guards on WHERE ... IS NULL and org #1 via FirstOrCreate.
func addOrganizationAndScoping(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.Organization{},
		&models.User{},
		&models.Conference{},
		&models.Section{},
		&models.Room{},
		&models.MapMarker{},
		&models.MapRoute{},
		&models.ProgramAssignment{},
		&models.ChatMessage{},
		&models.Feedback{},
		&models.ArticleSubmission{},
	); err != nil {
		return err
	}

	return linkExistingToDefaultOrg(db)
}

// linkExistingToDefaultOrg creates organization #1 (derived from the single live
// conference) and backfills any rows that still have NULL tenant columns. It is
// idempotent (FirstOrCreate by slug + WHERE ... IS NULL) and safe to run on every
// boot — used both by the Phase-1 migration and by EnsureFirstRun after seed(),
// so fresh-install data created by the seeder is linked too. No-op on an empty DB.
// EnsureDefaultOrg creates (idempotently, by slug "icetp") the default
// organization #1 that owns the single-tenant data, and returns it. The display
// name is taken from the existing conference title when present. Safe on an empty
// database (creates the org with a generic name) — so the bootstrap can create
// org #1 BEFORE the seeder, letting seed() stamp organization_id/conference_id on
// the rows it creates (required once the NOT NULL flip lands).
func EnsureDefaultOrg(db *gorm.DB) (models.Organization, error) {
	displayName := "Организация"
	var conf models.Conference
	if err := db.Order("id asc").First(&conf).Error; err == nil {
		if t := strings.TrimSpace(conf.Title); t != "" {
			displayName = t
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Organization{}, err
	}
	org := models.Organization{}
	if err := db.Where(models.Organization{Slug: "icetp"}).
		Attrs(models.Organization{
			DisplayName: displayName,
			Status:      models.OrganizationStatusActive,
			Plan:        models.OrganizationPlanFree,
		}).
		FirstOrCreate(&org).Error; err != nil {
		return models.Organization{}, err
	}
	return org, nil
}

func linkExistingToDefaultOrg(db *gorm.DB) error {
	// Unscoped so a soft-deleted-only conference still anchors the per-event
	// backfill — otherwise straggler NULL conference_id rows would survive into the
	// NOT NULL flip and abort boot.
	var conf models.Conference
	if err := db.Unscoped().Order("id asc").First(&conf).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}

	org, err := EnsureDefaultOrg(db)
	if err != nil {
		return err
	}

	// Tenant-wide tables → organization #1. Unscoped: a soft-deleted conference
	// with NULL organization_id is a physical row the NOT NULL flip will validate,
	// so it must be backfilled too (GORM's default query skips deleted_at IS NULL).
	if err := db.Unscoped().Model(&models.Conference{}).Where("organization_id IS NULL").
		Update("organization_id", org.ID).Error; err != nil {
		return err
	}
	if err := db.Model(&models.User{}).Where("organization_id IS NULL").
		Update("organization_id", org.ID).Error; err != nil {
		return err
	}

	// Per-event tables → the single existing conference.
	perEvent := []any{
		&models.Section{}, &models.Room{}, &models.MapMarker{}, &models.MapRoute{},
		&models.ProgramAssignment{}, &models.ChatMessage{}, &models.Feedback{}, &models.ArticleSubmission{},
	}
	for _, m := range perEvent {
		if err := db.Model(m).Where("conference_id IS NULL").
			Update("conference_id", conf.ID).Error; err != nil {
			return err
		}
	}
	return nil
}

func RunMigrations(db *gorm.DB) error {
	if err := ensureMigrationsTable(db); err != nil {
		return err
	}

	applied, err := loadAppliedMigrations(db)
	if err != nil {
		return err
	}

	for _, item := range migrations {
		if _, ok := applied[item.Version]; ok {
			continue
		}
		log.Printf("db migration: applying %s_%s", item.Version, item.Name)
		// Apply the migration AND record its version together.
		apply := func(target *gorm.DB) error {
			if err := item.Up(target); err != nil {
				return err
			}
			return target.Table(schemaMigrationsTable).Create(&schemaMigration{
				Version:   item.Version,
				Name:      item.Name,
				AppliedAt: time.Now().UTC(),
			}).Error
		}
		var applyErr error
		if db.Dialector.Name() == "postgres" {
			// Atomic on Postgres: a partial failure rolls back cleanly instead of
			// leaving the schema half-migrated with the version unrecorded.
			applyErr = db.Transaction(apply)
		} else {
			// SQLite: run UNWRAPPED. A rebuild-style AutoMigrate toggles
			// PRAGMA foreign_keys, which is a silent no-op inside a transaction,
			// leaving FK enforcement on during the temp-table drop/rename.
			applyErr = apply(db)
		}
		if applyErr != nil {
			return fmt.Errorf("apply migration %s_%s: %w", item.Version, item.Name, applyErr)
		}
	}

	return nil
}

func ensureMigrationsTable(db *gorm.DB) error {
	createTableSQL := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(64) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			applied_at TIMESTAMP NOT NULL
		)
	`
	return db.Exec(createTableSQL).Error
}

func loadAppliedMigrations(db *gorm.DB) (map[string]struct{}, error) {
	var rows []schemaMigration
	if err := db.Table(schemaMigrationsTable).Find(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		result[row.Version] = struct{}{}
	}
	return result, nil
}

func normalizePhoneForIndex(phone string) (string, error) {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if digits == "" {
		return "", fmt.Errorf("phone is required")
	}
	if len(digits) == 10 {
		digits = "7" + digits
	}
	if len(digits) == 11 && strings.HasPrefix(digits, "8") {
		digits = "7" + digits[1:]
	}
	if len(digits) != 11 || !strings.HasPrefix(digits, "7") || digits[1] != '9' {
		return "", fmt.Errorf("phone must be in Russian mobile format")
	}
	return "+" + digits, nil
}
