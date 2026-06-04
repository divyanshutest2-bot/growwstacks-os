-- Migration 0015 | view_security_invoker | Make ALL views honor RLS (security_invoker) | Depends: 0014
--
-- ============================================================================
-- THE BUG THIS FIXES (critical — caught by the Phase 1 developer-projection wall)
-- ============================================================================
-- A Postgres view, by default, executes with the privileges of the view's OWNER
-- (here: neondb_owner) — NOT the querying user. The owner BYPASSES RLS. So every
-- view (rollups AND the developer-safe / client-safe projections) returned rows
-- the querying role must never see:
--
--   as a DEVELOPER:
--     SELECT count(*) FROM contacts          -> 0   (RLS table access — correct)
--     SELECT count(*) FROM v_contact_rollup  -> 2   (VIEW bypassed RLS — LEAK)
--
-- The app reads through views constantly (rollups for lists/headers, v_*_dev /
-- v_*_client for role projections), so the ENTIRE RLS boundary was defeated for
-- view reads. Phase 0's verify-rls.sql only exercised TABLE access, so it passed
-- while views silently leaked.
--
-- FIX: Postgres 15+ supports `security_invoker = true`, which makes the view run
-- with the QUERYING user's privileges, so RLS on the underlying tables applies.
-- Neon is PG17 — fully supported. We flip it on for every public view.
--
-- This is idempotent and re-runnable; it also fixes a fresh rebuild (it runs
-- after 0008/0009 create the views). Any view added in a later phase should be
-- created `WITH (security_invoker = true)` from the start; re-running this
-- migration re-asserts the invariant across all views.
--
-- ⚠️ FOLLOW-UP (Phase 2, not now): ARCHITECTURE §5.10 intended PMs to read
-- AGGREGATE hours via rollup views while being denied raw time_logs rows. That
-- design relied on the view-owner bypass we are removing. Once views honor RLS, a
-- PM reading a rollup that aggregates time_logs will get 0 (RLS denies the PM on
-- time_logs). The correct mechanism is a dedicated SECURITY DEFINER function that
-- returns the aggregate with its own access check — to be built when the time_logs
-- UI lands in Phase 2. No impact on Phase 1 (no time_logs surfaced yet).

BEGIN;

DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.viewname);
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY (after applying):
--   As a developer (set the GUC), the view must now return 0:
--     SELECT set_config('app.current_user_id','00000000-0000-0000-0000-000000000003', true);
--     SELECT count(*) FROM v_contact_rollup;   -- expect 0 (was 2)
--   And every view should report reloptions including security_invoker=true:
--     SELECT viewname, reloptions FROM pg_views WHERE schemaname='public';
-- ============================================================================
