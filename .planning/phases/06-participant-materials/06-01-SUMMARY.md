---
phase: 06-participant-materials
plan: 01
subsystem: api
tags: [gin, gorm, documents, policy, tests]
requires: []
provides:
  - participant material status contract
  - authenticated document readiness endpoint
  - backend regression tests for readiness states
affects: [documents, certificates, badge, proceedings]
tech-stack:
  added: []
  patterns: [centralized document policy helper, status-first participant materials contract, endpoint-level readiness tests]
key-files:
  created:
    - backend/internal/handlers/documents_test.go
  modified:
    - backend/internal/handlers/documents.go
    - backend/internal/router/router.go
key-decisions:
  - "Participant materials now expose a dedicated readiness contract so the frontend can render document availability before attempting downloads."
  - "Badge, certificate, and proceedings readiness are computed from attendance mode, authoritative assignment state, conference status, and check-in evidence in one helper."
patterns-established:
  - "The document center can now consume `GET /api/documents/status` instead of reverse-engineering readiness from PDF failures."
  - "Attendance-aware material policy is centralized inside `documents.go` instead of being scattered across frontend assumptions."
requirements-completed: [DOCS-01, DOCS-02, DOCS-03, DOCS-04]
duration: 7min
completed: 2026-04-04
---

# Phase 6: Participant Materials Summary

**Document backend now exposes explicit participant-material readiness before any download action**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-04T10:04:17Z
- **Completed:** 2026-04-04T10:11:31Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added a centralized participant-material status helper in `documents.go`.
- Added authenticated `GET /api/documents/status` for personal program, full program, badge, certificate, and proceedings readiness.
- Added backend regression coverage for blocked/available program state, proceedings readiness, and attendance-aware badge availability.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: status contract, endpoint, and readiness tests** - `33424da` (feat)

## Files Created/Modified

- `backend/internal/handlers/documents.go` - centralized document readiness contract and status endpoint
- `backend/internal/handlers/documents_test.go` - endpoint-level coverage for participant-material readiness states
- `backend/internal/router/router.go` - authenticated `GET /api/documents/status` route

## Decisions Made

- Material readiness is now computed on the backend, not inferred in the UI.
- Badge availability became explicitly attendance-aware at the status-contract layer even before download handlers are fully aligned.
- Proceedings status now returns a direct URL only when the conference is finished and the organizer has configured publication.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

None - the new status contract uses the existing conference, assignment, and check-in data already stored by the app.

## Next Phase Readiness

The concrete document download handlers can now be aligned to the same policy without forcing the frontend to guess readiness.

---
*Phase: 06-participant-materials*
*Completed: 2026-04-04*
