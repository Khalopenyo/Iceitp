# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- Backend Go files use lowercase domain names that match the package responsibility, for example `backend/internal/handlers/auth.go`, `backend/internal/handlers/chat.go`, `backend/internal/models/user.go`, and `backend/internal/router/router.go`.
- Frontend React pages and components use PascalCase filenames with `.jsx`, for example `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Dashboard.jsx`, and `frontend/src/components/Layout.jsx`.
- Frontend helper and data modules use lowercase filenames with `.js`, for example `frontend/src/lib/api.js`, `frontend/src/lib/auth.js`, `frontend/src/lib/sessionStatus.js`, and `frontend/src/data/rooms.js`.

**Functions:**
- Go exported handlers and helpers use PascalCase, for example `Register`, `ListMessages`, `GetConference`, `GenerateToken`, and `Setup` in `backend/internal/handlers/auth.go`, `backend/internal/handlers/chat.go`, `backend/internal/handlers/conference.go`, `backend/internal/auth/jwt.go`, and `backend/internal/router/router.go`.
- Go file-local helpers use lowerCamelCase, for example `normalizeSectionTitle` in `backend/internal/handlers/sections.go` and `envInt` in `backend/cmd/worker/main.go`.
- React components use PascalCase function names and default exports, for example `Layout`, `App`, `Login`, and `Chat` in `frontend/src/components/Layout.jsx`, `frontend/src/App.jsx`, `frontend/src/pages/Login.jsx`, and `frontend/src/pages/Chat.jsx`.
- Frontend local helpers use lowerCamelCase, for example `formatTimeOnly`, `submissionStatusLabel`, `openExternal`, `normalizeRooms`, and `filterMessages` in `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Map.jsx`, and `frontend/src/pages/Chat.jsx`.

**Variables:**
- React state consistently uses `[value, setValue]` naming, for example `const [profile, setProfile] = useState(null)` in `frontend/src/pages/Dashboard.jsx` and `const [antiplagiatForm, setAntiplagiatForm] = useState(...)` in `frontend/src/pages/Admin.jsx`.
- Handler receivers are consistently named `h` in backend files such as `backend/internal/handlers/users.go`, `backend/internal/handlers/sections.go`, and `backend/internal/handlers/submissions.go`.
- Short infrastructure names like `db`, `cfg`, `r`, `tx`, and `ctx` are used heavily in backend wiring files such as `backend/cmd/server/main.go`, `backend/internal/db/db.go`, and `backend/internal/antiplagiat/service.go`.

**Types:**
- Backend domain types are PascalCase structs and named string aliases, for example `User`, `Profile`, `Conference`, `Claims`, `Config`, `Role`, and `ConferenceStatus` in `backend/internal/models/user.go`, `backend/internal/models/conference.go`, `backend/internal/auth/jwt.go`, and `backend/internal/config/config.go`.
- Frontend has no shared type system or TypeScript layer. API payload shape is inferred from object literals and backend JSON tags in files such as `frontend/src/pages/Register.jsx` and `frontend/src/pages/Admin.jsx`.

## Code Style

**Formatting:**
- No Prettier or Biome config is present at the repo root or in `frontend/`. Formatting is convention-based rather than tool-enforced.
- Frontend application code in `frontend/src/**/*.jsx` and `frontend/src/lib/*.js` mostly uses double quotes and semicolons. Examples: `frontend/src/App.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/lib/api.js`.
- Frontend scaffold/config files keep the Vite scaffold style of single quotes and no semicolons in `frontend/vite.config.js` and `frontend/eslint.config.js`. Preserve the surrounding file style instead of forcing a repo-wide JS style that is not configured.
- Backend Go code appears `gofmt`-formatted, with standard import grouping and tab alignment in files such as `backend/internal/router/router.go`, `backend/internal/config/config.go`, and `backend/internal/handlers/chat.go`.

**Linting:**
- Only frontend linting is configured. `frontend/eslint.config.js` enables `@eslint/js`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`.
- The only explicit custom rule is `no-unused-vars` with `varsIgnorePattern: '^[A-Z_]'` in `frontend/eslint.config.js`.
- No Go linter config such as `golangci-lint` or `staticcheck` is detected in the repository.

## Import Organization

**Order:**
1. Go files group standard-library imports, then internal module imports like `conferenceplatforma/internal/...`, then third-party imports. Examples: `backend/cmd/server/main.go`, `backend/internal/handlers/auth.go`.
2. Frontend files usually import React hooks or router helpers first, then local modules. Examples: `frontend/src/components/Layout.jsx`, `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Chat.jsx`.
3. CSS imports are kept close to the entry point in `frontend/src/main.jsx`.

**Path Aliases:**
- No frontend path aliases are configured. Imports are relative, for example `../lib/api.js` and `./pages/Login.jsx`.
- Backend imports use the module path `conferenceplatforma/...` from `backend/go.mod`.

## Error Handling

**Patterns:**
- Backend handlers use early returns after validation or DB failures and respond with `c.JSON(status, gin.H{"error": ...})`. See `backend/internal/handlers/auth.go`, `backend/internal/handlers/users.go`, `backend/internal/handlers/conference.go`, and `backend/internal/handlers/submissions.go`.
- More complex backend endpoints add a `details` field when surfacing upstream failures, for example `RetrySubmission`, `RefreshSubmission`, `RequestPDF`, `SaveConfig`, and `PingConfig` in `backend/internal/handlers/submissions.go`.
- Frontend network calls are centralized in `frontend/src/lib/api.js`. `request()` attaches the bearer token, normalizes error payloads into `Error` objects, redirects to `/login` on `401`, and throws on `403` or other non-OK responses.
- Frontend pages usually handle failures with local fallback state plus `alert()` or inline error text. Examples: `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/pages/Feedback.jsx`, `frontend/src/pages/Documents.jsx`, and `frontend/src/pages/Chat.jsx`.

## Logging

**Framework:** standard library logging on the backend, no frontend logging framework

**Patterns:**
- Backend startup and infrastructure failures use `log.Printf` and `log.Fatal` in `backend/cmd/server/main.go`, `backend/cmd/worker/main.go`, `backend/internal/config/config.go`, and `backend/internal/db/db.go`.
- The Antiplagiat service logs operational worker events and retry behavior with the standard `log` package in `backend/internal/antiplagiat/service.go`.
- Frontend code does not use `console.log` for normal flow; user feedback is primarily UI-driven.

## Comments

**When to Comment:**
- Comments are sparse and usually explain intent around seed or setup logic, not individual assignments. Examples: `backend/cmd/server/main.go` comments around preset rooms and markers, `backend/internal/config/config.go` comments inside `loadDotEnv()`, and `frontend/src/main.jsx` section headers for observer/parallax behavior.
- Large UI modules such as `frontend/src/pages/Admin.jsx` and `frontend/src/pages/Chat.jsx` mostly rely on descriptive helper names rather than comments.

**JSDoc/TSDoc:**
- Not used. No JSDoc, TSDoc, or Go doc comments are relied on for internal modules.

## Function Design

**Size:** large page modules and service files are normal in this repo
- The frontend favors feature-rich page files that keep helpers, local state, event handlers, and rendering together. `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Chat.jsx`, `frontend/src/pages/Dashboard.jsx`, and `frontend/src/pages/Register.jsx` are the clearest examples.
- The backend keeps HTTP logic in handler files, but some files still become large when a domain is complex, such as `backend/internal/handlers/chat.go`, `backend/internal/handlers/documents.go`, `backend/internal/handlers/submissions.go`, and `backend/internal/antiplagiat/service.go`.

**Parameters:**
- Backend handler methods read request data directly from `*gin.Context` and only introduce small payload structs where needed, for example `RegisterRequest` in `backend/internal/handlers/auth.go`, `updateConferencePayload` in `backend/internal/handlers/conference.go`, and `antiplagiatConfigPayload` in `backend/internal/handlers/submissions.go`.
- Frontend event handlers usually close over component state instead of receiving many parameters. Shared helper functions accept normalized primitives or objects, for example `getSessionStatus(section, nowTs)` in `frontend/src/lib/sessionStatus.js` and `roomMatchesSection(room, sectionRoom)` in `frontend/src/pages/Map.jsx`.

**Return Values:**
- Frontend API helpers return parsed JSON by default and raw `Response` only for PDF/document flows in `frontend/src/lib/api.js`.
- Backend mutation endpoints often respond with the created/updated entity or with `gin.H{"status": "ok"}` for simple success acknowledgements. Examples: `backend/internal/handlers/users.go`, `backend/internal/handlers/sections.go`, `backend/internal/handlers/chat.go`.

## Module Design

**Exports:**
- React pages and components typically use a single default export per file, for example `frontend/src/pages/Login.jsx`, `frontend/src/pages/Documents.jsx`, and `frontend/src/components/Layout.jsx`.
- Frontend helper modules use named exports, for example `apiGet`, `apiPost`, `apiPut`, and `apiDelete` in `frontend/src/lib/api.js`, and `getToken`, `setToken`, and `setUser` in `frontend/src/lib/auth.js`.
- Backend packages expose structs plus methods rather than package-level functions for HTTP domains, for example `AuthHandler`, `UserHandler`, `SectionHandler`, and `SubmissionHandler` in `backend/internal/handlers/*.go`.

**Barrel Files:** not used
- Frontend imports target concrete files directly.
- Backend routing is wired manually in `backend/internal/router/router.go`; there is no shared barrel for handlers or models.

## Repo-Specific Patterns

**Page pattern:**
- Routeable UI lives in `frontend/src/pages/*.jsx`, with route protection handled centrally in `frontend/src/App.jsx` through `ProtectedRoute` and `AdminRoute`.
- Layout is centralized in `frontend/src/components/Layout.jsx`, which also refreshes the current user via `/me` after token changes.

**Handler pattern:**
- Backend routes are assembled in one place in `backend/internal/router/router.go`. Dependencies are constructed in `Setup()` and injected into handler structs explicitly.
- Admin endpoints are namespaced under `/api/admin`, protected first by `auth.Middleware(jwtSecret)` and then by `auth.RequireRole("admin", "org")` in `backend/internal/router/router.go`.

**Model and payload pattern:**
- Backend model fields use Go PascalCase with snake_case JSON tags, for example `SupportEmail string \`json:"support_email"\`` in `backend/internal/models/conference.go`.
- Frontend payload keys intentionally mirror backend JSON tags, so forms use keys like `user_type`, `section_id`, `talk_title`, `site_url`, and `allow_pdf_report` in `frontend/src/pages/Register.jsx` and `frontend/src/pages/Admin.jsx`.

**State management style:**
- There is no global state library. State is local to each page via `useState`, `useEffect`, and occasional `useMemo` or `useEffectEvent`, as seen in `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Map.jsx`, `frontend/src/pages/Chat.jsx`, and `frontend/src/pages/Dashboard.jsx`.
- Authentication state is persisted in `localStorage` through `frontend/src/lib/auth.js`.
- Polling is implemented manually with timers in `frontend/src/pages/Chat.jsx`, `frontend/src/pages/Dashboard.jsx`, and `frontend/src/pages/Map.jsx`.
- Static fallback data is acceptable when the API may be absent, for example `frontend/src/data/rooms.js` feeding `frontend/src/pages/Admin.jsx` and `frontend/src/pages/Map.jsx`.

**API style:**
- Frontend always talks to the backend through `frontend/src/lib/api.js`; direct `fetch` calls outside that module are not part of the app pattern.
- Backend endpoints return plain JSON objects and arrays without an additional envelope unless needed for metadata. Compare `backend/internal/handlers/users.go`, `backend/internal/handlers/sections.go`, `backend/internal/handlers/chat.go`, and `backend/internal/handlers/submissions.go`.

---

*Convention analysis: 2026-04-02*
