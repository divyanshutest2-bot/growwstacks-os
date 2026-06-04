-- Migration 0017 | fix_user_availability_trigger | Drop misfired trg_touch_updated_at on user_availability | Depends: 0016
--
-- BUG: 0007_triggers.sql wires trg_touch_updated_at (BEFORE UPDATE → fn_touch_updated_at,
-- which runs `NEW.updated_at := now()`) onto user_availability — but that table has NO
-- updated_at column (0005 defines it as exactly id, user_id, date, available_hours,
-- UNIQUE(user_id,date)). So ANY UPDATE on the table throws:
--     record "new" has no field "updated_at"
-- The seed dodged it by being insert-only; the app hits it the moment availability is
-- upserted/edited. The shipped RLS policy `user_avail_update` (0010) proves UPDATE is the
-- intended write path (a user upserts their own (user_id,date) row), so the trigger is
-- breaking a designed operation.
--
-- FIX (Option A): drop the trigger from user_availability ONLY. Every other table keeps
-- trg_touch_updated_at. Rationale: ARCHITECTURE.md §264 specs user_availability as exactly
-- (user_id, date, available_hours) — it is deliberately NOT an entity table (no updated_at,
-- no archived_at). Nothing reads user_availability.updated_at (no view/query/rollup). So the
-- table's inclusion in 0007's "tables with an updated_at column" array was the mistake.
--
-- NOTE: 0007_triggers.sql STILL lists 'user_availability' in its FOREACH array (line 33).
-- We do not edit historical migrations (they run once, forward). This migration is the
-- standing fix; if 0007 is ever re-run from scratch, re-apply 0017 after it.
--
-- Idempotent: DROP TRIGGER IF EXISTS is safe to run more than once.

BEGIN;

DROP TRIGGER IF EXISTS trg_touch_updated_at ON user_availability;

COMMIT;
