---
phase: 3
slug: hybrid-schedule-experience
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 3 — Validation Strategy

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
| 03-01-01 | 01 | 1 | PROG-02 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | PART-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | PART-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | PROG-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 03-02-02 | 02 | 2 | PART-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 03-02-03 | 02 | 2 | PART-03 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | PART-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 03-03-02 | 03 | 2 | PART-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 03-03-03 | 03 | 2 | PART-03 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/handlers/schedule_test.go` — authoritative participant schedule regression coverage for approved, pending, online, and offline views
- [ ] Frontend browser-test framework is still not added in this phase — rely on build/lint plus explicit manual checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline participant sees authoritative room, floor, and session placement in the dashboard and can continue to the venue view | PROG-02, PART-01, PART-02 | Requires authenticated browser interaction across role-specific UI | Log in as an offline participant with an approved assignment, open `Кабинет -> Расписание`, verify official section/time/room/floor details, then open the venue view and confirm the same placement appears there |
| Online participant sees join-link-first schedule UX and is not pushed into map navigation | PROG-02, PART-03 | Build checks cannot verify navigation affordance quality or external-link behavior | Log in as an online participant with an approved assignment, open `Кабинет -> Расписание`, verify join link is visible and map/location prompts are absent; confirm `Карта` is hidden or blocked |
| Participant without an approved assignment sees an explicit pending state instead of raw profile-derived placement | PROG-02 | Requires end-to-end data-state verification with authenticated UI | Log in as a participant whose profile has section/talk data but no `ProgramAssignment`, verify the schedule tab explains that the official placement has not been approved yet |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

