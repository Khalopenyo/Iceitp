# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:**
- No repo-authored frontend or backend test framework is configured for actual test suites.
- Backend packages can be executed through the Go test runner, but `go test ./...` currently acts only as a compile/smoke check because every package reports `[no test files]`.
- Config files such as `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`, and `.github/workflows/*` are not detected in the repository root or `frontend/`.

**Assertion Library:**
- Not detected.
- `github.com/stretchr/testify` appears only in `backend/go.sum`, not as an active repo-authored testing dependency with corresponding `_test.go` files.

**Run Commands:**
```bash
npm run lint              # Frontend ESLint check from `package.json`; fails on 2026-04-02
npm run build             # Frontend production build via Vite; passed on 2026-04-02
cd backend && go test ./...   # Backend compile/smoke check; passed with [no test files]
```

## Test File Organization

**Location:**
- No repo-authored test files were found under `backend/` or `frontend/src/`.
- The only `.test.*` and `.spec.*` files found are inside `frontend/node_modules/`, which are dependency internals and not part of project verification.

**Naming:**
- No `*_test.go`, `*.test.js`, `*.test.jsx`, or `*.spec.*` files are present in application code.

**Structure:**
```text
Not applicable: the repository currently has no committed application test tree.
```

## Test Structure

**Suite Organization:**
```typescript
Not applicable. There are no repo-authored suites to mirror yet.
```

**Patterns:**
- Verification is primarily manual. `README.md` describes local startup via Docker Compose and separate backend/frontend processes, then expects a human to exercise flows in the running app.
- The backend also includes seed-oriented smoke paths rather than tests. Examples: startup seeding in `backend/cmd/server/main.go` and admin demo seeding in `backend/internal/handlers/schedule.go`.
- A one-off debug utility exists in `backend/tmp_antiplag_debug.go` for manual Antiplagiat checks. Treat it as ad hoc investigation code, not as a repeatable automated test harness.

## Mocking

**Framework:** Not detected

**Patterns:**
```typescript
No mocking libraries or mock helpers are present in repo-authored code.
```

**What to Mock:**
- No established project pattern exists yet.
- If tests are added, external boundaries such as the Antiplagiat client in `backend/internal/antiplagiat/client.go`, browser storage used by `frontend/src/lib/auth.js`, and network calls wrapped by `frontend/src/lib/api.js` are the obvious first seams.

**What NOT to Mock:**
- There is no current guidance in code. Because the app relies heavily on handler-to-DB behavior in `backend/internal/handlers/*.go`, future tests should avoid mocking basic request validation branches that can be covered with real HTTP handlers and a test DB.

## Fixtures and Factories

**Test Data:**
```typescript
Current project pattern uses seed data instead of fixtures:
- `backend/cmd/server/main.go` seeds admin user, sections, conference, rooms, and map markers
- `backend/internal/handlers/schedule.go` seeds demo sections and demo users through `SeedDemo`
- `frontend/src/data/rooms.js` provides static room fallbacks for UI rendering
```

**Location:**
- Seed/bootstrap data lives in `backend/cmd/server/main.go` and `backend/internal/handlers/schedule.go`.
- Frontend fallback display data lives in `frontend/src/data/rooms.js`.

## Coverage

**Requirements:** None enforced
- No coverage thresholds, no coverage scripts, and no coverage reports are configured in `package.json`, `frontend/package.json`, or Go tooling files.

**View Coverage:**
```bash
Not available: no coverage command is configured.
```

## Current Verification & CI Signals

**Local quality gates:**
- `npm run lint` is the only configured lint step. It currently fails in `frontend/src/pages/Feedback.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, and `frontend/src/pages/Map.jsx`.
- The lint failures are concrete:
  - unused `err` parameters in `frontend/src/pages/Feedback.jsx`, `frontend/src/pages/Login.jsx`, and `frontend/src/pages/Register.jsx`
  - `react-hooks/set-state-in-effect` violations in `frontend/src/pages/Map.jsx`
- `npm run build` succeeds and produced a production bundle on 2026-04-02.
- `go test ./...` succeeds, but only because there are no backend test files to execute.

**CI signals:**
- No GitHub Actions or other CI pipeline configuration is present. `.github/workflows/*` is absent.
- No root-level `test` script exists in `package.json`. The root scripts are `dev`, `build`, `lint`, `api`, and `worker`.
- `frontend/package.json` also lacks a `test` script; it only exposes `dev`, `build`, `lint`, and `preview`.

## Test Types

**Unit Tests:**
- Not used.
- Helper-heavy modules that would benefit first from unit coverage include `frontend/src/lib/api.js`, `frontend/src/lib/sessionStatus.js`, `backend/internal/auth/jwt.go`, and normalization helpers inside `backend/internal/handlers/sections.go` and `frontend/src/pages/Map.jsx`.

**Integration Tests:**
- No automated HTTP or DB integration suite is committed.
- The closest thing to integration verification is manual end-to-end exercise against the running stack described in `README.md`, plus compile-time Go checks.
- Backend routes and role gates in `backend/internal/router/router.go`, `backend/internal/auth/middleware.go`, and `backend/internal/auth/jwt.go` are currently unguarded by automated regression tests.

**E2E Tests:**
- Not used.
- No Playwright, Cypress, Selenium, or browser-automation configuration is detected.

## Common Patterns

**Async Testing:**
```typescript
Current async verification is manual:
- Polling behavior in `frontend/src/pages/Chat.jsx` and `frontend/src/pages/Dashboard.jsx`
- Background worker behavior in `backend/cmd/worker/main.go`
- External API coordination in `backend/internal/antiplagiat/service.go`
These flows have no automated timing or retry assertions.
```

**Error Testing:**
```typescript
No automated error assertions exist.
Backend handlers do expose clear status/error branches suitable for future table-driven tests:
- `backend/internal/handlers/auth.go`
- `backend/internal/handlers/submissions.go`
- `backend/internal/handlers/chat.go`
- `backend/internal/handlers/conference.go`
```

## Gaps and Risks

- Large, stateful frontend modules such as `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Chat.jsx`, `frontend/src/pages/Dashboard.jsx`, and `frontend/src/pages/Register.jsx` have no automated UI or behavior coverage.
- Security-sensitive flows including token parsing in `backend/internal/auth/middleware.go`, token creation in `backend/internal/auth/jwt.go`, and role-based route protection in `backend/internal/router/router.go` are untested.
- Document generation and check-in paths in `backend/internal/handlers/documents.go` and `backend/internal/handlers/checkin.go` have no regression suite despite user-visible PDF and QR behavior.
- The Antiplagiat integration path in `backend/internal/handlers/submissions.go`, `backend/internal/antiplagiat/client.go`, and `backend/internal/antiplagiat/service.go` depends on external systems and background timing, but only manual smoke verification exists.
- Because lint is already failing, `npm run lint` is not currently a reliable merge gate until the existing issues are fixed.

---

*Testing analysis: 2026-04-02*
