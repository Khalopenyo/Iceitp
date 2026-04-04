---
phase: 7
slug: branded-responsive-experience
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
---

# Phase 7 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vite frontend build smoke + backend regression safety net |
| **Config file** | `frontend/package.json`, `backend/go.mod` |
| **Quick run command** | `npm --prefix frontend run build` |
| **Full suite command** | `cd backend && go test ./... && npm --prefix frontend run build` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every frontend task commit:** Run `npm --prefix frontend run build`
- **After shell or shared conference-data wiring:** Run `npm --prefix frontend run build`
- **After every plan wave:** Run `cd backend && go test ./... && npm --prefix frontend run build`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | INFO-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | INFO-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | INFO-02 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 2 | UX-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 2 | UX-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-02-03 | 02 | 2 | INFO-02, UX-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 2 | UX-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 2 | INFO-02, UX-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |
| 07-03-03 | 03 | 2 | INFO-02, UX-01 | frontend build | `npm --prefix frontend run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None beyond existing build coverage. This phase is primarily frontend integration and responsive polish.
- Responsive correctness and conference-brand consistency remain manual verification items.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visitor sees explicit university, institute, and conference information together with current event details | INFO-01, INFO-02 | Requires checking actual rendered content hierarchy and wording | Open `/` on desktop and phone widths, confirm the landing surface exposes those public information blocks and current conference metadata from the shared shell |
| Header and footer show consistent conference identity and support details across public and authenticated pages | INFO-02 | Build checks cannot prove rendered branding consistency across route transitions | Visit `/`, `/login`, `/dashboard`, `/documents`, and `/chat` while authenticated and unauthenticated, confirm title, dates/contact cues, and footer data remain coherent |
| Participant can complete registration, schedule viewing, feedback, and document actions on phone, tablet, and desktop layouts | UX-01 | Requires actual viewport interaction and checking spacing, wrapping, and tap targets | Test `/register`, `/dashboard`, `/feedback`, and `/documents` at representative phone, tablet, and desktop widths, confirming no blocking horizontal overflow or hidden primary actions |
| Chat, map, and organizer tools remain readable and operable on narrow screens after responsive polish | INFO-02, UX-01 | Requires checking dense layouts, tab bars, and composer/action ergonomics in-browser | Test `/chat`, `/map`, and `/admin` on narrow widths and confirm channel switching, message sending, map selection, and organizer actions remain reachable |

---

## Validation Sign-Off

- [x] All tasks have automated build verification
- [x] Sampling continuity preserved across both waves
- [x] No Wave 0 gaps remain
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
