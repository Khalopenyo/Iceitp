---
phase: 5
slug: conference-communication
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 5 - Validation Strategy

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
| 05-01-01 | 01 | 1 | CHAT-02 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | CHAT-03 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | CHAT-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | CHAT-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 05-02-02 | 02 | 2 | CHAT-03 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 05-02-03 | 02 | 2 | CHAT-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 05-03-01 | 03 | 2 | FEED-01 | backend unit | `cd backend && go test ./...` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | FEED-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 05-03-03 | 03 | 2 | FEED-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/handlers/chat_test.go` - regression coverage for text chat preservation, allowed attachment upload, attachment download authorization, and invalid upload rejection
- [ ] `backend/internal/handlers/feedback_test.go` - regression coverage for participant feedback submission and admin feedback listing
- [ ] Frontend browser-test framework is still not added in this phase - rely on build/lint plus explicit manual checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Participant can attach an allowed file in conference chat and download it back from the message history | CHAT-02, CHAT-03 | Build checks cannot prove browser file picker behavior or download ergonomics | Log in as a participant, open `Чат`, attach an allowed file with a short message in the conference channel, submit it, then download the same file from the rendered message |
| Section attachment access is limited to the same authorized chat scope | CHAT-03 | Requires role and section-sensitive interaction across two accounts | Upload a file in a section chat as one participant, log in as a participant from another section, and confirm the attachment is not reachable through UI or direct download endpoint |
| Participant can submit feedback and organizer can read it in the admin surface | FEED-01 | Requires end-to-end interaction across participant and admin roles | Submit a feedback entry from the participant page, then log in as admin and confirm the entry appears with readable author/time context in the admin feedback tab |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

