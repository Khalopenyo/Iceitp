# Phase 7 Research: Branded Responsive Experience

**Phase:** 7
**Name:** Branded Responsive Experience
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that turns the current conference platform into a coherent branded product across public and authenticated pages, while making the key user journeys complete reliably on phone, tablet, and desktop layouts.

Phase requirements:

- `INFO-01`
- `INFO-02`
- `UX-01`

## Current State

### Backend and shared conference data

- `backend/internal/handlers/conference.go` already exposes `GET /api/conference` and admin editing for `title`, `description`, dates, `status`, `proceedings_url`, and `support_email`.
- `frontend/src/pages/Admin.jsx` already manages those conference settings inside the organizer tools.
- The public and authenticated frontend shell does not consume this contract yet, so the platform already stores conference metadata centrally but does not render it consistently.

### Public presentation

- `frontend/src/pages/Welcome.jsx` is no longer a placeholder. It already contains a customized landing page with conference sections, dates, organizers, coordinator details, and a stronger visual direction.
- That landing content is mostly hardcoded in the page component, including conference title, dates, and contact details that overlap with the editable conference settings in admin.
- `frontend/src/components/Layout.jsx` still presents a generic product title, an empty subtitle, and a hardcoded support email in the footer.
- There is no explicit shared public-information structure for "about the university", "about the institute", and "about the conference" beyond what is manually embedded in the landing content.

### Participant and authenticated flows

- `frontend/src/pages/Register.jsx`, `frontend/src/pages/Login.jsx`, and `frontend/src/pages/Dashboard.jsx` still rely on `alert(...)` for important success or failure feedback.
- `frontend/src/pages/Documents.jsx` and `frontend/src/pages/Feedback.jsx` already moved toward inline state, but they do not inherit shared conference identity or event context.
- `frontend/src/pages/Chat.jsx` already has substantial responsive styling and a polished layout, but it is still a large desktop-oriented surface with a two-column shell and dense composer/message actions.
- `frontend/src/pages/Map.jsx` and `frontend/src/pages/Admin.jsx` still assume fairly wide layouts for grids, sidebars, tabs, and actions.

### CSS and responsive baseline

- `frontend/src/index.css` already contains a strong visual language, multiple breakpoints, and dedicated styles for landing, chat, map, dashboard, and document surfaces.
- Responsive work is therefore not missing from zero; the gap is uneven coverage and inconsistent behavior across different flows.
- Header/footer behavior on narrow viewports currently relies on wrapping and stacking only. There is no stronger responsive navigation pattern or explicit shell treatment for mobile-authenticated use.

## Key Mismatches The Plan Must Resolve

### 1. Conference branding exists in storage but not in the shared frontend shell

Current behavior:

- conference title, description, dates, and support email are editable in admin
- header, footer, and landing copy still duplicate key details locally

Planning implication:

- Phase 7 should make the existing conference settings the single frontend source for shared event identity

### 2. Public information coverage is visually strong but structurally incomplete

Current behavior:

- the landing page already communicates conference value and schedule
- the requirement explicitly calls for public pages or sections about the university, the institute, and the conference

Planning implication:

- Phase 7 should make those public information blocks explicit without discarding the current landing-page direction

### 3. Participant flows still leak desktop and alert-driven assumptions

Current behavior:

- registration, login, and dashboard profile save still surface blocking browser alerts
- important flows such as registration, schedule viewing, feedback, and documents need deterministic inline states on smaller screens

Planning implication:

- Phase 7 should remove remaining alert-first participant UX and tighten mobile behavior for the required journeys

### 4. Responsive coverage is inconsistent across collaboration and organizer surfaces

Current behavior:

- chat already has dedicated responsive work
- map and admin tools still use denser wide-screen layouts
- authenticated pages do not all inherit the same conference identity cues

Planning implication:

- the final phase should finish responsive polish across collaboration, navigation, and organizer surfaces that users actually operate during the event

## Recommended Scope Boundaries

### In Phase 7

- consume `GET /api/conference` from the frontend shell and public landing
- align header, footer, and landing with shared conference branding and key event details
- make public university / institute / conference information explicit on the visitor-facing surface
- remove remaining alert-driven feedback from core participant flows
- improve responsive behavior for registration, login, dashboard schedule, documents, feedback, chat, map, and organizer tools where needed

### Explicitly Not In Phase 7

- backend schema changes for conference branding
- a full CMS for public content blocks
- a multi-conference theming system
- a complete rewrite of the current landing-page visual direction
- introducing frontend browser automation as a prerequisite for shipping this polish phase

## Recommended Implementation Direction

### Shared conference context

- treat `GET /api/conference` as the source of truth for title, description, dates, status-driven messaging, and support email
- keep the integration lightweight inside the current frontend architecture instead of adding a large state-management layer
- let `Layout.jsx` own shared shell-level conference metadata so public and authenticated pages can inherit it

### Public pages

- keep `Welcome.jsx` as the main public marketing surface
- preserve its current branded visual language
- make the university, institute, and conference blocks explicit and easy to find, likely as clearly named sections on the landing page

### Required responsive journeys

Primary required journeys for `UX-01`:

- registration
- login / recovery
- dashboard schedule viewing
- feedback submission
- document download
- chat participation

Recommended execution direction:

- remove `alert(...)` from participant-facing flows touched in this phase
- tighten layout, spacing, action grouping, and overflow behavior instead of inventing new flows
- keep role-aware behavior from earlier phases intact while making narrow-screen usage less fragile

## Sequencing Guidance For Plans

The most stable execution order for Phase 7 is:

1. shared conference identity and shell/public information wiring
2. registration, auth, dashboard, feedback, and documents responsive cleanup
3. chat, map, and organizer responsive polish

Reasoning:

- branding consistency should be solved once at the shell level before page-by-page polish
- the requirement explicitly names participant journeys that must work across devices, so those should land before lower-priority organizer refinements
- chat, map, and admin polish can follow once the shared shell and participant surfaces are stable
