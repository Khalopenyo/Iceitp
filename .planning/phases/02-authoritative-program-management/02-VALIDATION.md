---
phase: 2
slug: authoritative-program-management
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 2 — Validation Strategy

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
| 02-01-01 | 01 | 1 | PROG-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | PROG-04 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | PROG-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | PROF-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 02-02-02 | 02 | 2 | PROG-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 02-02-03 | 02 | 2 | PROG-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 02-03-01 | 03 | 2 | PROG-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | PROG-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | PROG-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/handlers/program_test.go` — admin program API validation and upsert coverage
- [ ] `backend/internal/handlers/program_readmodel_test.go` — authoritative read-model coverage for admin schedule and program document data
- [ ] Frontend browser-test framework is still not added in this phase — rely on build/lint plus explicit manual checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin can approve participant program data without losing edits after a server restart | PROF-04, PROG-01, PROG-04 | Requires authenticated admin UI and restart persistence check | Create or edit approved assignment in admin UI, restart backend, reload admin program tab, verify approved values are preserved |
| Admin can assign room/time and optional join link from one program-management surface | PROG-01, PROG-04 | Build checks cannot judge editor flow or conditional join-link UX | Open admin program editor, save offline and online variants, confirm list reflects approved assignment values |
| Full and personal program PDFs reflect authoritative approved placements rather than raw participant profile inputs | PROG-03 | Requires end-to-end document download and visual inspection | Edit approved title/section/room/time in admin UI, download personal and full program PDFs, verify approved values appear and raw profile fallback does not |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

