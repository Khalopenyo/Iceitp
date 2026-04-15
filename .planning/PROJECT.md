# ConferencePlatforma

## What This Is

ConferencePlatforma is a single-conference operations platform for scientific events. It covers the participant journey from compliant registration through official scheduling, documents, venue guidance, communication, and operational check-in in one web system for organizers and attendees.

## Core Value

Organizers can run the full participant journey for one scientific conference in one system with minimal manual coordination and document handling.

## Current State

- **Shipped milestone:** `v1.0 Conference Operations Platform` on `2026-04-04`
- **Current milestone:** `v1.1 Rollout UX & Venue Operations`
- **Why v1.1 exists:** real deployment work surfaced a new priority: make the live conference experience usable on phones and on site before expanding into broader platform features like notifications or moderation
- **Main residual risks:** current rollout work started in code before planning caught up, mobile UX still needs component-level simplification on several screens, and browser/E2E coverage is still missing

## Current Milestone: v1.1 Rollout UX & Venue Operations

**Goal:** Make the live conference deployment comfortable on phones and on site by tightening participant document, QR, and 360 venue flows.

**Target features:**
- Compact mobile-first participant UX across landing, dashboard, documents, map, and dense authenticated surfaces
- Public QR badge scan flow that resolves to a real page and marks attendance
- Branded badge and certificate generation with reliable preview and download behavior
- Simplified 360 venue navigation with named locations, labeled hotspots, and scene-to-scene transitions

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

- [ ] Compact mobile-first participant UX across landing, dashboard, documents, map, and dense authenticated surfaces
- [ ] Public QR badge scan flow that resolves to a shareable page and records attendance
- [ ] Branded badge and certificate rendering with stable preview/download behavior
- [ ] 360 venue navigation with named locations, readable hotspot labels, and scene-to-scene transitions

### Out of Scope

- Multi-conference SaaS tenancy in the near term — the product is still optimized for one conference deployment
- Built-in video conferencing inside the platform — online participants continue using external meeting links
- Schedule notifications and reminder campaigns in this milestone — rollout usability is a higher immediate priority than expansion features
- Chat moderation/export tooling in this milestone — useful, but deferred until the participant-facing rollout is stable
- SMS OTP / phone verification in this milestone — provider setup is still incomplete and not part of the current rollout hardening scope
- Full browser/E2E automation in this milestone — still needed, but deferred behind production UX and on-site operations stabilization

## Context

- The application remains a brownfield monorepo with `Go + Gin + GORM + Postgres` in `backend/` and `React + Vite` in `frontend/`.
- `v1.0` shipped through one milestone spanning `7` phases, `21` plans, and `62` recorded tasks.
- Official program, participant schedule, and program-derived documents already flow from admin-approved assignments instead of raw participant-entered data.
- The current local worktree already contains post-v1 implementation across QR check-in, badge/certificate rendering, 360 venue navigation, and mobile UI compaction; milestone planning is catching up to active work already in progress.
- Shared conference identity continues to come from `/api/conference`, which feeds both public and authenticated frontend surfaces.
- Chat attachments still use local filesystem storage behind authenticated download handlers, and account recovery still depends on configured sender infrastructure.

## Constraints

- **Product scope:** Single conference deployment first — real deployment fit matters more than broader platform expansion
- **Tech stack:** Keep evolving the existing `Go/Gin/GORM/Postgres` backend and `React/Vite` frontend
- **Program data:** Organizers remain the final authority over sections, rooms, time slots, and online join links
- **Documents:** Participant-facing badge, certificate, and schedule outputs must remain downloadable as PDF
- **Mobile UX:** Primary participant actions must remain usable on common phone widths without oversized layout blocks
- **Venue UX:** 360 navigation should prioritize simple named locations and transitions over dense map tooling on participant screens
- **Compliance:** Consent capture and auditability must remain explicit and defensible even as QR and check-in flows evolve

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
| Prioritize rollout usability over broader feature expansion in v1.1 | Real deployment exposed immediate friction in mobile UX, venue guidance, and on-site check-in | — Active |
| Badge QR should resolve to a real frontend page, not a raw token or admin-only flow | Scanned codes need a stable user-facing URL and direct attendance result | — Active |
| Venue navigation should optimize for named 360 scenes and direct transitions | Participants need simple wayfinding on phones, not dense room-planning UI | — Active |

## Evolution

This document evolves at milestone boundaries and major product direction changes.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after starting milestone v1.1*
