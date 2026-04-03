---
phase: 1
slug: registration-consent
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `go test` (backend) + Vite build/lint smoke (frontend) |
| **Config file** | `backend/go.mod`, `frontend/package.json` |
| **Quick run command** | `cd backend && go test ./... && npm --prefix frontend run build` |
| **Full suite command** | `cd backend && go test ./... && npm --prefix frontend run lint && npm --prefix frontend run build` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && go test ./... && npm --prefix frontend run build`
- **After every plan wave:** Run `cd backend && go test ./... && npm --prefix frontend run lint && npm --prefix frontend run build`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | CONS-02 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | AUTH-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | AUTH-02 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | CONS-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 01-02-02 | 02 | 2 | AUTH-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 01-02-03 | 02 | 2 | AUTH-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 2 | PROF-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 01-03-02 | 03 | 2 | PROF-03 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/handlers/auth_test.go` — registration and consent regression tests for phase-1 backend behavior
- [ ] Frontend browser-test framework is not added in this phase — rely on build/lint plus explicit manual checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Registration consent UX is understandable and blocks submission until all required consent choices are checked | CONS-01, CONS-02 | Build checks cannot judge interaction wording or checkbox flow | Open `/register`, walk through all steps, verify consent links open, verify submit stays blocked until required consent choices are checked |
| Participant can edit section and talk title from the authenticated profile screen | PROF-02, PROF-03 | Requires end-to-end authenticated browser interaction | Register/login, open dashboard profile tab, change section and talk title, save, refresh page, confirm values persist |
| Auth session remains usable after registration and profile save | AUTH-02 | Requires real browser storage/navigation verification | Register or login, navigate to authenticated pages, refresh browser, verify user remains authenticated and sees updated profile data |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
