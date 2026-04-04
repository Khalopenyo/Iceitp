---
phase: 04-self-service-account-recovery
plan: 01
subsystem: api
tags: [gin, gorm, auth, smtp, recovery]
requires: []
provides:
  - durable password reset token state
  - trusted reset-url construction from app config
  - sender abstraction for reset email delivery
  - backend regression tests for forgot-password flow
affects: [auth, config, runtime]
tech-stack:
  added: []
  patterns: [hashed reset tokens, generic recovery response, smtp-or-log sender abstraction]
key-files:
  created:
    - backend/internal/models/password_reset_token.go
    - backend/internal/mail/sender.go
    - backend/internal/handlers/password_reset_test.go
  modified:
    - backend/internal/config/config.go
    - backend/internal/db/db.go
    - backend/internal/handlers/auth.go
    - backend/internal/router/router.go
    - backend/cmd/server/main.go
key-decisions:
  - "Password reset links use opaque random tokens whose SHA-256 hash is stored in the database instead of persisting the raw token."
  - "Reset URLs are built from trusted APP_BASE_URL config, and runtime delivery uses SMTP when configured with a log fallback for local development."
patterns-established:
  - "POST /api/auth/forgot-password always returns the same outward message while only existing users receive a side-channel reset link."
  - "Auth handlers now share explicit password validation before bcrypt hashing."
requirements-completed: [AUTH-03]
duration: 5min
completed: 2026-04-04
---

# Phase 4: Self-Service Account Recovery Summary

**Forgot-password now issues durable reset tokens and sends trusted recovery links through a sender abstraction**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04T00:56:27Z
- **Completed:** 2026-04-04T01:01:16Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added a dedicated `PasswordResetToken` model with hashed token storage, expiry, single-use state, and request metadata.
- Extended runtime config with trusted `APP_BASE_URL`, SMTP settings, and reset-token TTL to support secure reset-link delivery.
- Replaced the forgot-password stub with a real flow that rotates stored reset tokens, builds a trusted reset URL, and sends it through a stub-friendly mail sender.
- Added backend regression tests covering uniform outward responses and durable token creation for existing users.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: Reset token model, sender abstraction, and forgot-password request flow** - `8988ee6` (feat)

## Files Created/Modified

- `backend/internal/models/password_reset_token.go` - durable reset-token state with expiry, single-use tracking, and request metadata
- `backend/internal/mail/sender.go` - password reset sender interface with SMTP and local log implementations
- `backend/internal/config/config.go` - trusted reset-url and outbound-mail runtime settings
- `backend/internal/handlers/auth.go` - real forgot-password flow and shared password validation helpers
- `backend/internal/handlers/password_reset_test.go` - request-side regression coverage for password recovery
- `backend/internal/router/router.go` - auth handler wiring for recovery config and sender injection
- `backend/cmd/server/main.go` - router setup now passes the full runtime config

## Decisions Made

- Recovery tokens are random opaque strings whose SHA-256 hash is stored server-side, so the database never contains the raw reset secret.
- The public forgot-password response stays generic even when lookup, token rotation, or delivery work happens behind the scenes.
- Local development keeps working without SMTP by falling back to structured logging, while production can switch to SMTP through config only.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

- Set `APP_BASE_URL` to the public frontend origin used in reset emails.
- Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM` to enable real email delivery outside local development.

## Next Phase Readiness

The backend now has stable reset-token state and delivery plumbing, so the next plan can add `POST /api/auth/reset-password` and consume tokens securely exactly once.

---
*Phase: 04-self-service-account-recovery*
*Completed: 2026-04-04*
