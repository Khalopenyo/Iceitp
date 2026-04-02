# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Plagiarism Checking:**
- Antiplagiat corporate SOAP API - upload article files, start checks, poll status, fetch report links, and request PDF exports
  - SDK/Client: custom SOAP client in `backend/internal/antiplagiat/client.go`
  - Auth: `ANTIPLAGIAT_SITE_URL`, `ANTIPLAGIAT_WSDL_URL`, `ANTIPLAGIAT_API_LOGIN`, `ANTIPLAGIAT_API_PASSWORD`, and `ANTIPLAGIAT_ENABLED`
  - Runtime executor: `backend/internal/antiplagiat/service.go`
  - Background processing entry point: `backend/cmd/worker/main.go`
  - Admin control surface: `frontend/src/pages/Admin.jsx`

**Frontend to Backend API:**
- Browser SPA talks to the Go API over JSON and multipart HTTP under `/api`
  - SDK/Client: browser `fetch` wrapper in `frontend/src/lib/api.js`
  - Auth: Bearer JWT from `frontend/src/lib/auth.js`
  - Proxy boundary: `frontend/nginx.conf` forwards `/api/` to `http://api:8080`
  - Route registry: `backend/internal/router/router.go`

**Public Document Linking:**
- Proceedings are not generated locally; the system stores an external PDF URL and returns it to the browser
  - Source field: `backend/internal/models/conference.go`
  - API endpoint: `backend/internal/handlers/documents.go`
  - Browser open behavior: `frontend/src/pages/Documents.jsx`

## Data Storage

**Databases:**
- PostgreSQL 16
  - Connection: `DATABASE_URL`
  - Client: GORM in `backend/internal/db/db.go`
  - Schema source: model structs under `backend/internal/models/*.go`
  - Migration strategy: `AutoMigrate` runs on startup in `backend/internal/db/db.go`

**File Storage:**
- Local filesystem only
  - Upload path builder: `StoragePath` in `backend/internal/antiplagiat/service.go`
  - Layout: `storage/submissions/{userID}/timestamp-filename`
  - Persistence in containers: shared `submission-data` volume in `docker-compose.yml`
  - Proceedings PDF storage: not local; it is a URL stored on the conference record in `backend/internal/models/conference.go`

**Caching:**
- None detected
  - Antiplagiat async state is persisted in Postgres fields such as `next_poll_at`, `worker_id`, `worker_lease_until`, `processing_deadline_at`, and `pdf_deadline_at` in `backend/internal/models/antiplagiat.go`

## Authentication & Identity

**Auth Provider:**
- Custom JWT auth
  - Implementation: tokens are issued in `backend/internal/auth/jwt.go` and validated in `backend/internal/auth/middleware.go`
  - Client storage: token and user payload are kept in `localStorage` in `frontend/src/lib/auth.js`
  - Access model: admin/org route restrictions are applied in `backend/internal/router/router.go`

**Check-in Identity:**
- Badge QR token flow
  - Token generation: `backend/internal/handlers/documents.go`
  - Verification endpoint: `backend/internal/handlers/checkin.go`
  - Persistence: `backend/internal/models/checkin.go`

## Document and Media Generation

**Generated Documents:**
- PDF program, badge, and certificate generation happens in-process in `backend/internal/handlers/documents.go`
  - Library: `github.com/jung-kurt/gofpdf`
  - Output endpoints: `/documents/program`, `/documents/badge`, `/documents/certificate`

**QR Codes:**
- Badge QR images are generated at request time in `backend/internal/handlers/documents.go`
  - Library: `github.com/skip2/go-qrcode`
  - Consumer: admin badge verification flow in `backend/internal/handlers/checkin.go`

**Fonts and Asset Dependency:**
- PDF rendering looks for `backend/assets/fonts/DejaVuSans.ttf` first and then falls back to system fonts in `backend/internal/handlers/documents.go`
  - Bundled font file: not detected in the repository

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Standard library logging in `backend/cmd/server/main.go`, `backend/cmd/worker/main.go`, and `backend/internal/antiplagiat/service.go`
- Health endpoint: `/health` in `backend/internal/router/router.go`
- Container health checks: `docker-compose.yml` probes both the API and frontend

## CI/CD & Deployment

**Hosting:**
- Docker Compose stack with `db`, `api`, `worker`, and `frontend` services in `docker-compose.yml`
- Frontend serves static assets via Nginx and proxies backend traffic through `frontend/nginx.conf`

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` and `JWT_SECRET` are required by `backend/internal/config/config.go`
- `PORT`, `CORS_ORIGINS`, and `TRUSTED_PROXIES` shape API runtime in `backend/internal/config/config.go`
- `VITE_API_URL` controls frontend dev API routing in `frontend/src/lib/api.js` and is documented in `.env.example`
- `ANTIPLAGIAT_BOOTSTRAP_TEST_CONFIG`, `ANTIPLAGIAT_WORKER_CONCURRENCY`, and `ANTIPLAGIAT_WORKER_ID` control worker behavior in `backend/cmd/worker/main.go`, `backend/cmd/server/main.go`, and `.env.example`

**Secrets location:**
- Local development uses a repo-root `.env` referenced by `README.md`, `backend/internal/config/config.go`, and `frontend/vite.config.js`
- Antiplagiat credentials can also be saved in Postgres through `/api/admin/antiplagiat/config` handled by `backend/internal/handlers/submissions.go`
- Runtime precedence: environment values override stored database values in `backend/internal/antiplagiat/service.go`

## Internal Integration Boundaries

**API Server to Worker:**
- `backend/internal/handlers/submissions.go` writes submission rows and files, then marks work for background processing
- `backend/cmd/worker/main.go` resumes pending work and processes it using the same Postgres database plus the shared storage volume
- Coordination state lives in `backend/internal/models/antiplagiat.go` and `backend/internal/antiplagiat/service.go`

**Admin UI to Antiplagiat Config:**
- `frontend/src/pages/Admin.jsx` edits integration settings and fetches available check services
- `backend/internal/handlers/submissions.go` persists config and exposes ping and service-list endpoints
- `backend/internal/antiplagiat/service.go` merges DB config with env overrides before creating the SOAP client

**Frontend Shell to Authenticated API:**
- `frontend/src/components/Layout.jsx` refreshes the current user through `/me`
- `frontend/src/lib/api.js` normalizes auth headers and response handling
- `backend/internal/router/router.go` splits anonymous, authenticated, and admin-only endpoints

## Webhooks & Callbacks

**Incoming:**
- None
  - Antiplagiat is polled through `GetCheckStatus` and `ExportReportToPDF` in `backend/internal/antiplagiat/client.go`; no webhook receiver exists in `backend/internal/router/router.go`

**Outgoing:**
- SOAP requests to Antiplagiat from `backend/internal/antiplagiat/client.go`
- Browser opens external report links and proceedings URLs from `frontend/src/pages/Dashboard.jsx` and `frontend/src/pages/Documents.jsx`
- No email, SMS, payment, cloud storage, or third-party identity callbacks were detected

---

*Integration audit: 2026-04-02*
