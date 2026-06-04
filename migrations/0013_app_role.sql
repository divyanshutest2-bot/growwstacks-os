-- Migration 0013 | app_role | Production non-owner app role + grants | Depends: 0012
--
-- ============================================================================
-- WHY THIS EXISTS (the Phase 0 lesson, made permanent)
-- ============================================================================
-- Postgres does NOT apply RLS to a table's OWNER (neondb_owner) unless the table
-- is FORCE'd. Our tables use ENABLE (correct). Therefore the application MUST
-- connect as this NON-owner role — never as neondb_owner — or every RLS policy
-- is silently bypassed in production.
--
-- This migration creates `app_user` and grants it the privilege shape the app
-- needs. RLS then does the row filtering based on app.current_user_id (the GUC
-- the server action sets per request). The Postgres role stays constant
-- (app_user); the application identity comes from the GUC (single-app-role model).
--
-- ============================================================================
-- CRITICAL: credentials.secret_ref is granted COLUMN-BY-COLUMN
-- ============================================================================
-- A table-level GRANT SELECT on credentials would OVERRIDE the secret_ref column
-- denial (Postgres allows a column if EITHER table- or column-level SELECT is
-- present). So we GRANT SELECT on every credentials column EXCEPT secret_ref.
-- Only the reveal_credential server action (service role) ever reads plaintext.
--
-- ============================================================================
-- HUMAN STEP (run in YOUR terminal — never put the password in this file or chat)
-- ============================================================================
--   After applying this migration, give app_user a login + password yourself:
--     export NEW_PW='...'; psql "$DATABASE_URL" -c "ALTER ROLE app_user WITH LOGIN PASSWORD '$NEW_PW';"; unset NEW_PW
--   Then build the app's connection string with role=app_user and put it in
--   .env.local as DATABASE_URL. The migrations keep running as neondb_owner; the
--   APP runs as app_user.

BEGIN;

-- ============================================================
-- ROLE (NOLOGIN here; the human grants LOGIN + PASSWORD out-of-band)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;

-- ============================================================
-- SCHEMA + TABLE + SEQUENCE PRIVILEGES
-- DELETE is granted because join-table membership removal is a legitimate
-- state change (the documented exception to archive-only); RLS still gates it.
-- ============================================================
GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- nextval() in the display-id triggers needs USAGE; SELECT enables currval().
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Helper functions (fn_me/fn_my_role/fn_can_see/…) — PUBLIC already has EXECUTE,
-- but grant explicitly so a future REVOKE-from-PUBLIC doesn't break the app.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ============================================================
-- credentials.secret_ref COLUMN DENIAL (the critical bit)
-- Remove table-level SELECT, then re-grant every column EXCEPT secret_ref.
-- ============================================================
REVOKE SELECT ON credentials FROM app_user;
GRANT SELECT (
  id, contact_id, label, login_url, username,
  two_factor_enabled, two_factor_destination,
  we_have_account_access, our_access_account,
  client_credentials_available, notes,
  created_by, created_at, updated_at, archived_at
) ON credentials TO app_user;

-- ============================================================
-- DEFAULT PRIVILEGES — so tables/sequences created by the owner in LATER
-- migrations are auto-granted to app_user (no manual grant per new table).
-- NOTE: any FUTURE sensitive column (like another secret_ref) must get the same
-- column-by-column treatment as above — default privileges grant table-level.
-- ============================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_user;

COMMIT;

-- ============================================================================
-- VERIFY (after applying + setting the password):
--   Re-run scripts/verify-rls.sql but SET ROLE app_user instead of app_test —
--   every wall must hold identically. Or connect with the app_user connection
--   string and confirm: as a developer GUC, SELECT count(*) FROM companies = 0.
-- ============================================================================
