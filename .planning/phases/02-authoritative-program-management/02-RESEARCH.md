# Phase 2 Research: Authoritative Program Management

**Phase:** 2
**Name:** Authoritative Program Management
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that lets organizers approve participant program data and use that approved data as the source of truth for the official conference program.

Phase requirements:

- `PROF-04`
- `PROG-01`
- `PROG-03`
- `PROG-04`

## Current State

### Backend

- `backend/internal/models/user.go` stores participant-submitted `user_type` on `User` and `section_id` plus `talk_title` on `Profile`.
- `backend/internal/models/section.go` stores thematic section data, but it is also overloaded with room and time fields that currently act as both registration metadata and schedule metadata.
- `backend/internal/handlers/schedule.go` derives admin and participant schedule views directly from `profiles.section_id` and `sections.start_at/end_at/room`.
- `backend/internal/handlers/documents.go` generates the PDF program from `Section` rows plus `Profile` rows loaded by `section_id`.
- There is no model or API for an admin-approved per-participant placement, no durable join-link field, and no backend contract for authoritative scheduling separate from participant-entered profile data.
- `backend/cmd/server/main.go` still mutates rooms and section room assignments at startup, which is a direct blocker for durable admin-managed program data.

### Frontend

- `frontend/src/pages/Admin.jsx` already has admin tabs for users, sections, rooms, consents, conference settings, and check-in tooling.
- The admin schedule tab is read-only and consumes `/api/admin/schedule`, which currently mirrors the raw `Profile -> Section` relationship.
- There is no admin editor for approved attendance format, approved talk title, approved section placement, per-talk room/time, or join links.
- Participant-facing screens still rely on profile data and section defaults rather than an approved schedule layer.

## Key Mismatches The Plan Must Resolve

### 1. Participant input and official program data are the same record today

Current behavior:

- participant chooses section and talk title in Phase 1
- the same raw `Profile` fields are treated as the official schedule source
- admin has no separate "approved" copy to override or normalize

Planning implication:

- Phase 2 needs a dedicated authoritative program record per participant talk
- the plan should keep participant-submitted profile fields as inputs, not the final official program source

### 2. Room and time are modeled on sections, not on approved talk placements

Current behavior:

- `Section.Room`, `Section.StartAt`, and `Section.EndAt` are reused as if each section had exactly one final placement
- `AdminSchedule` groups participants only by section

Planning implication:

- Phase 2 should introduce a per-participant approved placement that can carry room and time independently from the raw registration profile
- admin program views and documents should stop assuming section metadata alone defines the schedule

### 3. Online access links have no place to live

Current behavior:

- `Conference` stores only high-level event metadata
- there is no `join_url`, `meeting_link`, or comparable field in any authoritative schedule model

Planning implication:

- Phase 2 must add a durable field for organizer-managed external join links
- join-link validation should be explicit and restricted to safe URL schemes

### 4. Restart behavior can destroy authoritative edits

Current behavior:

- startup seed logic deletes non-preset rooms
- startup seed logic rewrites section rooms back to preset values

Planning implication:

- planner must treat seed cleanup as a blocker for authoritative program management
- Phase 2 should make startup safe before relying on admin-managed rooms or schedule placements

## Recommended Scope Boundaries

### In Phase 2

- add a dedicated authoritative program-assignment model
- add admin API(s) to list and upsert approved participant program data
- let admin approve or override:
  - attendance format
  - section
  - talk title
  - room
  - start time
  - end time
  - external join link
- make admin program views and PDF program generation consume approved assignments
- remove destructive startup behavior that would overwrite admin-managed rooms or section room data

### Explicitly Not In Phase 2

- full participant-facing hybrid schedule UX polish
- map-specific online/offline branching logic
- redesign of participant profile editing rules
- chat/file attachment work
- password recovery

Planning implication:

- do not drift into full Phase 3 participant schedule experience
- Phase 2 should provide authoritative data and core admin flows that Phase 3 can consume

## Recommended Data Model Direction

Introduce a dedicated authoritative schedule entity, for example `ProgramAssignment`, with one record per participant:

- `user_id`
- `user_type` as the admin-approved attendance format
- `section_id` as the admin-approved thematic section
- `talk_title` as the admin-approved title
- `room_id` for durable room references
- `starts_at`
- `ends_at`
- `join_url`

Recommended behavior:

- `Profile` remains the participant-submitted input record
- `ProgramAssignment` becomes the official source for admin schedule surfaces and PDF program generation
- downstream readers should show "not assigned yet" when no authoritative assignment exists rather than silently falling back to raw profile data for official-program outputs

## API Direction

Recommended minimal admin contract:

- `GET /api/admin/program`
  - returns participants with submitted profile fields plus approved assignment data
- `PUT /api/admin/program/:userID`
  - creates or updates the authoritative assignment for one participant

Validation should cover:

- existing user
- valid `user_type`
- existing section when `section_id` is provided
- existing room when `room_id` is provided
- `starts_at < ends_at` when both are provided
- `join_url` limited to `http`/`https`

## Read-Model Direction

`backend/internal/handlers/schedule.go` and `backend/internal/handlers/documents.go` should stop loading participants by `profiles.section_id` when producing official program data.

Recommended helper direction:

- create one shared authoritative read-model helper in handlers
- batch-load assignments, sections, rooms, and participant identities
- sort by approved `starts_at`, then section/title, to avoid the current N+1 section loop

## Frontend Direction

Primary file:

- `frontend/src/pages/Admin.jsx`

Recommended frontend moves:

1. Extract program-management UI into dedicated admin subcomponents instead of expanding the already-large page inline.
2. Show both submitted and approved values so organizers can compare raw registration data against the official assignment.
3. Keep the program editor on a dedicated admin surface backed by `/api/admin/program`.
4. Preserve existing tabs for rooms, sections, conference settings, consents, and tools.

## Sequencing Guidance For Plans

The most stable execution order for Phase 2 is:

1. authoritative backend model, admin API, and seed cleanup
2. admin UI for approving participant program data
3. document and schedule read-model switch to the authoritative source

Reasoning:

- frontend admin editing needs a stable backend contract
- document generation must not be switched until the authoritative model exists
- restart safety must be fixed before admins start relying on room and schedule edits

## Risks The Planner Must Handle

### Risk 1. Schedule data drifts between participant profile and approved assignment

Mitigation:

- define clearly in plan text that `Profile` is participant input and `ProgramAssignment` is the official source
- avoid partial write paths that update one source but not the other without clear intent

### Risk 2. Admin page becomes harder to maintain

Mitigation:

- split program-management UI into dedicated child components during the admin UI plan
- keep existing non-program tabs stable

### Risk 3. Documents still leak raw profile data

Mitigation:

- move document participant loading behind a shared authoritative query helper
- add backend tests around authoritative-source selection

### Risk 4. Server restart still reverts admin edits

Mitigation:

- include seed cleanup in the first execution plan, not as a future TODO

