# ADR 0006 — Tenant isolation via Postgres Row-Level Security (fail-closed backstop)

Status: Accepted (apparatus landed; enforcement behind `RLS_ENFORCED`, default off)
Date: 2026-06-21

## Context

Phase 2.4 added application-layer tenant scoping to every read and by-id mutation
(`tenant.ByConference` / `tenant.ByOrg` GORM scopes, proven by the
`TestCrossTenant*` suite). That is necessary but not sufficient: a single
forgotten `.Scopes(...)` on a future query reintroduces a cross-tenant leak. The
locked architecture (shared DB + `tenant_id` + Postgres RLS, fail-closed) calls
for a database-level backstop that holds even when application code is wrong.

## Decision

Install **fail-closed Row-Level Security** on every directly tenant-scoped table
as a defense-in-depth layer beneath the app-layer scoping.

- **Policy** (`tenant_isolation`, migration `202606200009`): each table is
  filtered by a per-request session variable —
  `conference_id = NULLIF(current_setting('app.conf_id', true), '')::bigint` for
  conference-scoped tables, `organization_id = … 'app.org_id' …` for
  organization-scoped tables. `USING` (reads/updates/deletes) **and** `WITH CHECK`
  (inserts/updates) both apply, so a tenant can neither read nor write outside its
  scope. When the variable is unset or empty the predicate is `NULL` → **zero
  rows** (fail-closed).
- **Not forced.** RLS is enabled but not `FORCE`d, so the **table owner** (the
  role that runs migrations and the current single-tenant app connection)
  bypasses it. Behaviour is therefore unchanged until the app connects as a
  separate **non-owner role without `BYPASSRLS`** and sets the session variables
  per request.
- **Tables covered:** the 11 `conference_id` tables (`sections, rooms,
  map_markers, map_routes, program_assignments, feedbacks, chat_messages,
  article_submissions, questions, check_ins, certificates`) and the 2
  `organization_id` tables (`users, conferences`). Parent-scoped tables
  (`profiles`, `consent_logs`, `chat_attachments`) need subquery policies and are
  a tracked follow-up.
- **Postgres only.** SQLite (unit tests) has no RLS; the migration is a no-op
  there and tests rely on the app-layer scoping.

## Enforcement model (`RLS_ENFORCED`)

Enforcement is opt-in via the `RLS_ENFORCED` flag so the policies can ship and be
verified without risk to the single-tenant deployment:

1. **Off (default):** the app connects as the table owner → RLS bypassed → today's
   behaviour.
2. **On:** the app connects as the restricted `conf_app` role (see
   `docs/rls/provision_app_role.sql`) and wraps each tenant request in a
   transaction that runs `SELECT set_config('app.org_id'/'app.conf_id', …, true)`
   (`SET LOCAL`) before any query. Reliable per-request variable binding requires
   a transaction because of connection pooling — a session-level `SET` would leak
   across pooled requests.

## Consequences

- The backstop is proven end-to-end on real Postgres by `TestRLSEnforcement`:
  connecting as a non-`BYPASSRLS` role, an unscoped query returns zero rows, a
  scoped query returns only its tenant's rows, and a cross-tenant write is
  rejected by `WITH CHECK`.
- Flipping `RLS_ENFORCED` on requires (a) the restricted role provisioned, (b) the
  app DSN switched to it, and (c) every tenant-scoped query running through the
  request transaction. Until the request-transaction wiring lands, the flag stays
  off and RLS is dormant (policies present, owner bypasses).
- Once enforced, every tenant-scoped row **must** carry its `conference_id` /
  `organization_id` (NULL is invisible under the policy) — which the write-path
  stamping (Ф2.2/Ф2.4) and the backfill already guarantee, and which the deferred
  `NOT NULL` flip (Ф2.8) will make structural.
