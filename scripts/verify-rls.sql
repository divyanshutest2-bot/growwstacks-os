-- GrowwStacks OS — Phase 0 RLS Verification (real-role enforcement)
-- Run after migrations + seed:  psql "$DATABASE_URL" -f scripts/verify-rls.sql
--
-- ============================================================================
-- WHY THE OLD VERSION REPORTED EVERY WALL OPEN
-- ============================================================================
-- The migrations and verify script both connect as the database OWNER
-- (neondb_owner). Postgres does NOT apply RLS to a table's owner unless the
-- table is set to FORCE ROW LEVEL SECURITY (we use ENABLE, which is correct for
-- production — the app connects as a NON-owner role). So setting
-- app.current_user_id while connected as the owner sets the GUC but the policies
-- are never evaluated: the owner sees and writes everything.
--
-- This rewrite mirrors production: it creates a non-owner role (app_test) with
-- the same privilege shape the real app role will have, does SET ROLE app_test so
-- RLS actually applies, and only then sets app.current_user_id to impersonate each
-- seed user. The Postgres role stays constant (app_test); the *application
-- identity* comes from the GUC — this is the GUC-based model the policies use.
--
-- Seed UUIDs (must match 0012_seed.sql exactly):
--   admin:00..01  pm:00..02  developer:00..03  sales:00..04  finance:00..05
--
-- Output: each check RAISEs NOTICE 'PASS …' or 'FAIL …'. Scan for FAIL.
-- ============================================================================

\set ON_ERROR_STOP off

-- ============================================================================
-- 0. SET UP THE APP_TEST ROLE (non-owner, so RLS applies)
-- Mirrors the privilege shape the production app role needs.
-- NOTE the credentials.secret_ref handling: we must NOT grant table-level SELECT
-- on credentials, because a table-level SELECT overrides a column-level REVOKE
-- (Postgres allows a column if EITHER table- or column-level SELECT is present).
-- So we grant SELECT on every credentials column EXCEPT secret_ref explicitly.
-- The real app role must be granted the same way (Phase 1 grants migration).
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_test') THEN
    CREATE ROLE app_test NOLOGIN;
  END IF;
END $$;

-- Let the owner SET ROLE into app_test.
GRANT app_test TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO app_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_test;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_test;

-- Remove the table-level SELECT on credentials, then re-grant every column
-- EXCEPT secret_ref. This is what makes the column-denial test meaningful.
REVOKE SELECT ON credentials FROM app_test;
GRANT SELECT (
  id, contact_id, label, login_url, username,
  two_factor_enabled, two_factor_destination,
  we_have_account_access, our_access_account,
  client_credentials_available, notes,
  created_by, created_at, updated_at, archived_at
) ON credentials TO app_test;

\echo ''
\echo '=== app_test role ready (non-owner; RLS will apply under SET ROLE) ==='
\echo ''

-- ============================================================================
-- 1. DEVELOPER HARD WALLS — expect 0 rows on companies/contacts/deals/payments
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000003', false);
SET ROLE app_test;

DO $$
DECLARE c int; ct int; d int; p int; pr int; tk int; tl int; cr int;
BEGIN
  SELECT count(*) INTO c  FROM companies;
  SELECT count(*) INTO ct FROM contacts;
  SELECT count(*) INTO d  FROM deals;
  SELECT count(*) INTO p  FROM payments;
  SELECT count(*) INTO pr FROM projects;
  SELECT count(*) INTO tk FROM tasks;
  SELECT count(*) INTO tl FROM time_logs;
  SELECT count(*) INTO cr FROM credentials;

  IF c  = 0 THEN RAISE NOTICE 'PASS: developer sees 0 companies'; ELSE RAISE NOTICE 'FAIL: developer sees % companies (expect 0)', c; END IF;
  IF ct = 0 THEN RAISE NOTICE 'PASS: developer sees 0 contacts';  ELSE RAISE NOTICE 'FAIL: developer sees % contacts (expect 0)', ct; END IF;
  IF d  = 0 THEN RAISE NOTICE 'PASS: developer sees 0 deals';     ELSE RAISE NOTICE 'FAIL: developer sees % deals (expect 0)', d; END IF;
  IF p  = 0 THEN RAISE NOTICE 'PASS: developer sees 0 payments';  ELSE RAISE NOTICE 'FAIL: developer sees % payments (expect 0)', p; END IF;

  -- Developer CAN see: their member project, its tasks, the linked credential metadata.
  IF pr = 1 THEN RAISE NOTICE 'PASS: developer sees 1 member project';      ELSE RAISE NOTICE 'FAIL: developer sees % projects (expect 1)', pr; END IF;
  IF tk = 2 THEN RAISE NOTICE 'PASS: developer sees 2 tasks in project';    ELSE RAISE NOTICE 'FAIL: developer sees % tasks (expect 2)', tk; END IF;
  IF tl = 0 THEN RAISE NOTICE 'PASS: developer sees 0 time_logs (none own)';ELSE RAISE NOTICE 'FAIL: developer sees % time_logs (expect 0)', tl; END IF;
  IF cr = 1 THEN RAISE NOTICE 'PASS: developer sees 1 linked credential (metadata)'; ELSE RAISE NOTICE 'FAIL: developer sees % credentials (expect 1)', cr; END IF;
END $$;

-- secret_ref column denial (developer can see the cred row, NOT the secret column)
DO $$
DECLARE v text;
BEGIN
  BEGIN
    SELECT secret_ref INTO v FROM credentials LIMIT 1;
    RAISE NOTICE 'FAIL: developer read secret_ref column (should be denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: developer denied secret_ref column (permission denied)';
  END;
END $$;

RESET ROLE;

-- ============================================================================
-- 2. ADMIN FULL ACCESS — expect >0 everywhere
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', false);
SET ROLE app_test;

DO $$
DECLARE c int; ct int; d int; p int; pr int; u int;
BEGIN
  SELECT count(*) INTO c  FROM companies;
  SELECT count(*) INTO ct FROM contacts;
  SELECT count(*) INTO d  FROM deals;
  SELECT count(*) INTO p  FROM payments;
  SELECT count(*) INTO pr FROM projects;
  SELECT count(*) INTO u  FROM users;
  IF c  > 0 THEN RAISE NOTICE 'PASS: admin sees companies (%)', c; ELSE RAISE NOTICE 'FAIL: admin sees 0 companies'; END IF;
  IF ct > 0 THEN RAISE NOTICE 'PASS: admin sees contacts (%)', ct; ELSE RAISE NOTICE 'FAIL: admin sees 0 contacts'; END IF;
  IF d  > 0 THEN RAISE NOTICE 'PASS: admin sees deals (%)', d; ELSE RAISE NOTICE 'FAIL: admin sees 0 deals'; END IF;
  IF p  > 0 THEN RAISE NOTICE 'PASS: admin sees payments (%)', p; ELSE RAISE NOTICE 'FAIL: admin sees 0 payments'; END IF;
  IF pr > 0 THEN RAISE NOTICE 'PASS: admin sees projects (%)', pr; ELSE RAISE NOTICE 'FAIL: admin sees 0 projects'; END IF;
  IF u  > 0 THEN RAISE NOTICE 'PASS: admin sees users (%)', u; ELSE RAISE NOTICE 'FAIL: admin sees 0 users'; END IF;
END $$;

-- Even admin cannot read secret_ref via the normal column path (reveal action only).
DO $$
DECLARE v text;
BEGIN
  BEGIN
    SELECT secret_ref INTO v FROM credentials LIMIT 1;
    RAISE NOTICE 'FAIL: admin read secret_ref column (should be denied — reveal action only)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: admin denied secret_ref column (reveal action is the only path)';
  END;
END $$;

RESET ROLE;

-- ============================================================================
-- 3. SALES — sees contacts; CANNOT create projects
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000004', false);
SET ROLE app_test;

DO $$
DECLARE ct int;
BEGIN
  SELECT count(*) INTO ct FROM contacts;
  IF ct = 2 THEN RAISE NOTICE 'PASS: sales sees all contacts (2)'; ELSE RAISE NOTICE 'FAIL: sales sees % contacts (expect 2)', ct; END IF;
END $$;

-- Explicit unique display_id so the ONLY possible failure is the RLS WITH CHECK
-- (avoids the duplicate-key collision the old test hit).
DO $$
BEGIN
  BEGIN
    INSERT INTO projects (display_id, name, status)
      VALUES ('pr-rlstest-sales', 'RLS test (sales)', 'upcoming');
    RAISE NOTICE 'FAIL: sales created a project (should be blocked)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: sales project INSERT blocked by RLS';
  END;
END $$;

RESET ROLE;

-- ============================================================================
-- 4. FINANCE — sees payments; CANNOT create projects
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000005', false);
SET ROLE app_test;

DO $$
DECLARE p int;
BEGIN
  SELECT count(*) INTO p FROM payments;
  IF p > 0 THEN RAISE NOTICE 'PASS: finance sees payments (%)', p; ELSE RAISE NOTICE 'FAIL: finance sees 0 payments'; END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO projects (display_id, name, status)
      VALUES ('pr-rlstest-finance', 'RLS test (finance)', 'upcoming');
    RAISE NOTICE 'FAIL: finance created a project (should be blocked)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: finance project INSERT blocked by RLS';
  END;
END $$;

RESET ROLE;

-- ============================================================================
-- 5. ONLY FINANCE/ADMIN CONFIRMS PAYMENTS
-- PM may update payments but NOT set status='confirmed' (WITH CHECK blocks it).
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000002', false); -- PM
SET ROLE app_test;

DO $$
DECLARE v_pid uuid;
BEGIN
  SELECT id INTO v_pid FROM payments LIMIT 1;
  BEGIN
    UPDATE payments SET status = 'confirmed', confirmed_by = fn_me() WHERE id = v_pid;
    RAISE NOTICE 'FAIL: PM confirmed a payment (should be finance/admin only)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: PM cannot set status=confirmed (WITH CHECK blocked)';
  END;
END $$;

RESET ROLE;

-- Finance CAN confirm
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000005', false); -- Finance
SET ROLE app_test;

DO $$
DECLARE v_pid uuid; v_status payment_status;
BEGIN
  SELECT id INTO v_pid FROM payments LIMIT 1;
  UPDATE payments SET status = 'confirmed', confirmed_by = fn_me() WHERE id = v_pid;
  SELECT status INTO v_status FROM payments WHERE id = v_pid;
  IF v_status = 'confirmed' THEN
    RAISE NOTICE 'PASS: finance confirmed payment';
  ELSE
    RAISE NOTICE 'FAIL: finance UPDATE did not take effect (status=%)', v_status;
  END IF;
END $$;

RESET ROLE;

-- Cleanup as owner (reset the seed payment back to 'due')
UPDATE payments SET status = 'due', confirmed_by = NULL
  WHERE id = 'cafe0000-0000-0000-0000-000000000001';

-- ============================================================================
-- 6. TIME_LOGS ISOLATION (PM has NO direct SELECT policy; uses rollup views)
-- No time_logs in seed, so this asserts the policy shape, not row counts.
-- A data-bearing check belongs in Phase 1 once real time_logs exist.
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000002', false); -- PM
SET ROLE app_test;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM time_logs;        -- PM: no SELECT policy -> 0 rows (deny-all)
  IF n = 0 THEN RAISE NOTICE 'PASS: PM sees 0 raw time_logs rows (uses rollup views for aggregate)';
  ELSE RAISE NOTICE 'FAIL: PM sees % raw time_logs rows (should use rollup views)', n; END IF;
END $$;

RESET ROLE;

-- ============================================================================
-- 7. VIEWS HONOR RLS (security_invoker) — regression guard for the 0015 fix
-- A view runs as its OWNER (bypassing RLS) unless security_invoker=true. This
-- caught a real leak: a developer saw contacts via v_contact_rollup while the
-- contacts TABLE correctly returned 0. Assert the projection honors RLS now.
-- ============================================================================
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000003', false); -- developer
SET ROLE app_test;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM v_contact_rollup;   -- developer hard wall must hold THROUGH the view
  IF n = 0 THEN RAISE NOTICE 'PASS: developer sees 0 contacts via v_contact_rollup (view honors RLS)';
  ELSE RAISE NOTICE 'FAIL: developer sees % rows via v_contact_rollup — VIEW BYPASSES RLS (apply 0015)', n; END IF;
END $$;

RESET ROLE;

-- Every public view must carry security_invoker=true (owner check).
DO $$
DECLARE leaky text;
BEGIN
  SELECT string_agg(viewname, ', ') INTO leaky
  FROM pg_views
  WHERE schemaname = 'public'
    AND COALESCE(array_to_string(
      (SELECT reloptions FROM pg_class WHERE relname = viewname), ','), '') NOT LIKE '%security_invoker=true%';
  IF leaky IS NULL THEN RAISE NOTICE 'PASS: all public views are security_invoker=true';
  ELSE RAISE NOTICE 'FAIL: views NOT security_invoker (leak RLS): %', leaky; END IF;
END $$;

-- ============================================================================
-- 8. 🚨 KEYSTONE — fn_prevent_role_escalation blocks non-admin role/status change
-- ----------------------------------------------------------------------------
-- THE LOAD-BEARING ASSERTION OF THE PERMISSION MODEL.
-- users_update RLS lets a user UPDATE their OWN row (USING admin OR id=fn_me()).
-- So an UPDATE of role/status on one's own row is NOT blocked at the row level —
-- it reaches the BEFORE-UPDATE trigger fn_prevent_role_escalation, which RAISEs
-- for any non-admin changing role or status. This section asserts that directly
-- at the DB layer, under the non-owner app_test role (so RLS + the trigger both
-- apply exactly as in production).
--
-- The Users vertical-slice actions (updateUserRole/updateUserStatus) CATCH this
-- exception and return a structured refusal; this is the authoritative proof that
-- the refusal is real and DB-enforced, not a UI-only gate.
-- ============================================================================

-- 8a. As the DEVELOPER (non-admin), attempt to self-promote to admin → MUST RAISE.
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000003', false); -- developer
SET ROLE app_test;

DO $$
BEGIN
  BEGIN
    UPDATE users SET role = 'admin'
    WHERE id = '00000000-0000-0000-0000-000000000003';  -- developer's OWN row
    -- If we reach here, the trigger did NOT fire → the keystone is broken.
    RAISE NOTICE 'FAIL: non-admin self role-change SUCCEEDED (fn_prevent_role_escalation did not block)';
  EXCEPTION WHEN OTHERS THEN
    -- Expected: 'Only admin may change user role or status'.
    RAISE NOTICE 'PASS: non-admin self role-change blocked by fn_prevent_role_escalation (%)', SQLERRM;
  END;
END $$;

-- 8b. Same actor, attempt a self STATUS change (active → away) → MUST RAISE too.
DO $$
BEGIN
  BEGIN
    UPDATE users SET status = 'away'
    WHERE id = '00000000-0000-0000-0000-000000000003';
    RAISE NOTICE 'FAIL: non-admin self status-change SUCCEEDED (fn_prevent_role_escalation did not block)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS: non-admin self status-change blocked by fn_prevent_role_escalation (%)', SQLERRM;
  END;
END $$;

-- Confirm the developer's role/status are UNCHANGED after the blocked attempts.
DO $$
DECLARE r user_role; s user_status;
BEGIN
  SELECT role, status INTO r, s FROM users
  WHERE id = '00000000-0000-0000-0000-000000000003';
  IF r = 'developer' AND s = 'active' THEN
    RAISE NOTICE 'PASS: developer row still role=developer status=active (no escalation persisted)';
  ELSE
    RAISE NOTICE 'FAIL: developer row mutated to role=% status=% (escalation persisted)', r, s;
  END IF;
END $$;

RESET ROLE;

-- 8c. As the ADMIN, a role/status change SUCCEEDS — then RESET so the seed is
-- not polluted (change developer status away→active is a no-op; we toggle and
-- restore to prove the admin path works without leaving drift).
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', false); -- admin
SET ROLE app_test;

DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    UPDATE users SET status = 'away'
    WHERE id = '00000000-0000-0000-0000-000000000003';   -- admin CAN change anyone
    ok := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL: admin status-change was blocked (%) — should be allowed', SQLERRM;
  END;

  IF ok THEN
    -- RESET it back so the seed stays clean (away → active).
    UPDATE users SET status = 'active'
    WHERE id = '00000000-0000-0000-0000-000000000003';
    RAISE NOTICE 'PASS: admin status-change allowed by fn_prevent_role_escalation (then reset to active)';
  END IF;
END $$;

RESET ROLE;

\echo ''
\echo '=== RLS verification complete. Scan NOTICE lines above for any FAIL. ==='
\echo ''

-- ============================================================================
-- TEARDOWN (optional): drop the test role to keep the DB clean.
-- Commented out so you can re-inspect grants; uncomment to remove.
-- ============================================================================
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_test;
-- REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_test;
-- REVOKE USAGE ON SCHEMA public FROM app_test;
-- REVOKE app_test FROM CURRENT_USER;
-- DROP ROLE app_test;
