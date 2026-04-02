# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- Go 1.24.5 - backend API server, background worker, database layer, and antiplagiat integration in `backend/cmd/server/main.go`, `backend/cmd/worker/main.go`, and `backend/internal/**`
- JavaScript with JSX and ES modules - browser SPA in `frontend/src/main.jsx`, `frontend/src/App.jsx`, and `frontend/src/pages/*.jsx`

**Secondary:**
- CSS - global UI styling in `frontend/src/index.css`
- YAML - service orchestration in `docker-compose.yml`
- Nginx config - frontend serving and reverse proxy rules in `frontend/nginx.conf`
- SQL schema-by-model - defined indirectly through GORM models in `backend/internal/models/*.go` and migrated in `backend/internal/db/db.go`

## Runtime

**Environment:**
- Go toolchain 1.24.5 declared in `backend/go.mod` and used in `backend/Dockerfile`
- Node.js 22 for frontend build stages in `frontend/Dockerfile`
- Nginx 1.29-alpine for production static serving in `frontend/Dockerfile`
- PostgreSQL 16 as the primary data store in `docker-compose.yml`

**Package Manager:**
- `npm` - used for repo-level task orchestration in `package.json` and frontend dependency management in `frontend/package.json`
- Lockfile: present for the frontend only in `frontend/package-lock.json`
- Go modules - backend dependency management in `backend/go.mod` and `backend/go.sum`
- Root Node lockfile: missing; the root `package.json` is scripts-only

## Frameworks

**Core:**
- Gin 1.11.0 - HTTP routing, middleware, and JSON API handling in `backend/internal/router/router.go`
- GORM 1.31.1 with `gorm.io/driver/postgres` 1.6.0 - Postgres access and auto-migrations in `backend/internal/db/db.go`
- React 19.2.0 - frontend rendering in `frontend/src/main.jsx`
- React Router DOM 7.13.0 - client-side routing and access guards in `frontend/src/App.jsx`

**Testing:**
- Not detected - no `jest`, `vitest`, `playwright`, or similar test config files were found under the repository root or `frontend/`

**Build/Dev:**
- Vite 7.2.4 with `@vitejs/plugin-react` 5.1.1 - local dev server and production bundling in `frontend/vite.config.js`
- ESLint 9.39.1 - frontend linting in `frontend/eslint.config.js`
- Docker Compose - four-service local/prod-style stack in `docker-compose.yml`
- Multi-stage Dockerfiles - Go binary builds in `backend/Dockerfile` and static frontend bundle builds in `frontend/Dockerfile`
- Nginx reverse proxy - routes `/api/` and `/health` to the Go API in `frontend/nginx.conf`

## Key Dependencies

**Critical:**
- `github.com/gin-gonic/gin` - all API endpoints are registered through `backend/internal/router/router.go`
- `gorm.io/gorm` and `gorm.io/driver/postgres` - persistence and schema migration for users, submissions, conference config, chat, map, feedback, and check-ins in `backend/internal/db/db.go`
- `github.com/golang-jwt/jwt/v5` - session JWTs and badge QR tokens in `backend/internal/auth/jwt.go`, `backend/internal/handlers/documents.go`, and `backend/internal/handlers/checkin.go`
- `github.com/jung-kurt/gofpdf` - PDF generation for conference program, badge, and certificate endpoints in `backend/internal/handlers/documents.go`
- `github.com/skip2/go-qrcode` - QR badge generation in `backend/internal/handlers/documents.go`
- `react`, `react-dom`, and `react-router-dom` - SPA shell, routing, and protected navigation in `frontend/src/main.jsx` and `frontend/src/App.jsx`

**Infrastructure:**
- `github.com/gin-contrib/cors` - CORS policy configured from env in `backend/internal/router/router.go`
- `golang.org/x/crypto/bcrypt` - password hashing in `backend/cmd/server/main.go` and `backend/internal/handlers/auth.go`
- Browser `fetch` - frontend API transport in `frontend/src/lib/api.js`
- Docker named volumes - Postgres persistence and submission file persistence in `docker-compose.yml`

## Configuration

**Environment:**
- Backend env loading is implemented in `backend/internal/config/config.go`; it reads `.env` from the working directory or repo root and does not override already-set process env
- Frontend dev env loading is repo-root based because `frontend/vite.config.js` sets `envDir: '..'`
- `.env.example` documents the shared local configuration contract in `.env.example`
- A repo-root `.env` file is present for local configuration; its contents were not read
- Antiplagiat runtime config can be stored in Postgres via admin endpoints in `backend/internal/handlers/submissions.go` and then overridden by `ANTIPLAGIAT_*` env vars in `backend/internal/antiplagiat/service.go`

**Build:**
- Root task entry points: `npm run dev`, `npm run build`, `npm run lint`, `npm run api`, and `npm run worker` in `package.json`
- Frontend production flow: `vite build` outputs static assets served by Nginx as defined in `frontend/Dockerfile`
- Backend production flow: `backend/Dockerfile` compiles separate `server` and `worker` binaries
- Runtime proxy contract: `frontend/nginx.conf` expects the API service to be reachable as `api:8080`

## Platform Requirements

**Development:**
- Postgres must be available through `DATABASE_URL`; `README.md` recommends `docker compose up -d db`
- Go is required to run `backend/cmd/server` and `backend/cmd/worker`
- Node/npm is required to run `frontend/` via Vite
- Shared local env values come from repo-root `.env.example` into `.env`

**Production:**
- Deployment shape is container-based with `db`, `api`, `worker`, and `frontend` services in `docker-compose.yml`
- `api` and `worker` share the `submission-data` volume because uploaded article files live on the local filesystem
- Frontend production traffic is served on port 80 by Nginx and proxied to the API container via `frontend/nginx.conf`
- No serverless config, PaaS manifest, or CI deployment config was detected

---

*Stack analysis: 2026-04-02*
