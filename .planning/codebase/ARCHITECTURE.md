# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Split frontend/backend monorepo with a React SPA in `frontend/`, a Gin HTTP API in `backend/`, and a separate Go worker process for asynchronous antiplagiat checks in `backend/cmd/worker/main.go`.

**Key Characteristics:**
- The browser talks to the backend only through HTTP calls to `/api/...` assembled in `frontend/src/lib/api.js`.
- The backend is organized as thin packages, but most business logic lives directly inside handler files such as `backend/internal/handlers/submissions.go`, `backend/internal/handlers/chat.go`, and `backend/internal/handlers/documents.go`.
- There is one explicit background subsystem in `backend/internal/antiplagiat/service.go`; everything else is synchronous request/response work against GORM models in `backend/internal/models/`.
- Startup also performs state mutation: `backend/cmd/server/main.go` seeds the admin user, sections, conference data, rooms, and map markers before the server starts.

## Backend/Frontend Boundary

**HTTP boundary:**
- The SPA route shell is defined in `frontend/src/App.jsx`.
- Authenticated and anonymous UI state lives in React local state and `localStorage` via `frontend/src/lib/auth.js`.
- Every API request flows through `frontend/src/lib/api.js`, which prefixes `VITE_API_URL + "/api"`, injects the bearer token, normalizes JSON/PDF responses, and redirects on `401`.
- The API surface is registered centrally in `backend/internal/router/router.go`; there is no generated client and no shared schema package between `frontend/` and `backend/`.

**Implication for planning:**
- When an endpoint shape changes in `backend/internal/handlers/*.go`, the matching page code in `frontend/src/pages/*.jsx` must be updated manually.
- Public marketing content in `frontend/src/pages/Welcome.jsx` is currently static and does not read `backend/internal/handlers/conference.go`.

## Layers

**Frontend application layer:**
- Purpose: Browser routing, page composition, fetch orchestration, and UI-only state.
- Location: `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/`, `frontend/src/lib/`.
- Contains: Route guards, navigation shell, page-level fetch logic, polling loops, document download helpers, chat draft persistence, and map/session formatting helpers.
- Depends on: `react`, `react-router-dom`, `fetch`, and the backend `/api` contract.
- Used by: Browser entry in `frontend/src/main.jsx`.

**Frontend route shell:**
- Purpose: Keep auth-aware navigation and footer chrome around all pages.
- Location: `frontend/src/components/Layout.jsx`.
- Contains: `/me` hydration on mount, header navigation, logout, and footer legal/support links.
- Depends on: `frontend/src/lib/api.js` and `frontend/src/lib/auth.js`.
- Used by: Root route in `frontend/src/App.jsx`.

**API routing and handler layer:**
- Purpose: Define HTTP endpoints, attach auth/role middleware, and dispatch requests to handlers.
- Location: `backend/internal/router/router.go`, `backend/internal/handlers/`.
- Contains: Handler structs that receive `*gorm.DB` and occasionally `JWTSecret` or `*antiplagiat.Service`.
- Depends on: `backend/internal/auth/`, `backend/internal/models/`, `gorm`, `gin`.
- Used by: `backend/cmd/server/main.go`.

**Persistence and domain model layer:**
- Purpose: Represent persisted state and run schema migration.
- Location: `backend/internal/models/`, `backend/internal/db/db.go`.
- Contains: `User` and `Profile` in `backend/internal/models/user.go`, `Section` in `backend/internal/models/section.go`, `Conference` in `backend/internal/models/conference.go`, `ArticleSubmission` and `AntiplagiatConfig` in `backend/internal/models/antiplagiat.go`, plus chat, feedback, consent, room, map, check-in, and certificate models.
- Depends on: GORM tags and Postgres through `gorm.io/driver/postgres`.
- Used by: All handlers and the antiplagiat service.

**Background integration layer:**
- Purpose: Persist antiplagiat configuration, queue submission work, poll external status, and resume pending tasks after restart.
- Location: `backend/internal/antiplagiat/service.go`, `backend/internal/antiplagiat/client.go`, `backend/cmd/worker/main.go`.
- Contains: Config resolution, queue leasing, upload/check/export calls, and worker concurrency control.
- Depends on: `backend/internal/models/antiplagiat.go`, `gorm`, `net/http`, and external SOAP endpoints.
- Used by: `backend/internal/handlers/submissions.go` and the worker entrypoint.

## Data Flow

**Authentication and session hydration:**

1. `frontend/src/pages/Login.jsx` and `frontend/src/pages/Register.jsx` call `/auth/login` and `/auth/register` through `frontend/src/lib/api.js`.
2. `backend/internal/handlers/auth.go` validates the payload, hashes passwords on registration, creates `models.User` plus embedded `models.Profile`, and signs a JWT with `backend/internal/auth/jwt.go`.
3. The client stores the token in `localStorage` with `frontend/src/lib/auth.js`.
4. `frontend/src/components/Layout.jsx` calls `/me` on mount to populate the cached user object.
5. `backend/internal/auth/middleware.go` parses the bearer token and injects `user_id` and `role` into Gin context for all protected routes.

**Participant dashboard and submission flow:**

1. `frontend/src/pages/Dashboard.jsx` loads `/schedule` and `/submissions`, then manages profile editing and article upload tabs locally.
2. `/schedule` is served by `backend/internal/handlers/schedule.go`, which loads the current `User`, `Profile`, and assigned `Section`.
3. `/submissions` and upload/retry/refresh/pdf actions are handled in `backend/internal/handlers/submissions.go`.
4. `backend/internal/handlers/submissions.go` stores uploads under `backend/storage/submissions/<userID>/...`, writes `models.ArticleSubmission`, and queues work in `backend/internal/antiplagiat/service.go`.
5. `backend/cmd/worker/main.go` resumes or leases pending records and drives the external antiplagiat lifecycle until the submission is ready.
6. `frontend/src/pages/Dashboard.jsx` polls `/submissions` every 5 seconds while any item is in `uploaded`, `checking`, or `pdf_status === in_progress`.

**Documents and check-in flow:**

1. `frontend/src/pages/Documents.jsx` downloads `/documents/program`, `/documents/badge`, and `/documents/certificate`, and opens `/documents/proceedings`.
2. `backend/internal/handlers/documents.go` generates PDFs directly with `gofpdf` and badge QR codes with `go-qrcode`.
3. Badge verification is an admin-only action in `frontend/src/pages/Admin.jsx`, which posts the scanned token to `/admin/checkin/verify`.
4. `backend/internal/handlers/checkin.go` verifies the badge JWT, records `models.CheckIn`, and unlocks certificate issuance in `backend/internal/handlers/documents.go`.

**Chat and map flow:**

1. `frontend/src/pages/Chat.jsx` polls `/chat?scope=conference|section`, stores per-channel drafts in `localStorage`, and sends message mutations to `/chat` and `/chat/:id`.
2. `backend/internal/handlers/chat.go` resolves the channel from the user profile, loads author metadata, and enforces owner/admin delete rules.
3. `frontend/src/pages/Map.jsx` combines `/schedule/with-participants` and `/rooms` to build a floor/room view for current sessions and speakers.
4. The current map page does not call `/map/markers` or `/map/routes`, even though those APIs exist in `backend/internal/handlers/map_markers.go` and `backend/internal/handlers/map_routes.go`.

## State Management

**Frontend state management:**
- There is no global state library.
- Auth state is split between `localStorage` in `frontend/src/lib/auth.js` and per-component `useState`.
- Server data is fetched directly inside pages such as `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Chat.jsx`, and `frontend/src/pages/Map.jsx`.
- Polling is page-local and implemented with `setInterval` in `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Chat.jsx`, and `frontend/src/pages/Map.jsx`.

**Backend state management:**
- All durable state lives in Postgres models migrated by `backend/internal/db/db.go`.
- Upload files are stored on disk under `backend/storage/submissions/`.
- The worker uses DB columns like `next_poll_at`, `worker_id`, and `worker_lease_until` in `backend/internal/models/antiplagiat.go` as its queue/lease mechanism.

## Key Abstractions

**User/Profile split:**
- Purpose: Keep credentials and role data in `models.User`, while participant-facing personal data lives in `models.Profile`.
- Examples: `backend/internal/models/user.go`, `backend/internal/handlers/auth.go`, `backend/internal/handlers/users.go`.
- Pattern: Handlers usually load `User` with `Preload("Profile")` and treat the profile as the editable participant record.

**Conference singleton:**
- Purpose: Store one mutable conference configuration for dates, status, support contact, and proceedings URL.
- Examples: `backend/internal/models/conference.go`, `backend/internal/handlers/conference.go`, `backend/internal/handlers/documents.go`.
- Pattern: `ConferenceHandler.getOrCreateConference()` in `backend/internal/handlers/conference.go` assumes a single effective row, ordered by `id asc`.

**Section-centered scheduling:**
- Purpose: Use `Section` as the shared join point across registration, schedule views, room assignment, and section chat scope.
- Examples: `backend/internal/models/section.go`, `backend/internal/handlers/schedule.go`, `backend/internal/handlers/sections.go`, `frontend/src/pages/Register.jsx`, `frontend/src/pages/Map.jsx`.
- Pattern: The frontend and backend both derive participant placement from `Profile.SectionID`.

**Submission lifecycle record:**
- Purpose: Track uploaded article files, antiplagiat status, report links, deadlines, and worker lease fields in one row.
- Examples: `backend/internal/models/antiplagiat.go`, `backend/internal/handlers/submissions.go`, `backend/internal/antiplagiat/service.go`, `frontend/src/pages/Dashboard.jsx`.
- Pattern: The request handler creates the record and the worker mutates it over time.

## Entry Points

**Frontend browser entry:**
- Location: `frontend/src/main.jsx`
- Triggers: Vite bootstraps the SPA from `frontend/index.html`.
- Responsibilities: Mount `BrowserRouter`, render `App`, and attach global DOM observers for reveal/parallax effects.

**Frontend route table:**
- Location: `frontend/src/App.jsx`
- Triggers: Navigation inside the SPA.
- Responsibilities: Declare public, protected, and admin-only routes and wrap everything inside `Layout`.

**API server entry:**
- Location: `backend/cmd/server/main.go`
- Triggers: `npm run api` or the backend container.
- Responsibilities: Load config, connect/migrate DB, seed baseline data, construct the antiplagiat service, build the Gin engine, and run the HTTP server.

**Worker entry:**
- Location: `backend/cmd/worker/main.go`
- Triggers: `npm run worker` or the worker container.
- Responsibilities: Load config, reconnect DB, resume pending submission jobs, and run one or more worker loops.

## Error Handling

**Strategy:** Inline handler-level validation and explicit HTTP status responses.

**Patterns:**
- Backend handlers in `backend/internal/handlers/*.go` use `c.ShouldBindJSON(...)` or `c.FormFile(...)`, then return `gin.H{"error": ...}` on failure.
- `frontend/src/lib/api.js` unwraps JSON error payloads, throws `Error`, clears auth on `401`, and leaves most page-level UX to `alert(...)` or local error state.
- Long-running background errors are stored on `models.ArticleSubmission.ErrorDetails` in `backend/internal/models/antiplagiat.go` and surfaced back through `/submissions`.

## Notable Coupling

- `backend/internal/router/router.go` manually constructs every handler; adding a new backend dependency usually requires edits both in the handler file and in router setup.
- Most CRUD and query logic lives in handlers rather than a separate service layer, so files like `backend/internal/handlers/chat.go`, `backend/internal/handlers/documents.go`, and `backend/internal/handlers/schedule.go` couple HTTP concerns directly to GORM queries and response shaping.
- `frontend/src/pages/Admin.jsx` is a large multi-domain page that owns users, sections, rooms, consents, conference settings, antiplagiat config, and check-in. Changes to any admin feature usually start there.
- `frontend/src/pages/Welcome.jsx` contains hardcoded conference content, while `backend/internal/handlers/conference.go` exposes editable conference state separately.
- `frontend/src/pages/Map.jsx` uses `/rooms` plus `/schedule/with-participants`; the route/marker subsystem in `backend/internal/handlers/map_markers.go` and `backend/internal/handlers/map_routes.go` is not wired into that page.

## Cross-Cutting Concerns

**Logging:** `gin.Default()` in `backend/internal/router/router.go` provides request logging, while server and worker startup/status logs use `log.Printf` in `backend/cmd/server/main.go`, `backend/cmd/worker/main.go`, and `backend/internal/antiplagiat/service.go`.

**Validation:** Request validation is manual and close to the endpoint in files such as `backend/internal/handlers/auth.go`, `backend/internal/handlers/sections.go`, `backend/internal/handlers/submissions.go`, and `backend/internal/handlers/checkin.go`.

**Authentication:** JWT creation lives in `backend/internal/auth/jwt.go`; route protection is enforced with `backend/internal/auth/middleware.go`; frontend route guards are local components in `frontend/src/App.jsx`.

---

*Architecture analysis: 2026-04-02*
