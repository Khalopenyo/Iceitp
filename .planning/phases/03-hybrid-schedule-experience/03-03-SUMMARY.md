---
phase: 03-hybrid-schedule-experience
plan: 03
subsystem: ui
tags: [react, map, navigation, venue, layout]
requires:
  - phase: 03-01
    provides: authoritative room-oriented venue schedule endpoint
provides:
  - authoritative offline venue page
  - main-nav map gating by attendance mode
  - explicit online non-venue state
affects: [layout, participant-map, dashboard-flow]
tech-stack:
  added: []
  patterns: [authoritative room grouping, map gating by schedule meta, offline-first venue UX]
key-files:
  created: []
  modified:
    - frontend/src/pages/Map.jsx
    - frontend/src/components/Layout.jsx
key-decisions:
  - "The venue page now treats room groups from `/api/schedule/with-participants` as the source of truth instead of inferring placement from room-name strings."
  - "Online participants should not be steered into venue navigation from the global app shell."
patterns-established:
  - "Layout fetches lightweight schedule metadata to decide whether the map link is relevant for the current participant."
  - "The map page renders an explicit online-participant guard state instead of showing irrelevant venue UI."
requirements-completed: [PART-01, PART-02, PART-03]
duration: 10min
completed: 2026-04-04
---

# Phase 3: Hybrid Schedule Experience Summary

**Venue navigation now follows authoritative room placement and is hidden for online participants**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-04T00:42:00Z
- **Completed:** 2026-04-04T00:52:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Rebuilt the venue page around authoritative room groups from `/api/schedule/with-participants`.
- Removed legacy section-room string matching from participant venue browsing.
- Hid the `Карта` navigation entry for online participants while preserving it for offline attendees and privileged admin/org roles.
- Added an explicit online-participant guard page that redirects users back to the dashboard schedule flow.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: Venue navigation and attendance-aware map gating** - `ad779cf` (feat)

## Files Created/Modified

- `frontend/src/pages/Map.jsx` - authoritative room/floor venue browsing and online-participant guard state
- `frontend/src/components/Layout.jsx` - attendance-aware gating for the `Карта` navigation item

## Decisions Made

- Room and floor browsing now comes from approved room assignment data instead of client-side heuristics.
- Online participants are kept on a join-link-first path by removing venue prompts from global navigation.
- Offline participants can still browse the official venue schedule even if their own assignment is pending, with that state called out explicitly.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Hybrid participant schedule behavior is now end-to-end: the backend, dashboard, layout, and venue page all read from the same authoritative schedule source, so the next phase can move on to account recovery without unresolved schedule drift.

---
*Phase: 03-hybrid-schedule-experience*
*Completed: 2026-04-04*
