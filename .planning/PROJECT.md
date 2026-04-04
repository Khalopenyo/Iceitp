# ConferencePlatforma

## What This Is

ConferencePlatforma is a single-conference operations platform for scientific events. It now covers compliant participant onboarding, organizer-owned program assembly, attendance-aware schedule and venue access, in-platform communication, participant materials, and public/authenticated conference presentation in one web system.

## Core Value

Organizers can run the full participant journey for one scientific conference in one system with minimal manual coordination and document handling.

## Current State

- **Shipped milestone:** `v1.0 Conference Operations Platform` on `2026-04-04`
- **What v1 now does:** explicit consent capture, registration/profile completion, organizer-approved program management, online/offline schedule branching, self-service password recovery, chat with allowlisted attachments, feedback collection, readiness-aware participant documents, and branded responsive public/authenticated pages
- **Main residual risks:** no separate v1.0 milestone audit artifact yet, no automated browser or end-to-end coverage, and several large page components still carry maintenance risk

## Requirements

### Validated

- ✓ Legally correct consent capture, registration, and participant profile editing — v1.0
- ✓ Organizer-owned program assignments and authoritative schedule/document generation — v1.0
- ✓ Hybrid online/offline participant schedule, venue, and join-link flows — v1.0
- ✓ Self-service password recovery via emailed reset links — v1.0
- ✓ In-platform communication with chat attachments and organizer-visible feedback — v1.0
- ✓ Personalized program, badge, certificate, and proceedings access with readiness-aware UX — v1.0
- ✓ Branded and responsive public/authenticated experience — v1.0
- ✓ Existing operations support such as check-in, conference settings, and antiplagiat integration remain available — v1.0

### Active

- [ ] Participant and organizer notifications for schedule changes and conference reminders
- [ ] Inline preview support for common chat attachment types
- [ ] Organizer moderation or removal tools for chat attachments
- [ ] Organizer export for consent and attendance audit data
- [ ] Richer organizer-editable content blocks for public landing pages
- [ ] Automated browser-level regression coverage for critical participant and admin journeys

### Out of Scope

- Multi-conference SaaS tenancy in the near term — the product is still optimized for one conference deployment
- Built-in video conferencing inside the platform — online participants use external meeting links
- Fully autonomous schedule generation without organizer correction — admin control over final placement remains required
- Unrestricted executable or arbitrary file uploads — chat attachments stay on an explicit allowlist

## Context

- The application remains a brownfield monorepo with `Go + Gin + GORM + Postgres` in `backend/` and `React + Vite` in `frontend/`.
- Current tracked application source is roughly `16,730` lines across `78` Go, JS, JSX, and CSS files.
- v1 shipped through one milestone spanning `7` phases, `21` plans, and `62` recorded tasks.
- Official program, participant schedule, and program-derived documents now flow from admin-approved assignments instead of raw participant-entered data.
- Shared conference identity now comes from `/api/conference`, which feeds both public and authenticated frontend surfaces.
- Chat attachments currently use local filesystem storage behind authenticated download handlers, and account recovery depends on configured sender infrastructure.

## Next Milestone Goals

1. Add participant notifications for schedule changes and conference reminders.
2. Add organizer moderation and export tooling around communication and consent data.
3. Make public landing content more organizer-editable without code changes.
4. Reduce regression risk with browser automation and further decomposition of oversized pages.

## Constraints

- **Product scope:** Single conference deployment first; do not expand into multi-tenant SaaS without a deliberate milestone
- **Tech stack:** Keep evolving the existing `Go/Gin/GORM/Postgres` backend and `React/Vite` frontend
- **Participation model:** Online and offline attendees must continue to diverge cleanly in schedule and navigation UX
- **Program data:** Organizers remain the final authority over sections, rooms, time slots, and online join links
- **Documents:** Personalized outputs stay downloadable as PDF
- **UX:** Core participant and organizer flows must stay usable on phone, tablet, and desktop
- **Compliance:** Consent capture and auditability must remain explicit and defensible

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build for one conference first | Immediate need is one concrete scientific event, not multi-tenant platform complexity | ✓ Shipped in v1.0 |
| Keep online and offline participation as separate user flows | Remote attendees need join links instead of venue-dependent UX | ✓ Shipped in v1.0 |
| Use predefined sections during participant registration | Organizers need consistent inputs for program assembly | ✓ Shipped in v1.0 |
| Let admins own the final schedule assignment | Real conference planning requires organizer correction and approval | ✓ Shipped in v1.0 |
| Use external videoconference links instead of embedded video | Lower complexity and matches the stated need | ✓ Shipped in v1.0 |
| Store consent as dual versioned audit records | Operational and publication consent must remain independently provable | ✓ Shipped in v1.0 |
| Keep chat attachments allowlisted and auth-gated | File exchange is needed, but unrestricted uploads are not acceptable | ✓ Shipped in v1.0 |
| Drive shared branding from `/api/conference` | Public and authenticated UI should show one conference identity source | ✓ Shipped in v1.0 |
| Prefer inline status feedback over browser alerts on primary flows | Users should stay in context during registration, documents, feedback, and admin actions | ✓ Shipped in v1.0 |

## Evolution

This document evolves at milestone boundaries and major product direction changes. The next update should happen when the next milestone is defined and its new active requirements replace the archived v1 scope.

---
*Last updated: 2026-04-04 after v1.0 milestone archival*
