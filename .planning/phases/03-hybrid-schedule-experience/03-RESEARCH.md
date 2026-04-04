# Phase 3 Research: Hybrid Schedule Experience

**Phase:** 3
**Name:** Hybrid Schedule Experience
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that lets participants consume the official program in a role-aware way: offline attendees get venue-oriented schedule details, while online attendees get connection-oriented schedule details.

Phase requirements:

- `PROG-02`
- `PART-01`
- `PART-02`
- `PART-03`

## Current State

### Backend

- `backend/internal/models/program_assignment.go` now stores the authoritative organizer-approved participant placement, including `user_type`, `section_id`, `room_id`, `starts_at`, `ends_at`, and `join_url`.
- `backend/internal/handlers/program_readmodel.go` already loads authoritative entries for admin schedule and official program documents.
- `backend/internal/handlers/schedule.go` is split in an inconsistent way:
  - `AdminSchedule` already uses authoritative assignments
  - `UserSchedule` still loads `user.Profile.SectionID` and returns raw `section`
  - `ParticipantSchedule` still groups users by `profiles.section_id` and section defaults
- `backend/internal/models/room.go` provides durable floor data, which is better suited for offline navigation than the legacy `Section.Room` string.
- `backend/internal/models/map_marker.go` and `backend/internal/models/map_route.go` already exist, but participant-facing schedule flows do not currently consume them.

### Frontend

- `frontend/src/pages/Dashboard.jsx` still renders the schedule tab from `data.section`, `profile.talk_title`, and `section.room`.
- `frontend/src/pages/Map.jsx` consumes `/api/schedule/with-participants`, but it:
  - matches rooms through `section.room` string heuristics
  - uses `defaultRooms` as a fallback
  - treats all authenticated users the same
- `frontend/src/components/Layout.jsx` always shows the `Карта` navigation link to any authenticated user, including online participants.
- `frontend/src/lib/sessionStatus.js` already supports useful time-state badges if the page continues receiving start/end timestamps.

## Key Mismatches The Plan Must Resolve

### 1. Participant schedule endpoints still ignore authoritative assignments

Current behavior:

- admin and documents already use organizer-approved placement
- participant schedule APIs still read raw profile and section data
- a participant can see a schedule that disagrees with the official program

Planning implication:

- Phase 3 must switch participant-facing schedule readers to the same authoritative source introduced in Phase 2
- pending schedule state must be explicit when the organizer has not approved a placement yet

### 2. Online and offline participants still share the same venue-oriented UI

Current behavior:

- the dashboard schedule tab shows one generic section card
- external `join_url` is not surfaced to participants
- the map link is offered even to online participants who should not need venue navigation

Planning implication:

- Phase 3 must branch the participant schedule experience by approved `user_type`
- online users should see a connection-first flow
- offline users should see room/floor/location-first flow

### 3. Venue navigation is still derived from legacy section room strings

Current behavior:

- `Map.jsx` matches rooms with `roomMatchesSection(room, item.section.room)`
- this bypasses the authoritative `room_id` already stored on `ProgramAssignment`
- floor-aware offline navigation cannot be trusted if the schedule source is a string label

Planning implication:

- map/list navigation should use approved room identity and floor data directly
- Phase 3 should stop depending on section-room string matching for official participant navigation

### 4. Map authoring exists, but participant map rendering does not use it yet

Current behavior:

- backend already exposes `/api/map/markers` and `/api/map/routes`
- participant UI does not read those endpoints
- there is no current evidence that route overlays are required to satisfy the roadmap success criteria

Planning implication:

- do not overreach into a full route-rendering engine unless it is clearly necessary
- room/floor-aware navigation and session browsing are sufficient for this phase
- marker/route rendering can remain a future enhancement if the authoritative schedule contract and offline navigation work cleanly without it

## Recommended Scope Boundaries

### In Phase 3

- switch participant schedule APIs to authoritative approved assignments
- return explicit participant schedule status when no approved placement exists
- expose room name, room floor, section title, talk title, slot, and optional join link through the participant schedule contract
- update dashboard schedule UX to branch between:
  - pending
  - online approved placement
  - offline approved placement
- update the venue map/list page to consume authoritative room placement data
- stop pushing online participants toward venue-specific map flows

### Explicitly Not In Phase 3

- PDF program redesign or document workflow changes
- map-marker editor or route-authoring UX
- full route-polyline rendering unless required during implementation
- public branding refresh
- chat, feedback, or password-recovery work

Planning implication:

- Phase 3 should deliver participant schedule consumption, not broaden into adjacent document or branding phases

## Recommended Backend Contract Direction

Keep existing routes where possible to minimize frontend churn:

- `GET /api/schedule`
- `GET /api/schedule/with-participants`

Recommended participant contract direction:

### `/api/schedule`

Return one participant-focused schedule view that includes:

- current user identity
- `assignment_status` such as `approved` or `pending`
- approved attendance format
- approved section title
- approved talk title
- approved room identity/details for offline placement
- approved start/end times
- optional `join_url` for online placement

Important behavior:

- if no `ProgramAssignment` exists, return an explicit pending state
- do not silently rebuild official placement from `Profile.SectionID`

### `/api/schedule/with-participants`

Return authoritative room-oriented groupings suitable for the offline venue page:

- `current_user_id`
- `current_user_type`
- room/floor groups derived from approved assignment data
- participant rows and section/session metadata derived from approved assignments

Important behavior:

- no `profiles.section_id` query should remain in the official participant navigation reader
- grouping should be anchored to approved room placement rather than section-room strings

## Frontend Direction

### Dashboard

Primary file:

- `frontend/src/pages/Dashboard.jsx`

Recommended behavior:

- schedule tab becomes the main authoritative placement surface
- pending state: explain that the organizer has not yet approved placement
- online state:
  - show section, time, talk title
  - show a prominent external join-link action
  - avoid map/location prompts
- offline state:
  - show room name and floor
  - show section, time, talk title
  - link the participant toward the venue/map experience

### Venue map/list

Primary files:

- `frontend/src/pages/Map.jsx`
- `frontend/src/components/Layout.jsx`

Recommended behavior:

- continue using the current room-card style if it remains maintainable
- replace string-matching logic with authoritative room identifiers/details
- show only offline-relevant sessions in the venue experience
- hide or suppress the `Карта` entry for online participants so the UI stops steering them into an irrelevant flow

## Sequencing Guidance For Plans

The most stable execution order for Phase 3 is:

1. authoritative participant schedule backend and regression tests
2. participant dashboard hybrid schedule UX
3. offline venue navigation page and map-entry gating

Reasoning:

- frontend branching logic depends on a stable participant schedule contract
- dashboard can ship independently from venue-map refactoring once the backend is ready
- map/list work should be last because it has the most UI coupling and currently relies on legacy room-matching heuristics

## Risks The Planner Must Handle

### Risk 1. Reintroducing raw profile fallback into participant schedule views

Mitigation:

- treat missing authoritative assignment as an explicit pending state
- add backend tests proving participant schedule readers do not fall back to `Profile.SectionID` for official placement

### Risk 2. Online users still get venue-centric prompts

Mitigation:

- branch dashboard and layout navigation by approved `user_type`
- keep online CTA focused on `join_url`

### Risk 3. Map page continues to infer placement from room-name strings

Mitigation:

- require authoritative room identity/details in the participant schedule grouping contract
- remove `roomMatchesSection`-style heuristics from the official venue flow

### Risk 4. Phase 3 grows into a full campus routing project

Mitigation:

- keep the phase focused on room/floor/session navigation
- treat advanced route overlays as optional only if existing marker/route data can be reused with low complexity

### Risk 5. Large frontend pages create regression risk

Mitigation:

- keep backend projection logic concentrated in schedule/read-model helpers
- keep UI changes localized to `Dashboard.jsx`, `Map.jsx`, and navigation wiring

