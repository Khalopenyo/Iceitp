# ConferencePlatforma

## What This Is

ConferencePlatforma is a web platform for running a single scientific conference from participant registration through post-event materials. It is intended for conference organizers and participants, with separate online and offline participation flows, program navigation, communication, documents, and conference operations in one system.

The current codebase already contains a working foundation for registration, participant accounts, schedule visibility, chat, feedback, document generation, check-in, and admin tools. This project initialization captures the target product state needed to turn that foundation into a complete conference operations platform.

## Core Value

Organizers can run the full participant journey for one scientific conference in one system with minimal manual coordination and document handling.

## Requirements

### Validated

- ✓ User can register and log in with role-based access to the platform — existing
- ✓ Participant can view and edit profile data in a personal account — existing
- ✓ Participant can view assigned schedule information and conference documents — existing
- ✓ Participant can use built-in conference chat and submit feedback — existing
- ✓ Admin can manage users, sections, rooms, schedule data, and conference settings — existing
- ✓ Platform can generate PDF program, badge, and certificate documents — existing
- ✓ Platform can perform badge-based check-in and publish proceedings links — existing
- ✓ Participant can upload article files for antiplagiat processing — existing

### Active

- [ ] Participant can access branded welcome pages about the university, the institute, and the conference
- [ ] Participant gives legally correct consent for data processing and data publication before completing conference participation flows
- [ ] User registers as an online or offline participant and sees the correct participation experience for that format
- [ ] Participant selects a predefined conference section and enters a talk title during account/profile completion
- [ ] Admin can edit participant section, talk topic, room, and schedule placement after registration
- [ ] User can recover account access through a self-service password reset flow
- [ ] Organizer can build and maintain the conference program from participant registrations, predefined sections, rooms, and time slots
- [ ] Offline participant sees location-linked session information and navigation inside the conference venue
- [ ] Online participant receives an external videoconference link and is not tied to physical room/location flows
- [ ] Participant can navigate sessions through a dynamic schedule view and conference map/list experience
- [ ] Participant can leave conference feedback and improvement suggestions
- [ ] Participants can exchange chat messages and file attachments
- [ ] Participant can download personalized PDF program, QR badge, certificate, and post-conference proceedings materials
- [ ] Platform works well on phone, tablet, and desktop screens
- [ ] Platform presentation follows conference branding and visual identity

### Out of Scope

- Multi-conference SaaS tenancy in the first release — this stage is for one conference only
- Built-in video conferencing inside the platform — online participants receive an external meeting link instead
- Fully autonomous program generation without admin correction — the system should assist program assembly, but admin editing remains required

## Context

- The existing application is a brownfield monorepo with `Go + Gin + GORM + Postgres` in `backend/` and `React + Vite` in `frontend/`.
- The current implementation already includes registration/login, profile editing, schedule views, feedback, chat, conference documents, venue map support, admin tools, and antiplagiat-related submission flows.
- The current project goal is not to invent a new conference product from scratch, but to turn the existing foundation into a complete conference operations platform for one scientific event.
- The main business need is conference process automation: less manual organizer work when collecting participant data, placing talks into sections, communicating with attendees, and issuing final materials.
- Online and offline participation must diverge meaningfully in product behavior: offline users need venue/location context, while online users need remote-access links without room coupling.
- Legal consent wording for personal data processing/publication must be incorporated into the participant flow in a formal, defensible way.
- Existing codebase concerns include missing password recovery, no attachment support in chat, large page components, limited automated testing, and several deployment/security risks documented in `.planning/codebase/CONCERNS.md`.

## Constraints

- **Product scope**: Single conference deployment — first release is not multi-tenant SaaS
- **Tech stack**: Build on the existing `Go/Gin/GORM/Postgres` backend and `React/Vite` frontend — avoid replacing the foundation without strong reason
- **Participation model**: Support both online and offline attendees — user experience must branch cleanly by participation type
- **Program data**: Sections, room assignments, and time slots are organizer-defined inputs — admin must remain able to edit final placement
- **Documents**: Personalized outputs must be downloadable as PDF — program, badge, certificate, and proceedings access are core deliverables
- **UX**: Platform must be readable on any device — responsive behavior is required, not optional
- **Branding**: UI must reflect conference identity — design cannot stay as generic scaffolding
- **Compliance**: Consent for data processing/publication must be explicit and legally suitable — registration flow must capture it clearly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build for one conference first | The immediate need is a usable system for one concrete scientific event, not multi-tenant SaaS complexity | — Pending |
| Keep online and offline participation as separate user flows | Remote attendees should receive connection links instead of venue/location UX | — Pending |
| Use predefined sections during participant registration | Organizers already have a known section list and need consistent program assembly | — Pending |
| Let admins edit section, topic, and schedule assignments after registration | Real conference planning requires manual correction and organizer control | — Pending |
| Use external videoconference links instead of embedded video | Simpler first release, lower implementation cost, and aligns with stated need | — Pending |
| Include file attachments in participant chat | Communication requires not only text but also document/file exchange | — Pending |
| Preserve the existing technical foundation and evolve it incrementally | The repo already has substantial working modules that should be completed rather than replaced | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after initialization*
