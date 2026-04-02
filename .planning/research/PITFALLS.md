# Research: Pitfalls

**Analysis Date:** 2026-04-02
**Project Type:** Brownfield scientific conference platform for one conference

## Highest-Risk Pitfalls

### 1. Treating consent as a generic checkbox with no policy version

Why it fails:

- legal/compliance requirements usually care about what text the user agreed to, when, and for what purpose
- conference programs may publish participant names, affiliations, and talk titles, which can be a separate publication/distribution concern from ordinary account processing

Warning signs:

- only one boolean is stored
- no consent text version is captured
- no way to distinguish operational processing from publication approval

Prevention:

- store consent type plus version metadata
- link consent records to the exact registration/profile flow
- separate general processing consent from any publication-facing consent if program data becomes public

Phase impact:

- must be addressed in the first registration/access phase

### 2. Building online/offline participation as a label instead of a real behavior split

Why it fails:

- online participants should not be forced through room/map/location workflows
- offline participants still need onsite navigation, badge, and check-in relevance

Warning signs:

- profile has a type field but schedule payloads are identical for both audiences
- map and room UI appears for online-only attendees
- remote links are bolted on as free-text notes

Prevention:

- make attendance format affect API payloads and UI rendering
- model remote join URLs explicitly
- decide which documents/check-in rules differ by attendance format

Phase impact:

- must be addressed before final program/schedule UX is considered done

### 3. Shipping password reset that leaks whether an email exists

Why it fails:

- account enumeration is a common security flaw
- rushed reset flows often create permanent or reusable tokens

Warning signs:

- response changes depending on account existence
- raw reset tokens are stored in the database
- reset links do not expire or can be reused

Prevention:

- return uniform success messaging
- hash stored reset tokens
- expire quickly and invalidate after use
- rate-limit reset requests per account and IP

Phase impact:

- should be handled in the authentication phase

### 4. Allowing "any file" in chat literally

Why it fails:

- user expectation does not remove file-security obligations
- unrestricted uploads create malware, executable-file, and storage-abuse risk

Warning signs:

- validation relies only on filename extension
- files are stored under user-controlled names
- upload directory is directly web-accessible
- no per-file size limit or download authorization exists

Prevention:

- define an allowlist of supported types for v1
- store random server-generated keys
- validate size and MIME/content
- protect downloads with auth checks
- keep uploads outside directly executable/public paths

Phase impact:

- must be addressed in the communication/chat phase

### 5. Letting participant-entered data become the final official program automatically

Why it fails:

- real conferences need organizer correction of section choice, topic wording, time slot, and room assignment
- participant preferences and final schedule data are not the same thing

Warning signs:

- program generation reads directly from raw profile data
- there is no admin review state
- room/time fields are missing from the authoritative schedule model

Prevention:

- separate participant-submitted inputs from admin-approved final schedule placement
- keep admin editing central to the program-builder workflow
- generate official documents from final schedule data only

Phase impact:

- critical for the program-management phase

### 6. Adding new features inside already oversized pages and handlers

Why it fails:

- `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Chat.jsx`, and several backend handlers already have broad responsibilities
- more logic in the same files raises regression risk and slows later fixes

Warning signs:

- one page owns fetch logic, validation, mutation, rendering, modal state, and formatting utilities
- a single backend handler file starts owning unrelated business rules

Prevention:

- extract reusable child components and hooks before feature growth
- add small internal packages for mail/storage/policy concerns
- prefer clear domain seams over copy-pasting more logic into monolith files

Phase impact:

- ongoing; should be addressed whenever the corresponding feature is implemented

## Secondary Pitfalls

### Room/location assumptions breaking online journeys

Prevention:

- make location fields optional where attendance is online
- ensure schedule rendering falls back to join-link UX instead of empty room labels

### Hard-coded public page content drifting from admin-managed conference data

Prevention:

- move public conference/about content toward structured backend-driven fields
- avoid duplicating the same dates/contacts in static frontend constants and admin state

### Mobile design being postponed until after feature completion

Prevention:

- test each new flow on narrow screens from the start
- especially verify registration, schedule, chat attachments, and document download actions on mobile

### Missing moderation rules for chat attachments

Prevention:

- define allowed file types, deletion rules, and who can remove abusive content before launch

## Source Notes

External sources informing these pitfalls:

- Federal Law No. 152-FZ "On Personal Data": `https://www.kremlin.ru/acts/bank/24154`
- Roskomnadzor memo on consent: `https://42.rkn.gov.ru/p32026/p32474/`
- OWASP Forgot Password Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html`
- OWASP upload-validation/storage guidance: `https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html`
- ConfTool hybrid-conference guidance: `https://www.conftool.net/en/administrator-documentation/virtual-conferences.html`

## Bottom Line

The most likely way to fail this release is not missing a fancy feature. It is implementing the right features with weak boundaries: checkbox-only consent, fake online/offline separation, insecure password reset, insecure file uploads, and direct generation of the official program from unreviewed participant data.
