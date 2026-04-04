---
phase: 02-authoritative-program-management
plan: 03
subsystem: api
tags: [gin, gorm, documents, schedule, pdf, readmodel]
requires:
  - phase: 02-01
    provides: authoritative program assignments
provides:
  - shared authoritative program read-model
  - authoritative admin schedule reader
  - authoritative program PDF view selection
affects: [admin-schedule, program-pdf, participant-materials]
tech-stack:
  added: []
  patterns: [shared read-model helper, explicit unassigned program state, testable document view assembly]
key-files:
  created:
    - backend/internal/handlers/program_readmodel.go
    - backend/internal/handlers/program_readmodel_test.go
  modified:
    - backend/internal/handlers/schedule.go
    - backend/internal/handlers/documents.go
key-decisions:
  - "Official schedule readers must consume ProgramAssignment rows directly instead of rebuilding authority from participant profiles."
  - "Personal program mode shows an explicit pending state when no approved assignment exists rather than falling back to raw profile data."
patterns-established:
  - "Official program output selection is factored into loadProgramPDFView so schedule/document behavior can be regression-tested without parsing PDF bytes."
  - "Admin-facing schedule grouping and document generation share the same authoritative entry loader."
requirements-completed: [PROG-01, PROG-03]
duration: 12min
completed: 2026-04-04
---

# Phase 2: Authoritative Program Management Summary

**Official schedule readers and program PDFs now use organizer-approved assignments instead of raw registration data**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-03T23:50:00Z
- **Completed:** 2026-04-04T00:02:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added a shared authoritative program read-model that loads approved participant, section, room, slot, and join-link data from `ProgramAssignment`.
- Switched the admin schedule reader to that shared source so official backend schedule views no longer depend on `profiles.section_id`.
- Reworked `ProgramPDF` to select from authoritative assignments in both personal and full modes, including an explicit pending state when no approved assignment exists.
- Added regression coverage for authoritative schedule grouping and program-document view selection.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: Authoritative readers and document generation** - `d57d9b8` (feat)

## Files Created/Modified

- `backend/internal/handlers/program_readmodel.go` - shared authoritative entry loader, grouping helpers, and admin schedule projection
- `backend/internal/handlers/program_readmodel_test.go` - regression tests for assignment-only read behavior and program PDF view selection
- `backend/internal/handlers/schedule.go` - admin schedule now loads approved assignments rather than profile-section loops
- `backend/internal/handlers/documents.go` - program PDF selection and empty-state behavior now use authoritative assignments

## Decisions Made

- Official schedule readers are allowed to return empty results until organizers approve assignments; they no longer synthesize authority from submitted profile data.
- Program PDF mode selection is isolated in a helper so document behavior can be validated directly in backend tests.
- Missing approved placement is communicated with one consistent message across personal and full program generation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Better Architecture] Factor program PDF selection into a helper**
- **Found during:** Task 2 and Task 3
- **Issue:** Directly testing PDF bytes would be brittle and would not clearly prove authoritative-source selection.
- **Fix:** Added `loadProgramPDFView` so tests can validate authoritative selection and pending-state behavior before PDF rendering.
- **Files modified:** `backend/internal/handlers/documents.go`, `backend/internal/handlers/program_readmodel_test.go`
- **Verification:** `cd backend && go test ./...`
- **Committed in:** `d57d9b8`

---

**Total deviations:** 1 auto-fixed (1 better architecture)
**Impact on plan:** Improved verification depth without expanding user-facing scope.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Official schedule data now has one backend source of truth, so participant-facing hybrid schedule and navigation work can build on approved assignments instead of raw registration input.

---
*Phase: 02-authoritative-program-management*
*Completed: 2026-04-04*
