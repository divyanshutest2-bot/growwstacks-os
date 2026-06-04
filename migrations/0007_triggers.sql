-- Migration 0007 | triggers | All trigger functions and trigger wiring | Depends: 0006
--
-- Functions created here (all with CREATE OR REPLACE for idempotency):
--   fn_touch_updated_at        — sets updated_at = now() on UPDATE
--   fn_assign_display_id       — formats human-readable IDs on INSERT
--   fn_cache_spine_pointers    — fills denormalized contact_id/company_id/project_id/milestone_id
--   fn_backfill_company_on_contact — propagates company_id change to children
--   fn_validate_parent         — checks polymorphic parent exists and is not archived
--   fn_check_rating_direction  — enforces directional rule for human ratings
--   fn_audit                   — writes to audit_log on write operations
--   fn_orphan_sweep            — placeholder; wired to cron in Phase 5

BEGIN;

-- ============================================================
-- fn_touch_updated_at — set updated_at = now() on every UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Wire to every table that has an updated_at column.
DO $$ DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies', 'contacts', 'deals', 'projects', 'milestones', 'tasks',
    'payments', 'credentials', 'notes', 'ratings', 'ai_actions', 'time_logs',
    'tests', 'sop_documents', 'user_availability', 'digests', 'users'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_updated_at ON %I;
       CREATE TRIGGER trg_touch_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- fn_assign_display_id — format human-readable IDs on INSERT
-- Each entity type gets its own format. Milestones use a per-project
-- counter (projects.next_milestone_seq) instead of a global sequence.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_assign_display_id()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_seq int;
BEGIN
  -- Only assign on INSERT and only if display_id is null/empty.
  IF NEW.display_id IS NOT NULL AND NEW.display_id <> '' THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'companies' THEN
      NEW.display_id := 'CO-' || nextval('seq_company_display')::text;

    WHEN 'contacts' THEN
      NEW.display_id := 'CT-' || nextval('seq_contact_display')::text;

    WHEN 'deals' THEN
      NEW.display_id := 'DL-' || lpad(nextval('seq_deal_display')::text, 4, '0');

    WHEN 'projects' THEN
      NEW.display_id := 'pr-' || lpad(nextval('seq_project_display')::text, 4, '0');

    WHEN 'tasks' THEN
      NEW.display_id := 'T-' || nextval('seq_task_display')::text;

    WHEN 'payments' THEN
      NEW.display_id := 'PMT-' || lpad(nextval('seq_payment_display')::text, 4, '0');

    WHEN 'milestones' THEN
      -- Increment the per-project counter and use it as the milestone number.
      UPDATE projects
        SET next_milestone_seq = next_milestone_seq + 1
        WHERE id = NEW.project_id
        RETURNING next_milestone_seq INTO v_seq;
      IF v_seq IS NULL THEN
        RAISE EXCEPTION 'milestones.project_id % not found when assigning display_id', NEW.project_id;
      END IF;
      NEW.display_id := 'M' || v_seq::text;

    WHEN 'users' THEN
      NEW.display_id := 'U-' || lpad(nextval('seq_user_display')::text, 4, '0');

    ELSE
      -- Unknown table: do nothing, let the caller handle it.
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Wire fn_assign_display_id to all tables that need human-readable IDs.
DO $$ DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies', 'contacts', 'deals', 'projects', 'milestones',
    'tasks', 'payments', 'users'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_assign_display_id ON %I;
       CREATE TRIGGER trg_assign_display_id
         BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_assign_display_id();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- fn_cache_spine_pointers — maintain denormalized cache columns
-- Called BEFORE INSERT OR UPDATE on: deals, projects, milestones,
-- tasks, payments, time_logs.
-- These cached columns are NEVER hand-set in application code.
-- The trigger is the ONLY writer of these columns.
-- NULL is acceptable until the trigger fires (all caches are nullable).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cache_spine_pointers()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_contact_id  uuid;
  v_company_id  uuid;
  v_project_id  uuid;
  v_milestone_id uuid;
BEGIN
  CASE TG_TABLE_NAME

    -- deals: cache company_id from contact
    WHEN 'deals' THEN
      IF NEW.contact_id IS NOT NULL THEN
        SELECT c.company_id INTO v_company_id
          FROM contacts c WHERE c.id = NEW.contact_id;
        NEW.company_id := v_company_id;
      ELSE
        NEW.company_id := NULL;
      END IF;

    -- projects: cache contact_id + company_id from deal (if deal exists)
    WHEN 'projects' THEN
      IF NEW.deal_id IS NOT NULL THEN
        SELECT d.contact_id, d.company_id
          INTO v_contact_id, v_company_id
          FROM deals d WHERE d.id = NEW.deal_id;
        NEW.contact_id := v_contact_id;
        NEW.company_id := v_company_id;
      ELSE
        -- Internal project: no deal -> clear caches
        NEW.contact_id := NULL;
        NEW.company_id := NULL;
      END IF;

    -- milestones: cache contact_id + company_id from project
    WHEN 'milestones' THEN
      SELECT p.contact_id, p.company_id
        INTO v_contact_id, v_company_id
        FROM projects p WHERE p.id = NEW.project_id;
      NEW.contact_id := v_contact_id;
      NEW.company_id := v_company_id;

    -- tasks: cache based on parent_type
    WHEN 'tasks' THEN
      IF NEW.parent_type = 'milestone' THEN
        -- project_id and milestone_id come from the parent milestone
        NEW.milestone_id := NEW.parent_id;
        SELECT m.project_id, m.contact_id, m.company_id
          INTO v_project_id, v_contact_id, v_company_id
          FROM milestones m WHERE m.id = NEW.parent_id;
        NEW.project_id  := v_project_id;
        NEW.contact_id  := v_contact_id;
        NEW.company_id  := v_company_id;

      ELSIF NEW.parent_type = 'deal' THEN
        NEW.milestone_id := NULL;
        NEW.project_id   := NULL;
        SELECT d.contact_id, d.company_id
          INTO v_contact_id, v_company_id
          FROM deals d WHERE d.id = NEW.parent_id;
        NEW.contact_id := v_contact_id;
        NEW.company_id := v_company_id;

      ELSIF NEW.parent_type = 'payment' THEN
        NEW.milestone_id := NULL;
        NEW.project_id   := NULL;
        SELECT p.contact_id, p.company_id
          INTO v_contact_id, v_company_id
          FROM payments p WHERE p.id = NEW.parent_id;
        NEW.contact_id := v_contact_id;
        NEW.company_id := v_company_id;

      ELSE
        -- Unsupported parent_type; CHECK constraint handles the error.
        NULL;
      END IF;

    -- payments: cache contact_id from deal
    WHEN 'payments' THEN
      IF NEW.deal_id IS NOT NULL THEN
        SELECT d.contact_id INTO v_contact_id
          FROM deals d WHERE d.id = NEW.deal_id;
        NEW.contact_id := v_contact_id;
      ELSE
        NEW.contact_id := NULL;
      END IF;

    -- time_logs: cache project_id + milestone_id from task
    WHEN 'time_logs' THEN
      IF NEW.task_id IS NOT NULL THEN
        SELECT t.project_id, t.milestone_id
          INTO v_project_id, v_milestone_id
          FROM tasks t WHERE t.id = NEW.task_id;
        NEW.project_id   := v_project_id;
        NEW.milestone_id := v_milestone_id;
      ELSE
        NEW.project_id   := NULL;
        NEW.milestone_id := NULL;
      END IF;

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Wire fn_cache_spine_pointers.
DO $$ DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'deals', 'projects', 'milestones', 'tasks', 'payments', 'time_logs'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_cache_spine ON %I;
       CREATE TRIGGER trg_cache_spine
         BEFORE INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_cache_spine_pointers();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- fn_backfill_company_on_contact
-- When a company is attached (or changed) on a contact, propagate the
-- new company_id to all that contact's deals, projects, milestones, and
-- payments. This makes "company is optional, attach anytime" safe.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_backfill_company_on_contact()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only fire when company_id actually changed.
  IF OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  -- Propagate to deals
  UPDATE deals
    SET company_id = NEW.company_id
    WHERE contact_id = NEW.id;

  -- Propagate to projects
  UPDATE projects
    SET company_id = NEW.company_id
    WHERE contact_id = NEW.id;

  -- Propagate to milestones
  UPDATE milestones
    SET company_id = NEW.company_id
    WHERE contact_id = NEW.id;

  -- Propagate to tasks (all tasks with this contact cached)
  UPDATE tasks
    SET company_id = NEW.company_id
    WHERE contact_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_company_on_contact ON contacts;
CREATE TRIGGER trg_backfill_company_on_contact
  AFTER UPDATE OF company_id ON contacts
  FOR EACH ROW EXECUTE FUNCTION fn_backfill_company_on_contact();

-- ============================================================
-- fn_validate_parent — check polymorphic parent exists + not archived
-- Applied BEFORE INSERT OR UPDATE on all polymorphic tables.
-- Raises an exception if the (parent_type, parent_id) pair does not resolve
-- to a live (non-archived) row in the appropriate table.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_validate_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_found boolean := false;
BEGIN
  -- NULL parent_id should be caught by NOT NULL constraint; guard anyway.
  IF NEW.parent_id IS NULL OR NEW.parent_type IS NULL THEN
    RAISE EXCEPTION 'parent_type and parent_id must not be null';
  END IF;

  CASE NEW.parent_type::text
    WHEN 'contact' THEN
      SELECT EXISTS(SELECT 1 FROM contacts    WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'company' THEN
      SELECT EXISTS(SELECT 1 FROM companies   WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'deal' THEN
      SELECT EXISTS(SELECT 1 FROM deals       WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'project' THEN
      SELECT EXISTS(SELECT 1 FROM projects    WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'milestone' THEN
      SELECT EXISTS(SELECT 1 FROM milestones  WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'task' THEN
      SELECT EXISTS(SELECT 1 FROM tasks       WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'payment' THEN
      SELECT EXISTS(SELECT 1 FROM payments    WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'user' THEN
      SELECT EXISTS(SELECT 1 FROM users       WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'test' THEN
      SELECT EXISTS(SELECT 1 FROM tests       WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'note' THEN
      SELECT EXISTS(SELECT 1 FROM notes       WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    WHEN 'rating' THEN
      SELECT EXISTS(SELECT 1 FROM ratings     WHERE id = NEW.parent_id AND archived_at IS NULL) INTO v_found;
    ELSE
      RAISE EXCEPTION 'fn_validate_parent: unknown parent_type %', NEW.parent_type;
  END CASE;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Parent % % not found or archived', NEW.parent_type, NEW.parent_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Wire fn_validate_parent to all polymorphic tables.
DO $$ DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'attachments', 'notes', 'conversation_entries',
    'ai_insights', 'ratings', 'embeddings', 'tests'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_validate_parent ON %I;
       CREATE TRIGGER trg_validate_parent
         BEFORE INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_validate_parent();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- fn_check_rating_direction — enforce directional rule for HUMAN ratings
-- admin -> pm, pm -> developer.
-- AI ratings (rater_type = 'ai') bypass direction; they must carry rating_basis
-- (checked at the application layer, not SQL — too complex for a trigger).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_rating_direction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_rater_role user_role;
  v_ratee_role user_role;
BEGIN
  -- Only enforce for human raters with a specific ratee (person-to-person rating).
  IF NEW.rater_type <> 'human' THEN
    RETURN NEW;
  END IF;
  IF NEW.rater_user_id IS NULL OR NEW.ratee_user_id IS NULL THEN
    -- Rating a thing (no ratee person) — direction rule doesn't apply.
    RETURN NEW;
  END IF;

  SELECT role INTO v_rater_role FROM users WHERE id = NEW.rater_user_id AND archived_at IS NULL;
  SELECT role INTO v_ratee_role FROM users WHERE id = NEW.ratee_user_id AND archived_at IS NULL;

  IF v_rater_role IS NULL THEN
    RAISE EXCEPTION 'Rating direction check: rater user % not found or archived', NEW.rater_user_id;
  END IF;
  IF v_ratee_role IS NULL THEN
    RAISE EXCEPTION 'Rating direction check: ratee user % not found or archived', NEW.ratee_user_id;
  END IF;

  -- Allowed directions: admin->pm, admin->developer, pm->developer.
  IF v_rater_role = 'admin' AND v_ratee_role IN ('pm', 'developer') THEN
    RETURN NEW;
  END IF;
  IF v_rater_role = 'pm' AND v_ratee_role = 'developer' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Invalid rating direction: % (%) may not rate % (%)',
    NEW.rater_user_id, v_rater_role, NEW.ratee_user_id, v_ratee_role;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_rating_direction ON ratings;
CREATE TRIGGER trg_check_rating_direction
  BEFORE INSERT OR UPDATE ON ratings
  FOR EACH ROW EXECUTE FUNCTION fn_check_rating_direction();

-- ============================================================
-- fn_audit — write to audit_log on all write operations
-- audit_log is created in 0011; this trigger is wired after audit_log exists.
-- We define the function here so it's available, but the trigger DROP/CREATE
-- on each table is done at the end of 0011 after the table exists.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor_type  audit_actor_type;
  v_actor_id    uuid;
  v_action      audit_action_type;
  v_changed     jsonb := NULL;
  v_me          uuid;
BEGIN
  -- Determine actor
  v_me := NULLIF(current_setting('app.current_user_id', true), '')::uuid;

  IF v_me IS NOT NULL THEN
    v_actor_type := 'human';
    v_actor_id   := v_me;
  ELSE
    -- No user in session: system (trigger, migration, background job)
    v_actor_type := 'system';
    v_actor_id   := NULL;
  END IF;

  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.archived_at IS NOT NULL AND (OLD.archived_at IS NULL OR OLD.archived_at IS DISTINCT FROM NEW.archived_at) THEN
      v_action := 'archive';
    ELSE
      v_action := 'update';
    END IF;
  ELSE
    -- Should never be DELETE (no DELETE in this schema) but handle gracefully.
    RETURN OLD;
  END IF;

  -- For updates: build jsonb of changed fields (old -> new).
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(
      t.key,
      jsonb_build_object('old', t.value, 'new', n.value)
    )
    INTO v_changed
    FROM jsonb_each(to_jsonb(OLD)) AS t
    JOIN jsonb_each(to_jsonb(NEW)) AS n ON t.key = n.key
    WHERE t.value IS DISTINCT FROM n.value;
  END IF;

  -- Write audit row (audit_log table created in 0011)
  INSERT INTO audit_log (
    actor_type, actor_user_id, entity_type, entity_id,
    action, changed_fields, at
  ) VALUES (
    v_actor_type, v_actor_id,
    TG_ARGV[0]::entity_type,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE OLD.id END,
    v_action, v_changed, now()
  );

  RETURN CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE NEW END;
END;
$$;

-- NOTE: fn_audit trigger WIRING is done in 0011 after audit_log is created.
-- This function definition here is so 0011 can reference it.

-- ============================================================
-- fn_orphan_sweep — placeholder scheduled sweep (wired in Phase 5)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_orphan_sweep()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Scheduled sweep: log orphaned polymorphic rows for review.
  -- Wire to pg_cron or Cloudflare Worker Cron in Phase 5.
  -- Because we use archive-not-delete, true orphans are near-impossible,
  -- but this is a backstop to detect any integration bugs.
  NULL;
END;
$$;

COMMIT;
