# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```text
ConferencePlatforma/
├── package.json                 # Root script shim for frontend dev/build and Go server/worker commands
├── README.md                    # Project-level run instructions and product summary
├── frontend/                    # React SPA, Vite build, static assets, and nginx container config
│   ├── src/
│   │   ├── components/          # Shared layout shell
│   │   ├── data/                # Frontend fallback/static data
│   │   ├── lib/                 # API, auth, and small client helpers
│   │   └── pages/               # Route-level screens
│   ├── public/                  # Public static assets
│   └── dist/                    # Built frontend output currently present in repo
└── backend/                     # Go API, worker, runtime uploads, and Go cache currently present in repo
    ├── cmd/                     # Process entrypoints
    ├── internal/                # App code by concern
    ├── storage/                 # Uploaded article files
    └── .gocache/                # Go build cache currently present in repo
```

## Directory Purposes

**`frontend/src/pages/`:**
- Purpose: Route-level UI and feature orchestration.
- Contains: `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Documents.jsx`, `frontend/src/pages/Chat.jsx`, `frontend/src/pages/Map.jsx`, `frontend/src/pages/Feedback.jsx`, `frontend/src/pages/Welcome.jsx`, plus legal/static pages.
- Key files: `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Chat.jsx`.

**`frontend/src/components/`:**
- Purpose: Shared UI shell rather than a broad component library.
- Contains: `frontend/src/components/Layout.jsx`.
- Key files: `frontend/src/components/Layout.jsx`.

**`frontend/src/lib/`:**
- Purpose: Client-side support code that pages reuse.
- Contains: API wrapper in `frontend/src/lib/api.js`, auth storage in `frontend/src/lib/auth.js`, schedule time helpers in `frontend/src/lib/sessionStatus.js`.
- Key files: `frontend/src/lib/api.js`, `frontend/src/lib/auth.js`.

**`frontend/src/data/`:**
- Purpose: Static fallback datasets used by the UI.
- Contains: `frontend/src/data/rooms.js`.
- Key files: `frontend/src/data/rooms.js`.

**`backend/cmd/`:**
- Purpose: Concrete binaries.
- Contains: HTTP server entry at `backend/cmd/server/main.go` and worker entry at `backend/cmd/worker/main.go`.
- Key files: `backend/cmd/server/main.go`, `backend/cmd/worker/main.go`.

**`backend/internal/handlers/`:**
- Purpose: HTTP endpoint logic grouped by feature.
- Contains: Auth in `backend/internal/handlers/auth.go`, users in `backend/internal/handlers/users.go`, scheduling in `backend/internal/handlers/schedule.go`, documents in `backend/internal/handlers/documents.go`, submissions in `backend/internal/handlers/submissions.go`, chat in `backend/internal/handlers/chat.go`, admin support handlers for sections, rooms, conference, check-in, consents, and map data.
- Key files: `backend/internal/handlers/documents.go`, `backend/internal/handlers/submissions.go`, `backend/internal/handlers/chat.go`, `backend/internal/handlers/conference.go`.

**`backend/internal/models/`:**
- Purpose: Persistence structs and domain enums.
- Contains: User/profile, conference, section, room, submission, chat, consent, feedback, map, check-in, and certificate models.
- Key files: `backend/internal/models/user.go`, `backend/internal/models/section.go`, `backend/internal/models/antiplagiat.go`, `backend/internal/models/conference.go`.

**`backend/internal/antiplagiat/`:**
- Purpose: External antiplagiat integration and worker logic.
- Contains: SOAP client in `backend/internal/antiplagiat/client.go` and queue/config logic in `backend/internal/antiplagiat/service.go`.
- Key files: `backend/internal/antiplagiat/service.go`, `backend/internal/antiplagiat/client.go`.

**`backend/internal/auth/`:**
- Purpose: JWT signing and request middleware.
- Contains: `backend/internal/auth/jwt.go`, `backend/internal/auth/middleware.go`.
- Key files: `backend/internal/auth/jwt.go`, `backend/internal/auth/middleware.go`.

**`backend/internal/router/`:**
- Purpose: Central route registration and middleware wiring.
- Contains: `backend/internal/router/router.go`.
- Key files: `backend/internal/router/router.go`.

**`backend/storage/`:**
- Purpose: Runtime file storage for uploaded submissions.
- Contains: Per-user directories under `backend/storage/submissions/`.
- Key files: `backend/storage/submissions/1/...`, `backend/storage/submissions/15/...`.

## Feature Map

**Authentication and current-user state:**
- Frontend: `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/lib/auth.js`.
- Backend: `backend/internal/handlers/auth.go`, `backend/internal/handlers/users.go`, `backend/internal/auth/jwt.go`, `backend/internal/auth/middleware.go`.

**Participant dashboard, profile, and submissions:**
- Frontend: `frontend/src/pages/Dashboard.jsx`, `frontend/src/lib/sessionStatus.js`.
- Backend: `backend/internal/handlers/schedule.go`, `backend/internal/handlers/submissions.go`, `backend/internal/models/antiplagiat.go`, `backend/internal/antiplagiat/service.go`.

**Documents and check-in:**
- Frontend: `frontend/src/pages/Documents.jsx`, `frontend/src/pages/Admin.jsx`.
- Backend: `backend/internal/handlers/documents.go`, `backend/internal/handlers/checkin.go`, `backend/internal/models/certificate.go`, `backend/internal/models/checkin.go`.

**Chat:**
- Frontend: `frontend/src/pages/Chat.jsx`.
- Backend: `backend/internal/handlers/chat.go`, `backend/internal/models/chat.go`.

**Conference, sections, rooms, and admin control plane:**
- Frontend: `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Welcome.jsx`.
- Backend: `backend/internal/handlers/conference.go`, `backend/internal/handlers/sections.go`, `backend/internal/handlers/rooms.go`, `backend/internal/handlers/consents.go`.

**Map and room lookup:**
- Frontend: `frontend/src/pages/Map.jsx`, `frontend/src/data/rooms.js`.
- Backend: `backend/internal/handlers/rooms.go`, `backend/internal/handlers/schedule.go`, optional map editing APIs in `backend/internal/handlers/map_markers.go` and `backend/internal/handlers/map_routes.go`.

## Key File Locations

**Entry Points:**
- `package.json`: root scripts for `dev`, `build`, `lint`, `api`, and `worker`.
- `frontend/src/main.jsx`: SPA bootstrap.
- `frontend/src/App.jsx`: route table and auth guards.
- `backend/cmd/server/main.go`: API process bootstrap and seed logic.
- `backend/cmd/worker/main.go`: antiplagiat worker bootstrap.

**Configuration:**
- `frontend/vite.config.js`: Vite config.
- `frontend/nginx.conf`: container web server config for built frontend.
- `frontend/eslint.config.js`: frontend lint rules.
- `backend/internal/config/config.go`: runtime env loading and parsing.
- `backend/go.mod`: backend module and Go dependency manifest.

**Core Logic:**
- `backend/internal/router/router.go`: route registry.
- `backend/internal/db/db.go`: DB connect and migrations.
- `backend/internal/handlers/`: HTTP feature entrypoints.
- `backend/internal/models/`: persisted data shapes.
- `backend/internal/antiplagiat/`: external integration and background processing.

**Testing:**
- Not detected. There are no visible `*.test.*`, `*.spec.*`, `*_test.go`, or dedicated test directories in the current repo layout.

## Naming Conventions

**Files:**
- Frontend route and page files use PascalCase with `.jsx`: `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/ConsentAuthors.jsx`, `frontend/src/components/Layout.jsx`.
- Frontend helper and data files use lowercase names with `.js`: `frontend/src/lib/api.js`, `frontend/src/lib/auth.js`, `frontend/src/data/rooms.js`.
- Backend files are lowercase and named by concern: `backend/internal/handlers/submissions.go`, `backend/internal/models/conference.go`, `backend/internal/auth/middleware.go`.

**Directories:**
- Backend follows Go conventions: binaries in `backend/cmd/`, internal-only code in `backend/internal/`.
- Frontend is feature-flat at the route level: screens in `frontend/src/pages/`, shared helpers in `frontend/src/lib/`, shared shell in `frontend/src/components/`.

## Where to Add New Code

**New user-facing page:**
- Implementation: create a new page file in `frontend/src/pages/`.
- Routing: register it in `frontend/src/App.jsx`.
- Shared navigation: update `frontend/src/components/Layout.jsx` if the page needs a header link.

**New frontend helper:**
- Shared fetch/auth/session logic: add to `frontend/src/lib/`.
- Static fallback/reference data: add to `frontend/src/data/`.
- Reusable shell-level UI: add to `frontend/src/components/`. The current codebase has very few shared components, so confirm reuse before creating a new abstraction.

**New backend endpoint:**
- HTTP logic: add a new handler file or extend an existing concern file in `backend/internal/handlers/`.
- Route registration: wire it in `backend/internal/router/router.go`.
- Persistence shape: add or extend the matching struct in `backend/internal/models/`.
- DB schema: rely on `backend/internal/db/db.go` `AutoMigrate(...)` to include the new model.

**New async backend integration:**
- Long-running service code: add a package under `backend/internal/` similar to `backend/internal/antiplagiat/`.
- Request trigger: call it from a handler in `backend/internal/handlers/`.
- Background execution: extend `backend/cmd/worker/main.go` only if the work must continue outside request lifetime.

**Edits to existing admin features:**
- Start in `frontend/src/pages/Admin.jsx`; most admin concerns are centralized there rather than split into subcomponents.
- Mirror backend changes in `backend/internal/handlers/conference.go`, `backend/internal/handlers/sections.go`, `backend/internal/handlers/rooms.go`, `backend/internal/handlers/checkin.go`, or `backend/internal/handlers/submissions.go` depending on the tab.

## Search Landmarks

**Where to start for auth bugs:**
- `frontend/src/lib/api.js`
- `frontend/src/lib/auth.js`
- `backend/internal/auth/middleware.go`
- `backend/internal/handlers/auth.go`

**Where to start for dashboard or submission bugs:**
- `frontend/src/pages/Dashboard.jsx`
- `backend/internal/handlers/schedule.go`
- `backend/internal/handlers/submissions.go`
- `backend/internal/antiplagiat/service.go`

**Where to start for document or check-in bugs:**
- `frontend/src/pages/Documents.jsx`
- `frontend/src/pages/Admin.jsx`
- `backend/internal/handlers/documents.go`
- `backend/internal/handlers/checkin.go`

**Where to start for map or room behavior:**
- `frontend/src/pages/Map.jsx`
- `frontend/src/data/rooms.js`
- `backend/internal/handlers/rooms.go`
- `backend/internal/handlers/schedule.go`

## Special Directories

**`frontend/dist/`:**
- Purpose: Built frontend bundle.
- Generated: Yes.
- Committed: Yes in the current repo state.

**`frontend/node_modules/`:**
- Purpose: Installed frontend dependencies.
- Generated: Yes.
- Committed: Yes in the current repo state.

**`backend/.gocache/`:**
- Purpose: Go build cache.
- Generated: Yes.
- Committed: Yes in the current repo state.

**`backend/storage/submissions/`:**
- Purpose: Uploaded source files for article checks.
- Generated: Yes, at runtime by `backend/internal/handlers/submissions.go`.
- Committed: Yes in the current repo state.

---

*Structure analysis: 2026-04-02*
