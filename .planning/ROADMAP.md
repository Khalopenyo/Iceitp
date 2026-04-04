# Roadmap: ConferencePlatforma

## Overview

ConferencePlatforma already has a working foundation, so v1 focuses on completing the missing operational pieces that turn it into a usable single-conference platform: legally sound registration, organizer-controlled program data, hybrid participant journeys, secure recovery, file-capable communication, reliable participant materials, and a branded responsive experience.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Registration & Consent** - Complete legal onboarding and participant profile capture.
- [x] **Phase 2: Authoritative Program Management** - Let organizers turn participant inputs into the official program.
- [x] **Phase 3: Hybrid Schedule Experience** - Show the right schedule and navigation experience for online and offline attendees.
- [x] **Phase 4: Self-Service Account Recovery** - Restore account access without manual organizer intervention.
- [x] **Phase 5: Conference Communication** - Support participant chat, attachments, and feedback loops.
- [ ] **Phase 6: Participant Materials** - Deliver personalized conference documents and post-event materials.
- [ ] **Phase 7: Branded Responsive Experience** - Apply conference identity and responsive behavior across public and user flows.

## Phase Details

### Phase 1: Registration & Consent
**Goal**: Users can legally register, choose attendance format, and maintain the participant profile data needed for the conference.
**Depends on**: Nothing (first phase)
**Requirements**: CONS-01, CONS-02, AUTH-01, AUTH-02, PROF-01, PROF-02, PROF-03
**Success Criteria** (what must be TRUE):
  1. Visitor can read the required consent text before submitting conference participation data.
  2. Participant can explicitly submit the required consent choices and the system records them as part of registration.
  3. Participant can register with email, password, attendance format, section choice, and talk title in one end-to-end flow.
  4. Participant can log in across sessions, return to the platform, and update saved personal and contact profile data.
**Plans**: 3 plans
**UI hint**: yes

### Phase 2: Authoritative Program Management
**Goal**: Organizers can correct participant-submitted data and assemble an authoritative conference program.
**Depends on**: Phase 1
**Requirements**: PROF-04, PROG-01, PROG-03, PROG-04
**Success Criteria** (what must be TRUE):
  1. Admin can edit a participant's attendance format, section, and talk title after registration.
  2. Admin can assign or change the final room and time slot for a participant talk in the official program.
  3. Admin can store and maintain external join links for online sessions or participants where needed.
  4. Official program data and downstream program generation use admin-approved schedule records instead of raw participant profile data.
**Plans**: 3 plans
**UI hint**: yes

### Phase 3: Hybrid Schedule Experience
**Goal**: Participants can navigate the official program in a way that matches whether they attend online or offline.
**Depends on**: Phase 2
**Requirements**: PROG-02, PART-01, PART-02, PART-03
**Success Criteria** (what must be TRUE):
  1. Participant can view their final placement in the authoritative conference schedule.
  2. Offline participant can see assigned room and location details for their sessions.
  3. Offline participant can navigate sessions through a dynamic list or map-based venue view.
  4. Online participant can access an external join link without being pushed through venue-specific room or map flows.
**Plans**: 3 plans
**UI hint**: yes

### Phase 4: Self-Service Account Recovery
**Goal**: Users can recover account access securely without organizer-led manual resets.
**Depends on**: Phase 1
**Requirements**: AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can request a password reset by email and sees a uniform response that does not reveal account existence.
  2. User can open a valid reset link and set a new password successfully.
  3. User can sign in with the new password and the reset link no longer works after use.
**Plans**: 3 plans
**UI hint**: yes

### Phase 5: Conference Communication
**Goal**: Participants can communicate inside the platform with text, safe file sharing, and structured feedback.
**Depends on**: Phase 1
**Requirements**: CHAT-01, CHAT-02, CHAT-03, FEED-01
**Success Criteria** (what must be TRUE):
  1. Participant can send text messages in the conference chat.
  2. Participant can attach allowed files to chat messages.
  3. Participant can download authorized chat attachments from the scopes they can access.
  4. Participant can submit conference feedback and improvement suggestions inside the platform.
**Plans**: 3 plans
**UI hint**: yes

### Phase 6: Participant Materials
**Goal**: Participants can retrieve personalized conference materials that reflect final program and participation outcomes.
**Depends on**: Phase 3
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. Participant can download a personal PDF program that matches the authoritative schedule.
  2. Offline participant can download a QR badge PDF for onsite registration.
  3. Eligible participant can download a certificate in PDF format when participation conditions are met.
  4. Participant can access conference proceedings after the event is completed.
**Plans**: 3 plans
**UI hint**: yes

### Phase 7: Branded Responsive Experience
**Goal**: The platform presents a coherent conference identity and works well across devices on public and authenticated pages.
**Depends on**: Phases 1, 3, 5, and 6
**Requirements**: INFO-01, INFO-02, UX-01
**Success Criteria** (what must be TRUE):
  1. Visitor can access public pages for the university, the institute, and the conference with current event information.
  2. Public and authenticated areas show consistent conference branding and key event details.
  3. User can complete registration, schedule viewing, chat, feedback, and document download flows on phone, tablet, and desktop screens.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Registration & Consent | 3/3 | Complete | 2026-04-04 |
| 2. Authoritative Program Management | 3/3 | Complete | 2026-04-04 |
| 3. Hybrid Schedule Experience | 3/3 | Complete | 2026-04-04 |
| 4. Self-Service Account Recovery | 3/3 | Complete | 2026-04-04 |
| 5. Conference Communication | 3/3 | Complete | 2026-04-04 |
| 6. Participant Materials | 2/3 | In progress | - |
| 7. Branded Responsive Experience | 0/TBD | Not started | - |
