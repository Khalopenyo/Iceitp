# Requirements: ConferencePlatforma

**Defined:** 2026-04-02
**Core Value:** Organizers can run the full participant journey for one scientific conference in one system with minimal manual coordination and document handling.

## v1 Requirements

### Consent and Access

- [ ] **CONS-01**: Visitor can read required consent text before submitting conference participation data
- [ ] **CONS-02**: Participant can explicitly submit required consent choices with a recorded timestamp and text version
- [ ] **AUTH-01**: User can create an account with email, password, and attendance format
- [ ] **AUTH-02**: User can log in and stay logged in across sessions
- [ ] **AUTH-03**: User can request a password reset by email without exposing whether the email exists in the system
- [ ] **AUTH-04**: User can set a new password from a valid reset link

### Registration and Profile

- [ ] **PROF-01**: Participant can enter and edit full name, workplace, position, city, academic degree or title, email, and phone number
- [ ] **PROF-02**: Participant can choose a predefined conference section during registration or profile completion
- [ ] **PROF-03**: Participant can enter and edit the title of their talk
- [ ] **PROF-04**: Admin can edit a participant's attendance format, section, and talk title after registration

### Program Management

- [ ] **PROG-01**: Admin can assign or edit the final room and time slot for a participant talk in the official conference program
- [ ] **PROG-02**: Participant can view their final placement in the conference schedule grid
- [ ] **PROG-03**: Official program documents are generated from the authoritative schedule data rather than raw participant profile data
- [ ] **PROG-04**: Admin can store an external videoconference link for online sessions or conference participation

### Participation Experience

- [ ] **PART-01**: Offline participant can view room and location details for assigned sessions
- [ ] **PART-02**: Offline participant can navigate to the correct venue location through a dynamic list or map-based session view
- [ ] **PART-03**: Online participant can access an external join link without depending on venue-specific location flows

### Communication

- [ ] **CHAT-01**: Participant can send text messages in the conference chat
- [ ] **CHAT-02**: Participant can attach allowed files to chat messages
- [ ] **CHAT-03**: Participant can download attachments that are available in authorized chat scopes
- [ ] **FEED-01**: Participant can submit conference feedback and improvement suggestions

### Documents

- [ ] **DOCS-01**: Participant can download a personal conference program in PDF format
- [ ] **DOCS-02**: Participant can download a QR badge in PDF format for onsite registration
- [ ] **DOCS-03**: Participant can download a certificate in PDF format when participation conditions are met
- [ ] **DOCS-04**: Participant can access conference proceedings after the event is completed

### Conference Presentation

- [ ] **INFO-01**: Visitor can access public pages about the university, the institute, and the conference
- [ ] **INFO-02**: Visitor can see conference branding and key event information consistently across public and authenticated pages
- [ ] **UX-01**: User can complete registration, schedule viewing, chat, feedback, and document download on phone, tablet, and desktop layouts

## v2 Requirements

### Notifications

- **NOTF-01**: Participant receives email reminders or updates when schedule details change
- **NOTF-02**: Participant receives conference-status reminders before key event dates

### Communication Enhancements

- **CHAT-04**: Participant can preview supported attachment types inline in chat
- **CHAT-05**: Admin can moderate or remove inappropriate attachments from chat history

### Organizer Enhancements

- **ADMIN-01**: Organizer can export consent and attendance audit reports
- **ADMIN-02**: Organizer can edit richer public landing-page content blocks without code changes

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-conference multi-tenant SaaS administration | First release is for one conference only |
| Embedded video conferencing inside the platform | Online participants only need an external meeting link |
| Fully automatic schedule generation with no admin correction | Organizers must retain control over final program placement |
| Unrestricted executable or arbitrary file uploads in chat | Chat attachments must remain limited by security rules |
| Full CMS for marketing/public pages | Structured conference content is enough for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONS-01 | Phase 1 | Pending |
| CONS-02 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 4 | Pending |
| AUTH-04 | Phase 4 | Pending |
| PROF-01 | Phase 1 | Pending |
| PROF-02 | Phase 1 | Pending |
| PROF-03 | Phase 1 | Pending |
| PROF-04 | Phase 2 | Pending |
| PROG-01 | Phase 2 | Pending |
| PROG-02 | Phase 3 | Pending |
| PROG-03 | Phase 2 | Pending |
| PROG-04 | Phase 2 | Pending |
| PART-01 | Phase 3 | Pending |
| PART-02 | Phase 3 | Pending |
| PART-03 | Phase 3 | Pending |
| CHAT-01 | Phase 5 | Pending |
| CHAT-02 | Phase 5 | Pending |
| CHAT-03 | Phase 5 | Pending |
| FEED-01 | Phase 5 | Pending |
| DOCS-01 | Phase 6 | Pending |
| DOCS-02 | Phase 6 | Pending |
| DOCS-03 | Phase 6 | Pending |
| DOCS-04 | Phase 6 | Pending |
| INFO-01 | Phase 7 | Pending |
| INFO-02 | Phase 7 | Pending |
| UX-01 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after initial definition*
