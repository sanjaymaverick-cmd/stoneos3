-- Superseded: the app no longer needs BYPASSRLS.
--
-- This migration used to run `ALTER ROLE stoneos BYPASSRLS`, because the RLS
-- migration set FORCE ROW LEVEL SECURITY on every tenant table. FORCE makes
-- RLS apply even to the table owner, so the application — which owns those
-- tables and never sets app.current_factory_id on its own connection — read
-- zero rows from everything. BYPASSRLS papered over that.
--
-- Two problems: granting BYPASSRLS requires superuser, which managed Postgres
-- (RDS, Neon, Supabase) does not give you, and a bare ALTER ROLE on a
-- hardcoded role name fails outright when the app role is called something
-- else. Between them, this migration could not run on any realistic
-- production database.
--
-- 20260713000000 now enables RLS WITHOUT forcing it, so the owner is exempt by
-- ordinary Postgres semantics and no elevated privilege is needed. The
-- copilot role does not own the tables and stays fully enforced.
--
-- Kept as a no-op rather than deleted: removing an applied migration changes
-- the history Prisma has already recorded. The revoke below is deliberately
-- conditional — it tidies up databases that were bootstrapped under the old
-- scheme, and does nothing anywhere else, including where the current role
-- lacks the privilege to revoke anything.
DO $$
DECLARE
  app_role text := current_user;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role AND rolbypassrls)
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    EXECUTE format('ALTER ROLE %I NOBYPASSRLS', app_role);
    RAISE NOTICE 'Revoked the no-longer-needed BYPASSRLS from %', app_role;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping BYPASSRLS cleanup: not permitted for the current role.';
END $$;
