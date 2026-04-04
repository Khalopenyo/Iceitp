# Phase 5 Research: Conference Communication

**Phase:** 5
**Name:** Conference Communication
**Date:** 2026-04-04

## Goal

Plan the smallest clean implementation that turns the existing text chat and basic feedback form into an operational conference communication surface with safe chat attachments, authorized downloads, and usable feedback review flow.

Phase requirements:

- `CHAT-01`
- `CHAT-02`
- `CHAT-03`
- `FEED-01`

## Current State

### Backend

- `backend/internal/handlers/chat.go` already supports conference and section chat scopes with text messages, edit/delete rules, unread metadata, and scoped list loading.
- `backend/internal/models/chat.go` stores only text message fields; there is no attachment model, file metadata, or download authorization path.
- `POST /api/chat` currently accepts JSON only. There is no multipart upload flow, no file-type allowlist, and no download endpoint for chat files in `backend/internal/router/router.go`.
- There are no chat regression tests in `backend/internal/handlers/`.
- `backend/internal/handlers/feedback.go` already lets a participant submit `rating` and `comment`, and admins can call `GET /api/admin/feedback`, but the response is still a raw model list with no author/profile read-model and no automated test coverage.
- Existing file upload precedent lives in `backend/internal/handlers/submissions.go` and `backend/internal/antiplagiat/service.go`, where uploads are stored under `storage/` with sanitized names and size checks.

### Frontend

- `frontend/src/pages/Chat.jsx` already provides a polished text-chat UI: scope switching, polling, drafts, search, edit, and delete.
- The chat composer has no file picker, no selected-file queue, and no attachment rendering in message history.
- `frontend/src/pages/Feedback.jsx` is a minimal form with alert-based success handling.
- `frontend/src/pages/Admin.jsx` currently has tabs for users, sections, program, rooms, consents, and tools, but no dedicated feedback review tab.

## External Security Guidance

Primary sources reviewed:

- OWASP File Upload Cheat Sheet:
  - allowlist extensions and content types
  - rename or sanitize uploaded file names
  - enforce size limits
  - store uploads outside direct web access and serve them through controlled application paths
- OWASP Authorization Cheat Sheet:
  - validate authorization on every request, including downloads
- Gin upload documentation:
  - `multipart/form-data` handling and `SaveUploadedFile` are already compatible with the current backend stack

Planning implication:

- Phase 5 should expose chat attachments through authenticated application endpoints, not through static file serving.
- Attachment access must be re-checked against the message scope every time a file is downloaded.
- The implementation should reuse the current storage style and upload plumbing already proven by the antiplagiat path instead of inventing a second unrelated pattern.

## Key Mismatches The Plan Must Resolve

### 1. Chat is text-only even though the product requires file exchange

Current behavior:

- participants can send text messages only
- message payloads are JSON only
- no attachment metadata exists in chat responses

Planning implication:

- Phase 5 must add a durable attachment entity plus upload/download behavior without regressing the existing text-chat flow

### 2. There is no authorized attachment lifecycle

Current behavior:

- no file-type policy for chat uploads
- no server-side size enforcement for chat files
- no controlled download endpoint
- no cleanup path tied to message deletion

Planning implication:

- Phase 5 needs attachment validation, persisted metadata, scoped download authorization, and storage cleanup when messages are removed

### 3. Feedback is technically present but not yet operationally complete

Current behavior:

- participant can submit a raw rating/comment payload
- admin API can list feedback rows
- there is no dedicated admin feedback surface and no feedback tests

Planning implication:

- Phase 5 should finish the feedback loop with better validation, participant UX, and organizer visibility

### 4. The phase has no automated regression coverage

Current behavior:

- there are no `chat_test.go` or `feedback_test.go` files

Planning implication:

- Phase 5 should leave behind endpoint-level coverage for upload validation, scoped download authorization, and feedback create/list behavior

## Recommended Scope Boundaries

### In Phase 5

- add chat attachment persistence and storage metadata
- support authenticated attachment upload in conference and section chat scopes
- support authenticated attachment download through a scoped backend endpoint
- keep text-chat behavior intact while extending the UI for attachments
- improve feedback submission UX
- add organizer-facing feedback review surface
- add backend tests for chat attachment and feedback flows

### Explicitly Not In Phase 5

- websocket or realtime chat transport redesign
- inline preview system for attachment types (`CHAT-04`, v2)
- admin attachment moderation workflow (`CHAT-05`, v2)
- unrestricted executable or arbitrary binary uploads
- public anonymous downloads

Planning implication:

- keep Phase 5 centered on safe file exchange plus feedback completion, not on a general messaging-platform rewrite

## Recommended Backend Direction

### Attachment model

Introduce a dedicated `ChatAttachment` model related to `ChatMessage`, with fields such as:

- `message_id`
- `file_name`
- `stored_name` or `file_path`
- `content_type`
- `file_size`
- timestamps

Recommended behavior:

- store attachments under an internal `storage/chat/` tree using sanitized generated names
- keep original display name separately from stored path
- validate allowed extensions and reasonable file sizes before persistence
- delete stored files when the parent message is deleted

### Chat API direction

Keep existing list/edit/delete endpoints, but evolve creation and downloads:

- preserve `GET /api/chat?scope=...`
- preserve `PATCH /api/chat/:id` and `DELETE /api/chat/:id`
- extend `POST /api/chat` to accept multipart form data for `scope`, `content`, and `files[]`
- preserve a text-only path so the current flow does not break during rollout
- add `GET /api/chat/attachments/:id` or equivalent authenticated download endpoint

Authorization rules:

- conference-scope attachments are available to authenticated participants in the main channel
- section-scope attachments require the same section-membership check already used by section chat
- admin/org can access both scopes through their existing role privileges

## Recommended Frontend Direction

### Chat

- keep `frontend/src/pages/Chat.jsx` as the main Phase 5 UI surface
- add selected-file queue and removal-before-send controls
- submit attachments with `FormData`
- render attachment cards or file rows directly under each message bubble
- download through authenticated browser requests instead of unauthenticated direct links

### Feedback

- keep `frontend/src/pages/Feedback.jsx` as the participant entry point
- replace alert-only flow with inline success/error state
- make suggestion language explicit so the page clearly matches the requirement
- add an admin feedback tab in `frontend/src/pages/Admin.jsx` so collected feedback is actually usable

## Sequencing Guidance For Plans

The most stable execution order for Phase 5 is:

1. backend attachment model, upload/download contract, and regression tests
2. chat UI attachment flow in the existing chat page
3. feedback completion and organizer review surface

Reasoning:

- attachment UI should not be built before the backend contract exists
- feedback work is mostly independent and can run in parallel with frontend chat work after the backend chat contract is stable

## Source Links

- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://gin-gonic.com/en/docs/routing/upload-file/
