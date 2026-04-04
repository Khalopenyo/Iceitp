---
phase: 06-participant-materials
plan: 02
subsystem: api
tags: [gin, gorm, documents, pdf, policy]
requires:
  - phase: 06-01
    provides: document status contract
provides:
  - policy-aligned document handlers
  - attendance-aware badge and certificate enforcement
  - regression tests for blocked and successful document actions
affects: [documents, certificates, badge, proceedings]
tech-stack:
  added: []
  patterns: [shared runtime document context, status-contract enforcement in handlers, certificate reuse with stable numbering]
key-files:
  created: []
  modified:
    - backend/internal/handlers/documents.go
    - backend/internal/handlers/documents_test.go
key-decisions:
  - "Concrete document endpoints now fail with the same readiness rationale exposed by `GET /api/documents/status` instead of silently diverging."
  - "Certificate rendering now prefers authoritative program placement metadata when it exists, while preserving stable certificate numbering across repeated downloads."
patterns-established:
  - "Blocked document actions now return deterministic participant-facing API errors instead of generating placeholder PDFs for unavailable materials."
  - "Document handlers share a runtime context loader so user, conference, and readiness policy are resolved once per request path."
requirements-completed: [DOCS-01, DOCS-02, DOCS-03, DOCS-04]
duration: 3min
completed: 2026-04-04
---

# Phase 6: Participant Materials Summary

**Document downloads now enforce the same readiness and attendance rules shown by the status contract**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T10:11:31Z
- **Completed:** 2026-04-04T10:14:39Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Routed program, badge, certificate, and proceedings handlers through the centralized document policy/runtime context.
- Made badge issuance explicitly offline-only and certificate issuance explicitly attendance-aware.
- Extended backend regression coverage to real endpoint behavior, including blocked badge/proceedings/program cases and successful PDF certificate generation.

## Task Commits

Plan implementation was completed in one inline execution commit:

1. **Task 1-3: policy-aligned handlers and endpoint behavior coverage** - `6508706` (feat)

## Files Created/Modified

- `backend/internal/handlers/documents.go` - handler enforcement now matches the document status contract
- `backend/internal/handlers/documents_test.go` - blocked and successful material endpoint coverage

## Decisions Made

- Participant-facing blocked material responses now use API errors instead of generating misleading fallback PDFs.
- Online certificate eligibility is treated as explicit policy tied to approved placement and non-draft conference state.
- Certificate content now prefers authoritative assignment metadata when present so participant materials stay aligned with organizer-approved program data.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

None - the updated policy uses data already collected by the platform.

## Next Phase Readiness

The frontend documents page can now safely consume readiness data and inline errors without fighting inconsistent backend behavior.

---
*Phase: 06-participant-materials*
*Completed: 2026-04-04*
