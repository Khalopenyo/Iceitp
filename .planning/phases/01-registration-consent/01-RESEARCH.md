# Phase 1 Research: Registration & Consent

**Phase:** 1
**Name:** Registration & Consent
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that makes registration legally usable, structurally complete for conference participation, and compatible with later program-management work.

Phase requirements:

- `CONS-01`
- `CONS-02`
- `AUTH-01`
- `AUTH-02`
- `PROF-01`
- `PROF-02`
- `PROF-03`

## Current State

### Backend

- `backend/internal/handlers/auth.go` already accepts registration fields for `user_type`, `section_id`, `talk_title`, and `consent`.
- `backend/internal/models/user.go` already stores `UserType` on `User` and profile fields such as `FullName`, `Organization`, `Position`, `City`, `Degree`, `SectionID`, `TalkTitle`, `Phone`, and `ConsentGiven`.
- `backend/internal/models/consent.go` already stores a `ConsentLog`, but it is too coarse for the target behavior:
  - fixed consent type `authors`
  - fixed URL `/consent-authors`
  - fixed version `consent-authors-v1`
  - no distinction between operational processing and publication-facing consent
- `backend/internal/handlers/users.go` already exposes `/me` and `PUT /me/profile`, but profile updates do not validate section existence or consent-policy rules.

### Frontend

- `frontend/src/pages/Register.jsx` already has a 3-step registration flow and captures most phase-1 fields.
- `frontend/src/pages/Login.jsx` already supports basic login.
- `frontend/src/pages/PersonalData.jsx` is explicitly marked as draft and contains only placeholder legal text.
- `frontend/src/App.jsx` and `frontend/src/components/Layout.jsx` already expose routes and footer links for legal pages.

## Key Mismatches The Plan Must Resolve

### 1. Registration is coupled to final room assignment too early

`backend/internal/handlers/auth.go` currently rejects registration when the selected section has no assigned room:

- this is incompatible with the roadmap
- final program assignment belongs to Phase 2
- registration should require a valid section, not a finalized room allocation

Planning implication:

- phase 1 must remove the "selected section has no assigned room" registration blocker
- phase 1 must preserve section selection as participant input only
- admin-owned authoritative scheduling remains out of scope until Phase 2

### 2. Consent is logged, but not product-ready

Current consent handling is only:

- one checkbox
- one profile boolean
- one hard-coded consent log row

This is not enough for:

- showing clear required consent text before submission
- versioning legal text
- proving what the user agreed to at registration time

Planning implication:

- phase 1 must treat consent as a versioned registration artifact
- the plan should preserve backward compatibility with existing `ConsentLog` records where possible

### 3. Profile capture exists, but registration/profile boundaries are blurry

Today the register screen and profile model overlap, but there is no clear contract for:

- which fields are mandatory at registration
- which fields are editable later
- whether editing can invalidate consent assumptions

Planning implication:

- phase 1 should explicitly define registration payload and profile update payload behavior
- the plan should not force Phase 2 admin-editing work into Phase 1

## Recommended Scope Boundaries

### In Phase 1

- required consent text display before registration completes
- versioned consent capture and persistence
- structured participant registration with:
  - attendance format
  - full name
  - organization
  - position
  - city
  - academic degree/title
  - contact phone
  - section choice
  - talk title
- login continuity after registration
- participant self-edit of profile fields after account creation

### Explicitly Not In Phase 1

- organizer editing of participant section/topic/format
- authoritative room/time-slot program management
- external join-link assignment
- password-reset execution flow
- branded public-page rebuild

Planning implication:

- do not let phase 1 plans drift into schedule-management or admin console work
- however, registration data must be shaped so later phases can consume it cleanly

## Backend Integration Recommendations

### Auth and registration

Primary files:

- `backend/internal/handlers/auth.go`
- `backend/internal/router/router.go`
- `backend/internal/models/user.go`
- `backend/internal/models/consent.go`
- `backend/internal/db/db.go`

Recommended backend moves:

1. Keep `POST /api/auth/register`, but tighten its contract.
2. Validate:
   - required identity fields
   - valid `user_type`
   - existing `section_id`
   - required talk title
   - required consent choices
3. Remove the requirement that a section must already have a room to register.
4. Normalize/trim user input before persistence.
5. Fail registration on duplicated email in a predictable way.

### Consent persistence

Recommended approach:

- keep `ConsentLog` as the durable audit table
- extend it rather than inventing an unrelated parallel model unless migration becomes awkward
- at minimum capture:
  - meaningful `ConsentType`
  - stable `ConsentVersion`
  - route/screen source
  - granted time
  - request metadata already present

If legal/product copy distinguishes operational processing vs publication permission, model them as separate consent events rather than one overloaded boolean.

### Profile updates

`PUT /api/me/profile` should continue to exist, but phase 1 planning should decide whether:

- section choice remains editable by participant after registration
- talk title remains editable by participant after registration

The safer default for this phase is:

- participant can still update these fields
- final authoritative placement remains admin-owned later

## Frontend Integration Recommendations

Primary files:

- `frontend/src/pages/Register.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/PersonalData.jsx`
- `frontend/src/components/Layout.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/lib/auth.js`

Recommended frontend moves:

1. Keep the existing multi-step registration page and evolve it instead of replacing it.
2. Replace placeholder legal text with formal consent content and a clearer registration gate.
3. Make required field and consent validation explicit in the UI.
4. Keep login flow simple; phase 1 only needs continuity, not recovery.
5. Ensure profile-edit surfaces reflect the same data contract as registration.

## Sequencing Guidance For Plans

The most stable sequencing for execution is:

1. data-model and backend-contract cleanup
2. registration and legal-content UI update
3. profile continuity and validation hardening

Reasoning:

- frontend work needs a stable backend payload
- consent versioning must not be retrofitted after the registration UI is rebuilt
- profile continuity should validate the final contract, not an intermediate one

## Risks The Planner Must Handle

### Risk 1. Breaking existing users during model migration

Mitigation:

- make new consent/version fields additive where possible
- preserve existing `ConsentGiven` behavior long enough to migrate flows safely

### Risk 2. Accidentally moving schedule responsibility into registration

Mitigation:

- keep section selection as participant preference/input
- do not require room or final slot data in phase 1

### Risk 3. Divergent frontend/backend validation rules

Mitigation:

- specify exact required fields in both plan actions and acceptance criteria
- ensure UI and API error states use the same field assumptions

### Risk 4. Legal text hard-coded in multiple places

Mitigation:

- identify one source of truth for consent text/version during this phase
- avoid duplicating nearly identical legal copy across separate pages/components

## Recommended Plan Split

A 3-plan split is appropriate for this phase:

- one plan for backend registration/consent contract and persistence
- one plan for registration/legal UI and login continuity
- one plan for participant profile update alignment and regression protection

Parallelization note:

- the registration UI plan should depend on the backend contract plan
- the profile-alignment plan should depend on the backend contract and may partially depend on the updated UI contract

## Validation Architecture

There is no meaningful automated test infrastructure yet for the touched backend/frontend flows, so phase 1 should introduce minimal validation scaffolding rather than relying only on manual clicking.

Recommended validation shape:

- backend:
  - use `go test ./...` as the primary automated framework baseline
  - add targeted tests for registration validation and consent logging behavior
- frontend:
  - use at least `npm --prefix frontend run build` as required smoke verification
  - if no browser test framework is added in this phase, keep manual verification scoped and explicit

Planning implications:

- include at least one task that creates or updates backend tests around registration/consent behavior
- every plan should have grep-verifiable acceptance criteria
- the phase validation contract should treat `go test ./...` plus frontend build success as the minimum continuous feedback loop

## Bottom Line

Phase 1 is not a branding phase and not a scheduling phase. It is the contract-cleanup phase that makes participant onboarding legally explicit, structurally complete, and future-proof for the authoritative program management that follows.
