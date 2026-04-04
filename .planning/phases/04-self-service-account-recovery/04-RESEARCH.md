# Phase 4 Research: Self-Service Account Recovery

**Phase:** 4
**Name:** Self-Service Account Recovery
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that lets a user request a password reset by email, receive a reset link through a real side channel, and set a new password securely without organizer intervention.

Phase requirements:

- `AUTH-03`
- `AUTH-04`

## Current State

### Backend

- `backend/internal/handlers/auth.go` already exposes `POST /api/auth/forgot-password`, but it is only a stub returning a fixed success message.
- There is no reset-token model, no reset-password endpoint, no token expiry or single-use tracking, and no migration for recovery state in `backend/internal/db/db.go`.
- `backend/internal/config/config.go` does not contain app-base-url or mail-delivery settings.
- The codebase has no mailer/service package in `backend/internal/`, and there is no existing SMTP or outbound-email implementation.
- Password hashing already uses `bcrypt.GenerateFromPassword(..., 12)` for registration, so the app already has a working password-hash path that Phase 4 can reuse.
- Auth sessions are JWT-based and stateless in `backend/internal/auth/jwt.go`; there is currently no session store or token-version mechanism for revoking already-issued JWTs.

### Frontend

- `frontend/src/pages/Login.jsx` provides only email/password login.
- There are no `ForgotPassword` or `ResetPassword` screens.
- `frontend/src/App.jsx` has no public routes for recovery flow.
- The current frontend API helper can already call unauthenticated auth endpoints, so Phase 4 does not need a new transport layer.

## External Security Guidance

Primary sources reviewed:

- OWASP Forgot Password Cheat Sheet:
  - generic responses for existing and non-existing accounts
  - uniform timing
  - side-channel delivery
  - cryptographically secure, sufficiently long, single-use, expiring tokens
  - trusted reset URL construction
  - no automatic login after password reset
- OWASP Password Storage Cheat Sheet:
  - current bcrypt work factor 12 is already above the minimum legacy bcrypt guidance
  - bcrypt has an input-size limit, so recovery should avoid inventing incompatible password handling

Planning implication:

- Phase 4 should reuse the existing bcrypt hashing path rather than redesign password storage
- account recovery must center on opaque random URL tokens, not JWT reset tokens

## Key Mismatches The Plan Must Resolve

### 1. Forgot-password exists only as a placeholder

Current behavior:

- the endpoint always returns a generic success message
- no token is generated
- no delivery happens

Planning implication:

- Phase 4 must add durable password-reset state and a real delivery path while preserving the generic outward response

### 2. There is no secure reset-token lifecycle

Current behavior:

- no reset token table
- no expiry
- no single-use enforcement
- no audit trail for request metadata

Planning implication:

- Phase 4 needs a dedicated recovery token model with:
  - user linkage
  - securely stored token representation
  - expiry timestamp
  - used timestamp
  - request metadata useful for debugging and abuse review

### 3. The app cannot yet deliver a reset link by email

Current behavior:

- no mail sender abstraction
- no SMTP or app-base-url configuration
- no trusted reset URL construction

Planning implication:

- Phase 4 must introduce mail-delivery configuration and a sender abstraction
- production recovery requires an email side channel
- tests and local development should use an injected stub sender rather than a real SMTP dependency

### 4. Password-reset completion flow does not exist

Current behavior:

- no reset-password endpoint
- no frontend reset page
- no token consumption rules
- no shared password validation between registration and future reset logic

Planning implication:

- Phase 4 must add a reset-consumption endpoint and UI
- the reset path should reuse shared password validation logic rather than inventing a different policy
- the flow should end by sending the user back to normal login, not by automatically signing them in

## Recommended Scope Boundaries

### In Phase 4

- add a password-reset token model and migration
- add mail-delivery configuration and a backend sender abstraction
- implement a real `POST /api/auth/forgot-password` flow with generic outward response
- implement a real reset-password completion endpoint
- enforce expiry and single-use token behavior
- add frontend pages for:
  - requesting a reset email
  - setting a new password from a reset URL token
- link the login page to the recovery flow

### Explicitly Not In Phase 4

- MFA recovery
- SMS recovery
- organizer-admin manual password resets as the primary path
- session-store or JWT-revocation redesign for already-issued access tokens
- broad auth-system rewrite or social-login additions

Planning implication:

- keep Phase 4 focused on email-based self-service recovery only
- do not turn it into a general authentication overhaul

## Recommended Backend Direction

### Reset-token model

Introduce a dedicated recovery model, for example `PasswordResetToken`, with fields such as:

- `user_id`
- `token_hash`
- `expires_at`
- `used_at`
- `requested_ip`
- `requested_user_agent`
- timestamps

Recommended storage behavior:

- generate a raw token with a cryptographically secure random source
- never store the raw token directly in the database
- store only a derived hash suitable for constant-time comparison at lookup time
- mark the token used when a reset succeeds
- invalidate or replace older active tokens for the same user when a new request is issued

### Request endpoint

Keep `POST /api/auth/forgot-password`, but make it real:

- normalize email input
- always return the same public message
- avoid a quick-exit branch that reveals account existence through timing
- for an existing account:
  - create or rotate a secure reset token
  - build a reset URL from trusted config, not request host data
  - deliver the URL over email

### Reset-completion endpoint

Add a dedicated endpoint, for example:

- `POST /api/auth/reset-password`

Recommended payload:

- `token`
- `password`
- `password_confirm`

Recommended behavior:

- verify token hash match
- reject used tokens
- reject expired tokens
- validate the new password with the same policy used elsewhere
- hash the new password with the existing bcrypt path
- mark token used
- return success without auto-login

## Configuration Direction

Minimal config additions likely needed:

- `APP_BASE_URL` or equivalent trusted frontend base URL
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM`

Recommended implementation approach:

- add a mail sender abstraction that can be stubbed in tests
- add a production SMTP-backed implementation
- keep local development workable by allowing a no-send/logging sender when SMTP is intentionally absent in non-production contexts

## Frontend Direction

Primary files:

- `frontend/src/pages/Login.jsx`
- `frontend/src/App.jsx`

Recommended frontend moves:

1. Add a public forgot-password request page with one email field.
2. Add a public reset-password page that reads a token from the URL and asks for password + confirmation.
3. Keep outward messaging generic on the request page.
4. After successful reset, redirect the user to `/login` with a success message rather than signing them in automatically.

## Sequencing Guidance For Plans

The most stable execution order for Phase 4 is:

1. reset-token model, config, sender abstraction, and forgot-password request flow
2. reset-password completion endpoint and regression coverage
3. frontend recovery pages and login integration

Reasoning:

- frontend cannot be wired correctly until the backend contract is real
- reset completion depends on the same token model established by the request flow
- mail delivery and trusted reset URL construction must be solved before the UI can be treated as complete

## Risks The Planner Must Handle

### Risk 1. Account enumeration through message or timing differences

Mitigation:

- keep a uniform outward response
- avoid early exits that make nonexistent accounts observably faster

### Risk 2. Token leakage or token replay

Mitigation:

- store only hashed token material
- enforce single use
- enforce expiry
- use trusted reset URL construction and HTTPS

### Risk 3. Recovery path diverges from normal password policy

Mitigation:

- extract or reuse shared password validation logic between registration and reset
- keep hashing on the established bcrypt path

### Risk 4. Email delivery becomes a production blocker

Mitigation:

- plan a mail sender abstraction early
- make SMTP settings explicit in config
- keep tests independent from real email infrastructure through stubs

### Risk 5. Session invalidation expands scope too far

Mitigation:

- keep Phase 4 focused on reset-link lifecycle and password replacement
- do not redesign stateless JWT revocation unless it becomes a concrete requirement

