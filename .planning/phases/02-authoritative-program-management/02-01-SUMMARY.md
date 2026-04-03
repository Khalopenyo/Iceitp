---
phase: 02-authoritative-program-management
plan: 01
subsystem: api
tags: [gin, gorm, schedule, admin, program]
requires: []
provides:
  - authoritative program-assignment backend model
  - admin program list and upsert APIs
  - restart-safe room bootstrap behavior
affects: [admin-ui, program-pdf, schedule-readmodels]
tech-stack:
  added: []
  patterns: [authoritative assignment source, separate submitted-vs-approved program data]
key-files:
  created:
    - backend/internal/models/program_assignment.go
    - backend/internal/handlers/program.go
    - backend/internal/handlers/program_test.go
  modified:
    - backend/internal/db/db.go
    - backend/internal/router/router.go
    - backend/cmd/server/main.go
    - backend/internal/handlers/users.go
    - backend/internal/handlers/sections.go
    - backend/internal/handlers/rooms.go
key-decisions:
  - "Participant profile remains the submitted input record; ProgramAssignment becomes the authoritative admin-approved schedule source."
  - "Normal server startup may create missing defaults but must not delete custom rooms or rewrite section room assignments."
patterns-established:
  - "Admin program data is exposed through dedicated /api/admin/program endpoints rather than overloading existing schedule endpoints."
  - "Approved room/section references are nullable so organizers can save partial authoritative data before final scheduling is complete."
requirements-completed: [PROF-04, PROG-01, PROG-03, PROG-04]
duration: 16min
completed: 2026-04-03
---

# Phase 2: Authoritative Program Management Summary

**Dedicated authoritative program assignments with admin approval APIs and restart-safe room bootstrap behavior**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-03T23:36:00Z
- **Completed:** 2026-04-03T23:52:05Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added a new `ProgramAssignment` backend model to store admin-approved attendance format, section, talk title, room, time slot, and join link separately from participant profile inputs.
- Exposed `GET /api/admin/program` and `PUT /api/admin/program/:userID` with validation for user type, section, room, time ordering, and join-link format.
- Removed destructive room and section room rewrites from normal startup so organizer-managed schedule data is no longer overwritten on restart.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: Authoritative model, admin API, and safe startup behavior** - `73d689d` (feat)

## Files Created/Modified

- `backend/internal/models/program_assignment.go` - authoritative admin-approved program-assignment model
- `backend/internal/handlers/program.go` - admin program list and upsert handlers plus validation helpers
- `backend/internal/handlers/program_test.go` - handler-level tests for program upsert and list behavior
- `backend/internal/db/db.go` - migration wiring for `ProgramAssignment`
- `backend/internal/router/router.go` - `/api/admin/program` route registration
- `backend/cmd/server/main.go` - safe room bootstrap without destructive room/section mutations
- `backend/internal/handlers/users.go` - deletes program assignments when participant records are removed
- `backend/internal/handlers/sections.go` - clears assignment section references when sections are deleted
- `backend/internal/handlers/rooms.go` - clears assignment room references before room deletion

## Decisions Made

- The authoritative schedule layer is modeled per participant rather than by mutating `Profile` or further overloading `Section`.
- Join links are stored on approved assignments and restricted to `http` or `https` URLs.
- Room defaults remain bootstrapped if missing, but startup is no longer allowed to remove custom rooms or rewrite section room data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Protect delete flows against dangling authoritative assignments**
- **Found during:** Task 1 and Task 3
- **Issue:** Adding `ProgramAssignment` without updating existing delete flows would leave stale room, section, or user references behind.
- **Fix:** Cleared or deleted assignment references in room, section, and user delete handlers.
- **Files modified:** `backend/internal/handlers/users.go`, `backend/internal/handlers/sections.go`, `backend/internal/handlers/rooms.go`
- **Verification:** `cd backend && go test ./...`
- **Committed in:** `73d689d`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Kept the new authoritative model safe under existing admin delete actions without expanding scope beyond data integrity.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The frontend can now build a dedicated admin program editor on stable endpoints, and backend readers can start switching documents and schedule views to authoritative assignment data.

---
*Phase: 02-authoritative-program-management*
*Completed: 2026-04-03*
