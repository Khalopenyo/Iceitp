# Phase 6 Research: Participant Materials

**Phase:** 6
**Name:** Participant Materials
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that turns the existing document endpoints into a coherent participant-materials module with explicit availability rules, reliable PDF/download behavior, and a participant-facing document center that does not rely on blind clicks and alert-only failures.

Phase requirements:

- `DOCS-01`
- `DOCS-02`
- `DOCS-03`
- `DOCS-04`

## Current State

### Backend

- `backend/internal/handlers/documents.go` already exposes `ProgramPDF`, `BadgePDF`, `CertificatePDF`, `Proceedings`, and `VerifyCertificate`.
- `ProgramPDF` already uses authoritative `ProgramAssignment` data through `loadProgramPDFView(...)`, so the official program source was corrected in Phase 2.
- `BadgePDF` currently generates a QR token and PDF for any authenticated participant without checking whether the participant is offline.
- `CertificatePDF` currently requires a `CheckIn` record, which implicitly treats all certificate eligibility as onsite-only.
- `Proceedings` already gates access by `Conference.Status == finished` and `Conference.ProceedingsURL != ""`.
- There is no unified backend status/readiness contract for participant materials; the frontend has to click each action and discover errors afterward.
- There is currently no automated regression coverage for document handlers, badge gating, certificate eligibility, or proceedings availability.

### Frontend

- `frontend/src/pages/Documents.jsx` already offers buttons for personal program, full program, badge, certificate, and proceedings.
- The page is a thin action launcher: it does not load document status, does not explain why a material is unavailable, and falls back to `alert(...)` for failures.
- The page does not adapt to attendance mode even though earlier phases established distinct online/offline participant journeys.

### Admin / Existing Operational Controls

- `frontend/src/pages/Admin.jsx` already lets organizers manage conference status and `proceedings_url`.
- Badge-based onsite check-in is already wired through `POST /api/admin/checkin/verify`.
- Phase 6 therefore does not need to invent a new document CMS; it needs to make participant-facing material access consistent with the controls and evidence the system already has.

## External Package Guidance

Primary sources reviewed:

- `gofpdf` package docs (`pkg.go.dev`):
  - the package already supports PDF generation with text, images, and UTF-8 font loading through functions such as `AddUTF8FontFromBytes`
  - package docs explicitly show it as a PDF generator with image support and indicate the project is effectively closed
- `go-qrcode` package docs (`pkg.go.dev`):
  - `qrcode.Encode(...)` returns PNG bytes directly in memory
  - the package documents `qrcode.Medium` as a common error-recovery level and variable/fixed sizing behavior

Planning implication:

- Phase 6 should keep the current server-side PDF path in `documents.go` rather than replacing the PDF stack.
- QR generation should stay in-memory and local to the existing handler flow; the phase should focus on policy, contract, and UX rather than changing QR tooling.
- Because `gofpdf` is effectively closed, the safest move is tighter handler tests and smaller, localized refactors rather than a broad PDF-engine rewrite.

## Key Mismatches The Plan Must Resolve

### 1. Participant materials have no explicit readiness contract

Current behavior:

- the app has endpoints that may succeed or fail
- the frontend only learns availability after the user presses a button

Planning implication:

- Phase 6 should introduce a backend material-status contract so the UI can show what is available now, what is blocked, and why

### 2. Attendance-aware material rules are incomplete

Current behavior:

- badge generation is available to everyone even though onsite QR check-in only matters for offline participants
- certificate eligibility is tied only to check-in, which leaves online participants with no explicit rule at all

Planning implication:

- Phase 6 must make material rules explicit by attendance mode
- badge access should be offline-only
- certificate eligibility must be defined intentionally instead of emerging from a single handler guard

### 3. Proceedings and certificate flows are operationally present but UX-thin

Current behavior:

- proceedings availability depends on conference status and URL, but participants do not see readiness ahead of time
- certificate and badge failures surface as generic alerts instead of explanatory states

Planning implication:

- the frontend should become a document center with inline status and disabled/unavailable states, not just a set of optimistic buttons

### 4. Document behavior is untested

Current behavior:

- there is no `backend/internal/handlers/documents_test.go`
- no regression coverage protects material gating or output route behavior

Planning implication:

- Phase 6 needs endpoint-level backend tests before expanding participant UX

## Recommended Scope Boundaries

### In Phase 6

- add a participant-facing material status/readiness endpoint
- centralize material eligibility logic for program, badge, certificate, and proceedings
- make badge and certificate rules attendance-aware
- add backend regression tests for document availability and key handler flows
- upgrade `frontend/src/pages/Documents.jsx` to show inline availability and failures

### Explicitly Not In Phase 6

- visual rebranding or broad responsive redesign across the site
- replacing `gofpdf` or redesigning PDF rendering as a platform capability
- multi-conference storage or external file-hosting redesign
- full online-attendance tracking beyond the evidence already present in conference status, approved schedule data, and onsite check-in

## Recommended Policy Direction

### Badge

- badge availability should be explicit and offline-only
- online participants should see a clear "not applicable" state rather than receiving a useless QR PDF

### Certificate

Recommended v1 rule:

- offline participant becomes eligible after a saved onsite `CheckIn`
- online participant becomes eligible only after the conference has progressed beyond draft and the participant has an approved schedule placement

This is an inference from the current product scope and existing data model, because the system has onsite attendance evidence but no dedicated online attendance ledger.

### Proceedings

- proceedings should continue to require `Conference.Status == finished` plus a configured URL
- that rule should become visible through the same status contract used by the participant UI

## Sequencing Guidance For Plans

The most stable execution order for Phase 6 is:

1. build a backend material-status contract and regression tests
2. wire actual PDF/proceedings handlers to the same centralized policy
3. move `Documents.jsx` onto the explicit status contract with inline participant messaging

Reasoning:

- the frontend should not invent readiness rules that the backend does not expose
- PDF/proceedings handlers must enforce the same policy the UI displays
- once backend status is stable, the participant page can become deterministic and simpler
