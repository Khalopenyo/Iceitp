-- Provision the restricted application role used when RLS_ENFORCED=true.
--
-- This role is a NON-OWNER role WITHOUT BYPASSRLS, so it is subject to the
-- tenant_isolation policies installed by migration 202606200009. The current
-- single-tenant app connects as the table owner (which bypasses RLS); switch the
-- app's DATABASE_URL to this role only together with the request-transaction
-- wiring (see docs/adr/0006-tenant-row-level-security.md).
--
-- Run as the database owner/superuser. Pass the password as a psql variable so it
-- is never hard-coded:
--
--   psql "$DATABASE_URL" -v app_password="'<strong-password>'" \
--        -f docs/rls/provision_app_role.sql
--
-- Idempotent: safe to re-run (creates the role only if absent; GRANTs are
-- additive; ALTER DEFAULT PRIVILEGES covers tables created by later migrations).

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'conf_app') THEN
    CREATE ROLE conf_app LOGIN
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- Set/rotate the password from the psql variable.
ALTER ROLE conf_app WITH PASSWORD :app_password;

GRANT USAGE ON SCHEMA public TO conf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO conf_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO conf_app;

-- Cover tables/sequences created by future migrations. Run as the role that owns
-- (creates) the tables so the default privileges attach to its objects.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO conf_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO conf_app;
