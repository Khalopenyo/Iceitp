---
phase: 6
slug: participant-materials
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `go test` (backend) + Vite build smoke (frontend) |
| **Config file** | `backend/go.mod`, `frontend/package.json` |
| **Quick run command** | `cd backend && go test ./... && npm --prefix frontend run build` |
| **Full suite command** | `cd backend && go test ./... && npm --prefix frontend run build` |
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
| 06-01-01 | 01 | 1 | DOCS-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | DOCS-02, DOCS-03, DOCS-04 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | DOCS-01, DOCS-02, DOCS-03, DOCS-04 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | DOCS-02 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | DOCS-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | DOCS-04 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | DOCS-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 06-03-02 | 03 | 2 | DOCS-02, DOCS-03, DOCS-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 06-03-03 | 03 | 2 | DOCS-01, DOCS-02, DOCS-03, DOCS-04 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/handlers/documents_test.go` — regression coverage for status/readiness, badge gating, certificate eligibility, and proceedings availability
- [ ] Frontend browser-test framework is still not added in this phase — rely on build plus explicit manual checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Participant sees which materials are available before clicking, with clear reasons for blocked items | DOCS-01, DOCS-02, DOCS-03, DOCS-04 | Requires checking rendered copy and disabled-state clarity in the actual page | Open `/documents` as users in different states and confirm the UI distinguishes available, blocked, and not-applicable materials without relying on alerts |
| Offline participant can download a QR badge while an online participant sees that badge is not applicable | DOCS-02 | Requires end-to-end role-aware behavior across auth state and participant UX | Log in as an offline participant and download the badge, then log in as an online participant and confirm the badge action is blocked with explicit copy |
| Certificate becomes downloadable only when the configured participation rule is satisfied | DOCS-03 | Depends on state transitions that combine check-in / schedule / conference status with PDF availability | Verify one non-eligible participant sees a blocked state, then satisfy the rule and confirm certificate download succeeds |
| Proceedings open only after conference completion and URL publication | DOCS-04 | Requires real organizer-configured state plus user-facing readiness copy | Set conference status/URL combinations in admin tools, then confirm `/documents` reflects unavailable, missing-link, and available proceedings states correctly |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
