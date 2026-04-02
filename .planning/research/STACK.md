# Research: Stack

**Analysis Date:** 2026-04-02
**Project Type:** Brownfield conference platform for one scientific conference
**Current Foundation:** `Go + Gin + GORM + Postgres` in `backend/`, `React + Vite` in `frontend/`

## Recommendation

Keep the current application stack. The missing product capabilities do not justify a platform rewrite.

Use the existing backend/frontend split and add a small number of focused technical capabilities:

- consent versioning and auditability
- online/offline participation branching in the data model and UI
- password reset by email with secure single-use tokens
- chat attachment storage and metadata handling
- branded conference content fields and responsive UI cleanup
- external videoconference links at conference/session level

## Keep As-Is

These choices already fit the product:

- `Gin` for HTTP routing in `backend/internal/router/router.go`
- `GORM` for relational persistence in `backend/internal/db/db.go`
- `Postgres` as the primary database in `docker-compose.yml`
- `React` and `React Router` for SPA routing and protected views in `frontend/src/App.jsx`
- Vite-based frontend build and Nginx serving in `frontend/vite.config.js` and `frontend/Dockerfile`
- server-side PDF generation in `backend/internal/handlers/documents.go`

## Recommended Additions

### 1. Mailer abstraction for password reset

Add a backend mailer interface rather than hard-coding SMTP logic into handlers.

Recommended shape:

- `backend/internal/mail/` with provider interface
- environment-driven provider configuration
- support either SMTP or a transactional mail API
- token email templates stored in backend or template files

Why:

- the current code has a placeholder forgot-password endpoint in `backend/internal/handlers/auth.go`
- password recovery is a first-release requirement
- mail delivery should remain swappable without changing handler logic

What not to add:

- do not add a full notification/event bus for v1
- do not tie password reset to admin-only manual flows

### 2. Password reset token persistence

Add a dedicated reset-token model in `backend/internal/models/` with:

- user reference
- hashed token value
- expiration timestamp
- consumed timestamp
- creation metadata for auditing and rate-limiting

Why:

- OWASP forgot-password guidance recommends single-use, expiring, high-entropy tokens with uniform responses
- the current auth flow has login/registration only

### 3. Attachment storage abstraction for chat files

Do not attach raw file handling directly to the chat handler. Add a storage service boundary first.

Recommended shape:

- `backend/internal/storage/` abstraction
- local filesystem driver for development/single-host deployment
- object-storage-compatible driver later if needed
- attachment metadata table for original filename, safe storage key, MIME type, size, uploader, chat scope

Why:

- the project already stores submission files locally in `backend/internal/handlers/submissions.go`
- chat attachments have different access rules and security risks than article submissions
- using a storage abstraction now avoids coupling future file features to local disk paths

What not to add:

- do not expose upload directories directly from the web server
- do not trust client file names or file extensions

### 4. Consent text versioning

Extend the existing consent capability in `backend/internal/models/consent.go` and related handlers to store:

- consent type
- text version identifier
- accepted-at timestamp
- IP/user-agent capture where legally appropriate
- explicit publication consent separate from general processing consent if the published program exposes participant data

Why:

- Russian personal-data rules require explicit, informed consent practices
- publication/distribution consent can be a stricter case than ordinary operational processing

### 5. Conference content and branding fields

The current `conference` entity should become the source of branded platform content for:

- university/about page blocks
- institute/about-us block
- conference description
- support contacts
- hero text, dates, logos, downloadable materials, external links

Recommended approach:

- use structured fields in `backend/internal/models/conference.go`
- keep content simple; this is not a CMS product
- serve branded page content to `frontend/src/pages/Welcome.jsx`

What not to add:

- no headless CMS for v1
- no marketing-site microfrontend split

## Frontend Guidance

Keep the frontend on plain React and route-level pages, but reduce complexity in new work.

Recommended implementation style:

- continue using route-level pages in `frontend/src/pages/`
- extract reusable form blocks and data hooks from `Admin.jsx`, `Dashboard.jsx`, and `Chat.jsx`
- establish shared design tokens and branded layout primitives in `frontend/src/index.css` or a small token file
- keep API access centralized through `frontend/src/lib/api.js`

Optional additions only if implementation pain appears:

- lightweight schema validation for large forms
- small upload helper utilities for attachment previews/progress

What not to add:

- no heavy state-management rewrite for v1
- no enterprise design system package unless the existing CSS becomes a blocker

## Security Baselines Required

For password reset and chat attachments, treat the following as mandatory:

- uniform forgot-password responses so account existence is not leaked
- rate limiting for reset requests
- high-entropy single-use reset tokens with short expiry
- server-side generated attachment storage keys
- allowlist-based file-type acceptance
- MIME sniffing or content validation
- file size limits
- access checks before attachment download

## Suggested Build-Order Implications

1. Consent/versioned registration fields
2. Online/offline participation model and admin editing
3. Password reset email flow
4. Chat attachment storage and delivery
5. Branded welcome pages and responsive cleanup

## Source Notes

External research that informed these recommendations:

- Federal Law No. 152-FZ "On Personal Data" on the Kremlin legal portal: `https://www.kremlin.ru/acts/bank/24154`
- Roskomnadzor memo on consent: `https://42.rkn.gov.ru/p32026/p32474/`
- Roskomnadzor guidance for legal entities processing personal data: `https://82.rkn.gov.ru/directions/pers/p15375/`
- Roskomnadzor education-sector memo highlighting localization and protection duties: `https://42.rkn.gov.ru/p32466/p32470/`
- OWASP Forgot Password Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html`
- OWASP file-upload validation/storage guidance via Input Validation Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html`
- NIST SP 800-63B: `https://pages.nist.gov/800-63-4/sp800-63b.html`

## Bottom Line

The correct stack strategy is incremental evolution of the current platform, not replacement. The biggest technical additions for this release are secure email-based recovery, auditable consent handling, safe attachment storage, and cleaner separation of conference content/branding from hard-coded frontend markup.
