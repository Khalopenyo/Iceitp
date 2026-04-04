---
phase: 03-hybrid-schedule-experience
plan: 01
subsystem: api
tags: [gin, gorm, schedule, participant, hybrid]
requires: []
provides:
  - authoritative participant schedule endpoint
  - authoritative room-oriented venue schedule endpoint
  - regression tests for approved and pending participant placement
affects: [dashboard, map, layout]
tech-stack:
  added: []
  patterns: [explicit assignment status, authoritative participant projection, room-oriented schedule grouping]
key-files:
  created:
    - backend/internal/handlers/schedule_test.go
  modified:
    - backend/internal/handlers/program_readmodel.go
    - backend/internal/handlers/schedule.go
key-decisions:
  - "Participant-facing schedule readers now treat missing ProgramAssignment as an explicit pending state instead of falling back to raw profile placement."
  - "Offline venue browsing is grouped by approved room identity and floor rather than by section-room string heuristics."
patterns-established:
  - "GET /api/schedule returns top-level assignment status and current user type together with a dedicated schedule payload."
  - "GET /api/schedule/with-participants returns authoritative room groups that later frontend code can consume directly."
requirements-completed: [PROG-02, PART-01, PART-03]
duration: 15min
completed: 2026-04-04
---

# Phase 3: Hybrid Schedule Experience Summary

**Authoritative participant schedule API with approved, pending, online, and offline schedule states**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-04T00:18:00Z
- **Completed:** 2026-04-04T00:33:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Extended the authoritative read-model with participant-facing schedule projections and room-oriented venue groupings.
- Replaced raw-profile participant schedule readers with approved assignment data in both `GET /api/schedule` and `GET /api/schedule/with-participants`.
- Added backend regression coverage for approved offline placement, approved online placement, pending placement, and authoritative room grouping.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: Authoritative participant schedule contract and tests** - `f793a03` (feat)

## Files Created/Modified

- `backend/internal/handlers/program_readmodel.go` - participant schedule view, room group projection, and authoritative assignment helpers
- `backend/internal/handlers/schedule.go` - participant endpoints now return approved or pending schedule state
- `backend/internal/handlers/schedule_test.go` - regression tests for hybrid participant schedule behavior

## Decisions Made

- Pending participant placement is represented explicitly and does not reuse profile section or talk data as official schedule output.
- Effective attendance mode comes from approved assignment data when available and falls back to the stored user mode only for non-approved state handling.
- Offline venue data is grouped around approved room placement so frontend navigation no longer needs section-room string inference.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The frontend can now build dashboard and venue flows against stable authoritative participant schedule endpoints without relying on legacy profile-derived schedule data.

---
*Phase: 03-hybrid-schedule-experience*
*Completed: 2026-04-04*
