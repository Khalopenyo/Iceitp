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

The app runs **two connection pools** (`MIGRATION_DATABASE_URL` = owner,
`DATABASE_URL` = serving). They are the same DSN unless RLS is being rolled out.

1. **Off (default):** `MIGRATION_DATABASE_URL` is unset → both pools resolve to the
   single owner DSN → RLS bypassed → today's behaviour.
2. **On:**
   - `MIGRATION_DATABASE_URL` → the **owner** role: runs migrations + seed +
     `bootstrap_admin`, resolves the tenant in `tenant.Middleware` (it reads the
     RLS-protected `conferences` table — must bypass RLS, else `ConfID` would
     always be 0), and backs `AuthHandler` (global email/phone uniqueness + login
     span the whole DB and must bypass RLS).
   - `DATABASE_URL` → the restricted **`conf_app`** role (see
     `docs/rls/provision_app_role.sql`): serves every tenant-scoped handler. Each
     request is wrapped in a transaction that runs
     `SELECT set_config('app.org_id'/'app.conf_id', …, true)` (`SET LOCAL`) before
     any query; reliable per-request binding needs a transaction because a
     session-level `SET` would leak across pooled connections.

## Consequences

- The backstop is proven end-to-end on real Postgres by `TestRLSEnforcement`
  (conf-scoped fail-closed + `WITH CHECK`) and `TestRLSOrgScopedAndOwnerBypass`
  (org-scoped `users`: owner sees all → auth works; restricted role fail-closed
  without `app.org_id`, scoped with it).
- The two-pool split makes the rollout executable: migrations/seed/auth run on the
  owner pool, tenant requests on `conf_app`. Flipping `RLS_ENFORCED` on still
  requires (a) the restricted role provisioned, (b) `DATABASE_URL` pointed at it
  with `MIGRATION_DATABASE_URL` at the owner, and (c) the remaining tenant-scoped
  queries (e.g. `documents.go`, public `VerifyCertificate` which must stay on the
  owner pool) routed correctly. Until then the flag stays off and RLS is dormant
  (policies present, owner bypasses).
- Once enforced, every tenant-scoped row **must** carry its `conference_id` /
  `organization_id` (NULL is invisible under the policy) — which the write-path
  stamping (Ф2.2/Ф2.4) and the backfill already guarantee, and which the deferred
  `NOT NULL` flip (Ф2.8) will make structural.
