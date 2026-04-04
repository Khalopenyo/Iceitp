---
phase: 4
slug: self-service-account-recovery
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `go test` (backend) + Vite build/lint smoke (frontend) |
| **Config file** | `backend/go.mod`, `frontend/package.json` |
| **Quick run command** | `cd backend && go test ./... && npm --prefix frontend run build` |
| **Full suite command** | `cd backend && go test ./... && npm --prefix frontend run lint && npm --prefix frontend run build` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every backend task commit:** Run `cd backend && go test ./...`
- **After every frontend task commit:** Run `npm --prefix frontend run build`
- **After every plan wave:** Run `cd backend && go test ./... && npm --prefix frontend run build`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | AUTH-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | AUTH-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | AUTH-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | AUTH-04 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | AUTH-04 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | AUTH-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 3 | AUTH-03 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 04-03-02 | 03 | 3 | AUTH-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 04-03-03 | 03 | 3 | AUTH-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/handlers/password_reset_test.go` — forgot-password and reset-password regression coverage for generic responses, valid reset, expired token, and used token behavior
- [ ] Frontend browser-test framework is still not added in this phase — rely on build/lint plus explicit manual checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Forgot-password request shows the same user-facing success state for both existing and non-existing email addresses | AUTH-03 | Automated tests can verify JSON contract, but not whether UX wording and page flow avoid accidental disclosure | Open forgot-password page, submit an existing email, then a nonexistent email, confirm the same outward success copy and interaction timing feel materially similar |
| User can open a valid reset link, enter the new password twice, submit successfully, and then log in through the normal login page | AUTH-04 | Requires end-to-end browser flow across email/reset/login pages | Request a reset for a test account, open the reset URL, submit matching passwords, then log in with the new password from `/login` |
| Used or expired reset links no longer work after a successful password change | AUTH-04 | Requires real token lifecycle behavior with browser interaction | Use a reset link once successfully, then try it again or try an expired test link, confirm the page shows a failure state and does not change the password |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

