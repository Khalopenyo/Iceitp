# Codebase Concerns

**Analysis Date:** 2026-04-02

## Tech Debt

**Runtime seed logic mutates live data on every server start:**
- Issue: `seed()` in `backend/cmd/server/main.go` creates the default admin, deletes all rooms outside the preset list, rewrites section rooms, and inserts preset markers during normal server startup.
- Files: `backend/cmd/server/main.go`, `backend/internal/handlers/rooms.go`, `backend/internal/handlers/sections.go`
- Impact: admin-created rooms and section assignments are not durable across restarts; production data can drift silently; debugging environment-specific behavior becomes difficult.
- Fix approach: move destructive seed behavior into explicit one-time migrations or demo-only commands and keep `cmd/server` startup side-effect free.

**Schema changes are coupled to application boot:**
- Issue: `backend/internal/db/db.go` runs `AutoMigrate` and data backfills at runtime instead of using reviewed, versioned migrations.
- Files: `backend/internal/db/db.go`
- Impact: deployment risk is hidden inside application boot, rollbacks are hard, and multi-environment drift is difficult to audit.
- Fix approach: introduce explicit migrations for schema and data backfills, then reduce startup logic to connectivity and health checks only.

**Generated/demo artifacts are mixed into normal development flow:**
- Issue: `frontend/dist/` exists in the repo workspace and `.gitignore` does not ignore it, while demo/bootstrap data is exposed through normal runtime code and admin actions.
- Files: `.gitignore`, `frontend/dist/`, `backend/internal/handlers/schedule.go`
- Impact: accidental commits of generated assets and accidental injection of demo data become easy during routine work.
- Fix approach: ignore frontend build output, move demo data generation behind an explicit dev-only guard, and separate production bootstrapping from local setup helpers.

**Frontend state and rendering are concentrated in a few very large page components:**
- Issue: `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Chat.jsx`, and `frontend/src/pages/Dashboard.jsx` each combine fetch logic, mutation logic, local state, and large render trees in one file.
- Files: `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Chat.jsx`, `frontend/src/pages/Dashboard.jsx`
- Impact: small UI changes have a wide regression surface; reuse is low; adding tests later will require heavy setup because business logic is not isolated.
- Fix approach: extract data hooks, view components, and form helpers before adding more admin and dashboard features.

## Known Bugs

**Admin room and section edits can be undone by restart:**
- Symptoms: rooms created through `/api/admin/rooms` and section-room combinations changed through admin flows can be removed or reassigned after the next server boot.
- Files: `backend/cmd/server/main.go`, `backend/internal/handlers/rooms.go`, `backend/internal/handlers/sections.go`
- Trigger: restart the API after creating non-preset rooms or assigning sections to non-preset room names.
- Workaround: avoid relying on runtime-created room data until boot seeding is removed.

**Direct admin navigation depends on stale client-side user cache:**
- Symptoms: an authenticated admin can be redirected away from `/admin` when the token exists but `localStorage` has not yet been refreshed with the current user payload.
- Files: `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/lib/auth.js`, `frontend/src/pages/Login.jsx`
- Trigger: open `/admin` directly after login or after storage has been cleared while a token still exists.
- Workaround: visit a page that triggers `/api/me` first so `frontend/src/components/Layout.jsx` repopulates the cached user.

**Password recovery advertises functionality that does not exist:**
- Symptoms: `/api/auth/forgot-password` always returns success but no reset token, email, or follow-up flow exists.
- Files: `backend/internal/handlers/auth.go`
- Trigger: submit the forgot-password endpoint.
- Workaround: administrator-led manual password resets outside the application.

## Security Considerations

**Default credentials are seeded and documented in source-controlled files:**
- Risk: predictable admin and demo passwords exist in code and documentation.
- Files: `backend/cmd/server/main.go`, `backend/internal/handlers/schedule.go`, `README.md`
- Current mitigation: bcrypt is used before persisting passwords.
- Recommendations: remove hardcoded credentials, require first-run bootstrap credentials from environment or setup command, and disable demo seeding outside local development.

**JWTs and cached user roles are stored in `localStorage`:**
- Risk: any XSS issue in the frontend can exfiltrate the bearer token and cached role data.
- Files: `frontend/src/lib/auth.js`, `frontend/src/lib/api.js`, `frontend/src/App.jsx`
- Current mitigation: backend role checks still exist in `backend/internal/auth/middleware.go`.
- Recommendations: move auth to `HttpOnly` cookies or another storage mechanism that reduces token exposure, and stop treating cached role state as a routing authority.

**CORS is permissive by default:**
- Risk: `backend/internal/router/router.go` starts with `AllowOrigins: []string{"*"}` unless `CORS_ORIGINS` is explicitly set.
- Files: `backend/internal/router/router.go`, `.env.example`
- Current mitigation: `.env.example` documents `CORS_ORIGINS=http://localhost:5173`.
- Recommendations: invert the default to deny-by-default or require explicit origins in non-local environments.

**Antiplagiat credentials are stored in plaintext application data:**
- Risk: the Antiplagiat API password is persisted directly in the `AntiplagiatConfig` model.
- Files: `backend/internal/models/antiplagiat.go`, `backend/internal/antiplagiat/service.go`, `frontend/src/pages/Admin.jsx`
- Current mitigation: read responses only expose `has_password` instead of the raw value.
- Recommendations: store secrets in environment-backed secret management only, or encrypt at rest before persisting configuration.

**Upload validation trusts filename extension and saves raw files locally:**
- Risk: `CreateSubmission` validates only the extension and size, then writes the file to disk.
- Files: `backend/internal/handlers/submissions.go`, `backend/internal/antiplagiat/service.go`
- Current mitigation: supported extensions are allowlisted and file size is capped at 20 MB.
- Recommendations: validate MIME/content type, add malware scanning if uploads are exposed broadly, and define retention/cleanup rules for stored files.

**Consent and identity metadata are exposed broadly to admins without retention rules:**
- Risk: IP address, user agent, and consent metadata are stored and returned directly via the admin API.
- Files: `backend/internal/models/consent.go`, `backend/internal/handlers/consents.go`
- Current mitigation: endpoints are behind admin/org authorization.
- Recommendations: add retention windows, access logging, and a deliberate privacy policy for operational data exposure.

## Performance Bottlenecks

**Schedule endpoints use per-section participant queries:**
- Problem: `AdminSchedule` and `ParticipantSchedule` load sections first and then query users separately for each section.
- Files: `backend/internal/handlers/schedule.go`
- Cause: participant loading is implemented as an N+1 loop over sections.
- Improvement path: replace the loop with batched joins grouped in memory, or query profiles once for all section IDs.

**Polling-based chat reloads full message windows repeatedly:**
- Problem: the frontend polls every 8 seconds and the backend returns the latest 150 messages each time.
- Files: `frontend/src/pages/Chat.jsx`, `backend/internal/handlers/chat.go`
- Cause: there is no incremental sync, cursoring, or websocket transport.
- Improvement path: add cursor-based pagination or realtime delivery and stop re-fetching the full active channel on every tick.

**Antiplagiat uploads read full files into memory and base64-encode them:**
- Problem: worker processing loads the entire article from disk and builds a base64 SOAP payload in memory.
- Files: `backend/internal/antiplagiat/service.go`, `backend/internal/antiplagiat/client.go`
- Cause: the SOAP integration is implemented with full-buffer request construction.
- Improvement path: bound concurrency carefully, document memory expectations, and consider streaming or pre-processing limits if submission volume grows.

**Admin and feedback-style listings are unpaginated full-table reads:**
- Problem: users, feedback, consent logs, chat windows, and other admin collections are loaded in one request.
- Files: `backend/internal/handlers/users.go`, `backend/internal/handlers/feedback.go`, `backend/internal/handlers/consents.go`, `backend/internal/handlers/chat.go`
- Cause: handlers use simple `Find`/`Order` queries without pagination or filtering.
- Improvement path: add server-side pagination and search before the dataset grows beyond test-scale usage.

## Fragile Areas

**Antiplagiat orchestration is a large state machine with limited safety rails:**
- Files: `backend/internal/antiplagiat/service.go`, `backend/internal/antiplagiat/client.go`, `backend/internal/handlers/submissions.go`, `backend/cmd/worker/main.go`
- Why fragile: one service owns queueing, leases, deadlines, upstream API calls, result mapping, and error persistence; many transient external errors are converted directly into terminal failed states.
- Safe modification: change one transition at a time, document expected status transitions, and add tests around retry, timeout, and lease behavior before refactoring.
- Test coverage: no `*_test.go` files exist for this subsystem.

**PDF generation depends on host fonts and text-repair heuristics:**
- Files: `backend/internal/handlers/documents.go`
- Why fragile: document rendering falls back through host-specific font paths and uses `normalizeText()` to repair mojibake, which means container or OS differences can change output quality.
- Safe modification: verify PDF generation in the actual deployment image and add fixture-based tests for Cyrillic output before changing fonts or text handling.
- Test coverage: no automated document rendering tests are present.

**Public section naming is derived by keyword heuristics:**
- Files: `backend/internal/handlers/sections.go`
- Why fragile: `curatePublicSections()` rewrites public titles based on substring matching rather than stable source data.
- Safe modification: replace matcher-based curation with explicit canonical section data or remove the rewriting layer entirely.
- Test coverage: no tests lock the expected public ordering or title mapping.

**Client-side auth behavior is spread across routing, layout bootstrapping, and the API helper:**
- Files: `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/lib/api.js`, `frontend/src/lib/auth.js`
- Why fragile: redirects and auth invalidation happen in multiple layers, including a hard `window.location.href` redirect from the fetch helper.
- Safe modification: centralize auth/session state before changing route guards or login/logout behavior.
- Test coverage: no frontend route or session tests exist.

## Scaling Limits

**Upload processing assumes a shared local filesystem between API and worker:**
- Current capacity: single-host deployments with a shared `backend/storage/submissions/` path.
- Limit: separate API and worker instances will fail if they do not share the same article files referenced by `ArticleSubmission.FilePath`.
- Scaling path: move uploads to object storage and store stable object keys instead of local absolute/relative paths.
- Files: `backend/internal/handlers/submissions.go`, `backend/internal/antiplagiat/service.go`, `backend/cmd/worker/main.go`, `README.md`

**Operational reads assume small tables and low traffic:**
- Current capacity: low-volume internal/admin usage where unpaginated reads and polling are acceptable.
- Limit: user, consent, feedback, and chat lists will become slower and more expensive as records accumulate.
- Scaling path: add pagination, filtering, and better sync mechanisms before data volumes become user-visible.
- Files: `backend/internal/handlers/users.go`, `backend/internal/handlers/consents.go`, `backend/internal/handlers/feedback.go`, `backend/internal/handlers/chat.go`, `frontend/src/pages/Chat.jsx`

**Stored submission files grow without a matching cleanup strategy:**
- Current capacity: bounded only by local disk space.
- Limit: deleting users removes DB rows but does not remove article files from disk, so storage usage will drift upward over time.
- Scaling path: add file lifecycle management tied to submission deletion and user cleanup workflows.
- Files: `backend/internal/handlers/submissions.go`, `backend/internal/handlers/users.go`, `backend/internal/models/antiplagiat.go`

## Dependencies at Risk

**Not detected:**
- Risk: no single dependency stands out as the primary maintenance blocker from the current repository state.
- Impact: current risk is concentrated more in custom application logic than in a specific third-party package.
- Migration plan: keep dependency review secondary to fixes in `backend/internal/antiplagiat/service.go`, `backend/cmd/server/main.go`, and the large frontend page modules.

## Missing Critical Features

**No real password recovery workflow:**
- Problem: the backend exposes a forgot-password endpoint but does not issue reset tokens or deliver email.
- Blocks: self-service account recovery and production-grade auth support.
- Files: `backend/internal/handlers/auth.go`

**No durable migration and seed separation:**
- Problem: production startup still mixes schema management, data repair, and demo bootstrap behavior.
- Blocks: predictable deployments and safe environment-specific configuration.
- Files: `backend/internal/db/db.go`, `backend/cmd/server/main.go`

**No file retention or submission deletion workflow:**
- Problem: uploaded article files have no lifecycle beyond initial save and worker consumption.
- Blocks: disk management, GDPR-style deletion requests, and predictable storage costs.
- Files: `backend/internal/handlers/submissions.go`, `backend/internal/handlers/users.go`

## Test Coverage Gaps

**Backend business-critical flows are completely untested:**
- What's not tested: auth, registration, check-in, PDF generation, submission upload, Antiplagiat worker transitions, and admin CRUD handlers.
- Files: `backend/internal/handlers/auth.go`, `backend/internal/handlers/checkin.go`, `backend/internal/handlers/documents.go`, `backend/internal/handlers/submissions.go`, `backend/internal/antiplagiat/service.go`
- Risk: regressions in the highest-impact workflows can ship unnoticed because there are no Go test files in `backend/`.
- Priority: High

**Frontend route, session, and admin behavior is untested:**
- What's not tested: route guards, localStorage-backed auth state, admin tools, chat polling/editing, and dashboard submission actions.
- Files: `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Chat.jsx`, `frontend/src/pages/Dashboard.jsx`
- Risk: UI regressions will likely be caught only manually because no React tests or browser tests are present.
- Priority: High

**Project-wide test and CI scaffolding is absent:**
- What's not tested: the repository has no `*_test.go`, `*.test.*`, `*.spec.*`, GitHub Actions, or JavaScript test configuration files.
- Files: `package.json`, `frontend/package.json`, `backend/go.mod`
- Risk: there is no default path for adding verification, which encourages more untested features.
- Priority: High

---

*Concerns audit: 2026-04-02*
