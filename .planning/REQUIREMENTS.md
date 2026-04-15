# Requirements: ConferencePlatforma

**Defined:** 2026-04-15
**Core Value:** Organizers can run the full participant journey for one scientific conference in one system with minimal manual coordination and document handling.

## v1.1 Requirements

Requirements for the active post-v1 rollout milestone. Each maps to roadmap phases `8-10`.

### Mobile Participant UX

- [ ] **UX-01**: Participant can use landing, dashboard, documents, and map on common phone widths without broken layout, clipped controls, or oversized dead space
- [ ] **UX-02**: On phone screens, primary actions remain reachable quickly without forcing the user through large decorative or duplicated content blocks
- [ ] **UX-03**: Dense participant and organizer surfaces keep compact, navigable mobile patterns instead of only long vertical stacking where appropriate

### 360 Venue Navigation

- [ ] **MAP-01**: Participant can open a named list of venue locations and switch scenes directly
- [ ] **MAP-02**: Scene hotspots show readable labels and can transition to linked scenes
- [ ] **MAP-03**: Mobile venue view keeps location switching and panorama viewing usable in one compact flow

### Badge, Certificate, and Documents

- [ ] **DOCS-01**: Badge PDF uses branded template artwork with centered QR placement
- [ ] **DOCS-02**: Certificate PDF uses branded template artwork with participant full name rendered into the design
- [ ] **DOCS-03**: Participant can preview badge and certificate in-page without browser popup dependency
- [ ] **DOCS-04**: Participant can reliably download generated PDFs in supported browsers

### QR Check-In

- [ ] **QR-01**: Badge QR encodes a valid frontend URL rather than a raw token
- [ ] **QR-02**: Opening the badge QR marks attendance and shows clear success or already-marked feedback
- [ ] **QR-03**: QR scan flow works locally and in production when `APP_BASE_URL` is configured correctly

## v2 Requirements

### Product Expansion

- **NOTF-01**: Participants receive schedule-change and reminder notifications
- **MODR-01**: Organizers can moderate or remove chat attachments
- **AUDT-01**: Organizers can export consent and attendance audit data
- **CMS-01**: Public landing blocks become organizer-editable without code changes
- **TEST-01**: Critical participant and admin flows have browser-level regression coverage
- **AUTH-05**: Registration can use phone-based OTP once SMS provider setup is production-ready

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-conference tenancy | Not part of the rollout-hardening milestone |
| Embedded video conferencing | Existing external join-link model is sufficient |
| SMS OTP in this milestone | Provider setup is incomplete and not on the critical path for rollout UX |
| Notification system in this milestone | Deferred until participant-facing rollout is stable |
| Chat moderation/export tooling in this milestone | Deferred behind mobile, venue, and check-in hardening |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UX-01 | Phase 10 | Pending |
| UX-02 | Phase 10 | Pending |
| UX-03 | Phase 10 | Pending |
| MAP-01 | Phase 9 | Pending |
| MAP-02 | Phase 9 | Pending |
| MAP-03 | Phase 9 | Pending |
| DOCS-01 | Phase 8 | Pending |
| DOCS-02 | Phase 8 | Pending |
| DOCS-03 | Phase 8 | Pending |
| DOCS-04 | Phase 8 | Pending |
| QR-01 | Phase 8 | Pending |
| QR-02 | Phase 8 | Pending |
| QR-03 | Phase 8 | Pending |

**Coverage:**
- v1.1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after starting milestone v1.1*
