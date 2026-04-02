# Research: Architecture

**Analysis Date:** 2026-04-02
**Project Type:** Brownfield scientific conference platform for one conference

## Architectural Direction

Extend the current monorepo architecture. Do not introduce new services unless a feature clearly needs one.

The current split is already appropriate:

- `frontend/` owns route rendering and page UX
- `backend/internal/handlers/` owns HTTP endpoints
- `backend/internal/models/` owns persistent state
- `backend/internal/db/db.go` owns migration wiring

The missing work is mostly domain modeling and module cleanup, not service decomposition.

## New Or Expanded Domain Areas

### 1. Participation model

Add explicit participation-format state to the participant domain.

Recommended data additions:

- `attendance_format`: `online` | `offline`
- optional `remote_join_url` at conference/session level
- optional room/location linkage only where relevant for offline attendance

Likely touch points:

- `backend/internal/models/user.go`
- `backend/internal/models/section.go`
- `backend/internal/handlers/auth.go`
- `backend/internal/handlers/users.go`
- `backend/internal/handlers/schedule.go`
- `frontend/src/pages/Register.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Map.jsx`
- `frontend/src/pages/Admin.jsx`

### 2. Consent and publication rights

The current `consent` area should become an auditable workflow, not just a single boolean.

Recommended model additions:

- consent kind
- text version
- accepted-at
- accepted-by user
- source flow
- optional evidence fields such as IP/user-agent if policy requires them

Recommended backend boundaries:

- keep persistence in `backend/internal/models/consent.go`
- move consent policy/version rules into a small domain helper or service instead of scattering text/version checks across handlers

### 3. Password recovery

Add a focused reset-token flow with three endpoints:

- request reset
- validate/consume reset token
- set new password

Recommended placement:

- model in `backend/internal/models/`
- handler logic in `backend/internal/handlers/auth.go` or a split auth-recovery module if that file becomes too large
- mailer abstraction in a new internal package

### 4. Program editing and hybrid schedule rendering

The schedule/program domain is already present, but it needs clearer separation between:

- participant-entered preferences or self-declared section/topic
- admin-approved final schedule placement
- offline room data
- online join-link data

Recommended structural approach:

- keep section and conference schedule entities in backend models
- ensure final schedule placement is admin-owned
- expose a participant-facing schedule DTO that hides irrelevant offline-only fields for online users

### 5. Chat attachments

Add a separate attachment subsystem rather than embedding file blobs into chat rows.

Recommended shape:

- `ChatMessage`
- `ChatAttachment`
- `StorageService`

Recommended flow:

1. client uploads or submits attachment with message form
2. backend validates and stores file through storage service
3. backend writes attachment metadata row
4. chat list endpoint returns message plus attachment metadata
5. download route checks authorization before serving file

## Frontend Integration Plan

### Routing

Current route structure in `frontend/src/App.jsx` can stay, but missing features should avoid further growth of mega-pages.

Recommended additions:

- keep `Welcome.jsx` for public landing/about content
- add password-reset request and reset-confirm views
- extend registration/profile flow to capture attendance format, section, talk title, and consent
- split program editing UI from the broad `Admin.jsx` page into smaller sections/components

### State and Data Loading

Stay with route-level fetch logic for now, but extract helper hooks for high-churn areas:

- registration/profile form state
- admin program editing data
- chat attachment upload state
- document availability state

This reduces risk without forcing a frontend state-management migration.

## Backend Integration Plan

### Handler changes

Modify existing handlers rather than creating unrelated parallel APIs:

- `auth.go` -> password recovery and registration/profile fields
- `users.go` -> profile updates and admin edits
- `schedule.go` -> online/offline aware participant schedule payloads
- `conference.go` -> public content blocks, links, and branding fields
- `chat.go` -> attachment metadata and download flow
- `documents.go` -> ensure generated docs reflect final program data and attendance rules
- `consents.go` -> consent capture/reporting

### New internal packages

These packages would improve maintainability without overengineering:

- `backend/internal/mail/`
- `backend/internal/storage/`
- `backend/internal/policy/consent/` or similar small helper package if consent logic grows

## Data Flow Adjustments

### Registration/Profile

New desired flow:

1. participant opens branded landing/registration flow
2. participant accepts required consent text
3. participant chooses online/offline format
4. participant selects predefined section and enters talk title
5. system stores profile and participation metadata
6. admin later adjusts final placement if needed
7. participant sees final schedule representation relevant to their format

### Online session flow

1. admin assigns or edits remote meeting link for relevant session/conference
2. online participant schedule response includes join URL
3. UI renders join CTA instead of physical-room navigation emphasis

### Chat attachment flow

1. participant sends message with optional file
2. backend validates file type/size and stores it
3. attachment metadata is associated with the message
4. recipients view message list and may download if authorized

## Suggested Build Order

1. registration/profile domain cleanup
2. consent versioning and attendance-format data model
3. admin program editing and participant schedule behavior
4. password reset mailer/token flow
5. chat attachments and secure download rules
6. public branded pages and responsive polish

## Areas That Must Be Modified, Not Rebuilt

- `frontend/src/pages/Admin.jsx` should be decomposed, not replaced wholesale
- `frontend/src/pages/Dashboard.jsx` should gain clearer participant-specific sections, not a second dashboard
- `frontend/src/pages/Chat.jsx` should gain attachments on top of current message flow
- `backend/internal/router/router.go` should extend the current API surface rather than creating duplicate versioned routes without need

## Source Notes

External research that informed this architecture view:

- ConfTool hybrid-conference guidance on linking external virtual resources through agenda data: `https://www.conftool.net/en/administrator-documentation/virtual-conferences.html`
- Sessionize schedule/content management positioning: `https://sessionize.com/`
- Sched hybrid/virtual event feature guidance: `https://sched.com/hybrid-and-virtual-conferences/`
- OWASP forgot-password guidance: `https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html`
- OWASP upload-validation/storage guidance: `https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html`

## Bottom Line

The architecture should evolve by sharpening domain boundaries inside the current monorepo: participation format, consent policy, password-reset tokens, attachment storage, and structured conference content. The biggest architecture risk is adding these features directly into already-large pages and handlers without first creating small internal boundaries.
