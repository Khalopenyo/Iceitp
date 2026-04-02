# Research: Features

**Analysis Date:** 2026-04-02
**Project Type:** Brownfield scientific conference platform for one conference

## Scope Lens

Research here focuses on expected behavior for the missing or incomplete capabilities relative to the existing platform. The current codebase already has registration, profile, schedule visibility, feedback, text chat, documents, map support, admin tooling, check-in, and article submission foundations.

## Table Stakes For This Release

### Registration and Identity

- participant chooses attendance format: online or offline
- participant selects a predefined section
- participant enters talk title and contact details
- explicit consent capture before completing participation flow
- self-service password recovery by email
- admin can correct participant section/topic/format after registration

Why this is table stakes:

- conference platforms are expected to collect structured speaker/participant data
- organizers need to update mistakes without forcing participants through support
- password reset is baseline account functionality, not a premium feature

### Program and Scheduling

- participant sees their assigned section, room, and time slot
- admin can edit program assignments from one control surface
- online sessions expose remote-access links instead of room navigation
- official program is generated from structured schedule data rather than manual document editing

Why this is table stakes:

- tools like Sessionize and ConfTool position submission capture plus schedule building as core organizer workflows
- hybrid/virtual conference products commonly link external session resources from agenda entries instead of forcing embedded streaming

### Communication

- participant chat for questions and organizer communication
- file attachments in chat
- moderator/admin control over chat misuse
- feedback form for post-event improvement suggestions

Why this is table stakes:

- hybrid conference products commonly treat messaging and resource sharing as central attendee experience tools
- once attachments are allowed, moderation and file rules become part of the feature, not an afterthought

### Documents and Post-Event Materials

- personalized PDF program
- QR badge for onsite registration
- certificate access after the right participation/check-in state
- proceedings access after conference completion

Why this is table stakes:

- conference systems are expected to eliminate manual document preparation where possible
- document access is a visible part of organizer value

### UX and Presentation

- branded welcome/about pages
- adaptive mobile/tablet/desktop layout
- clear branching between online and offline journeys

Why this is table stakes:

- conference attendees often open schedules and materials from phones during the event
- a university/institute conference platform must not look like generic internal tooling

## Differentiators Worth Keeping

These are not the minimum baseline for all conference apps, but they materially strengthen this project:

- QR-based check-in already present in the codebase
- map-oriented venue navigation instead of schedule-only navigation
- article submission with antiplagiat processing
- unified organizer console spanning users, rooms, conference settings, and documents

These should remain in scope because they reinforce the platform's value for scientific conferences specifically.

## High-Value Clarifications For Requirements

### Consent

Treat this as at least two product decisions:

- consent to process operational participant data
- consent to publish participant data where the conference program or public materials expose it

This should not be implemented as an unversioned generic checkbox with no audit trail.

### Online vs Offline Participation

Users should not merely have a label on their profile. The format should affect behavior:

- offline participants see room/location flows, map, onsite badge/check-in relevance
- online participants see remote-access link flows and should not be forced through venue-specific UI

### Program Editing

The product should support admin correction, not just participant self-entry. Real conference operations always involve organizer edits after submission.

### Chat Attachments

Attachments are useful, but "any file" should be interpreted as user expectation, not a literal unlimited acceptance rule. The product should define allowed types, size limits, and moderation rules.

## Anti-Features For V1

Avoid these in the first release:

- multi-conference multi-tenant SaaS administration
- embedded video conferencing inside the platform
- fully automatic schedule generation with no organizer review
- complex social-network layers such as public feeds, gamification, matchmaking, or leaderboards
- public anonymous uploads in chat or documents
- CMS-level content authoring for every marketing block

## Dependency Notes

- consent work affects registration, profile, legal copy, and admin visibility
- online/offline format affects registration, schedule rendering, program editing, documents, and map/navigation
- password reset requires email delivery and auth changes
- chat attachments require storage design before frontend UX
- branded landing pages depend on deciding where conference content is stored

## Suggested V1 Category Buckets

These category groupings are appropriate for `REQUIREMENTS.md`:

- Consent and Access
- Registration and Profile
- Program Management
- Participation Experience
- Communication
- Documents
- Conference Presentation

## Source Notes

External research that informed feature expectations:

- Sessionize speaker-management and schedule-building product pages: `https://sessionize.com/`
- ConfTool hybrid/virtual conference guidance: `https://www.conftool.net/en/administrator-documentation/virtual-conferences.html`
- ConfTool product overview: `https://www.conftool.net/index.php`
- Sched hybrid/virtual conference feature page: `https://sched.com/hybrid-and-virtual-conferences/`
- COMS conference management feature page: `https://conference-service.com/`

## Bottom Line

For this first release, the missing essentials are not exotic. They are the operational pieces that make the current foundation usable for a real conference: auditable consent, clean online/offline branching, editable structured program data, password recovery, safe file sharing in chat, and branded responsive attendee-facing pages.
