-- Migration 0011 | audit | Create audit_log table and wire fn_audit trigger to all audited tables | Depends: 0010
--
-- audit_log captures ALL writes (create/update/archive) across every module,
-- including AI-generated changes. It does NOT capture ordinary reads.
-- Sensitive reads (credential reveals, financial data) are captured separately
-- (credential_access_log is a dedicated table; financial access logging is Phase 2).
--
-- fn_audit() was defined in 0007. Here we create the audit_log table it writes to,
-- then wire the trigger to all audited tables.
--
-- AUDIT COVERAGE (all write operations on these tables):
--   companies, contacts, deals, projects, milestones, tasks, payments,
--   credentials, ratings, ai_actions, notes, attachments

BEGIN;

-- ============================================================
-- AUDIT_LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type      audit_actor_type   NOT NULL,
  -- null when actor_type = 'ai' or 'system'
  actor_user_id   uuid               REFERENCES users(id),
  entity_type     entity_type        NOT NULL,
  entity_id       uuid               NOT NULL,
  action          audit_action_type  NOT NULL,
  -- For updates: jsonb of {field: {old: v, new: v}} for each changed field.
  changed_fields  jsonb,
  at              timestamptz        NOT NULL DEFAULT now(),
  -- Which AI agent wrote this row (when actor_type = 'ai').
  agent           text
);

-- Indexes for the primary query patterns:
--   "What happened to this entity?"
--   "What happened recently?"
--   "What did this user do?"
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_at
  ON audit_log(at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log(actor_user_id)
  WHERE actor_user_id IS NOT NULL;

-- RLS: only admin reads the audit log; the fn_audit trigger (service-definer) writes it.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_admin_read ON audit_log;
CREATE POLICY audit_log_admin_read ON audit_log FOR SELECT
  USING (fn_is_admin());

-- Allow any session to INSERT (fn_audit runs SECURITY DEFINER; this is the fallback).
-- In practice, the trigger fires as the table owner which bypasses RLS anyway,
-- but this policy is here as defence-in-depth.
DROP POLICY IF EXISTS audit_log_system_insert ON audit_log;
CREATE POLICY audit_log_system_insert ON audit_log FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- WIRE fn_audit TRIGGER TO ALL AUDITED TABLES
-- The trigger passes the entity_type as a trigger argument (TG_ARGV[0]).
-- fn_audit was defined in 0007 with CREATE OR REPLACE.
-- ============================================================

-- companies
DROP TRIGGER IF EXISTS trg_audit ON companies;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION fn_audit('company');

-- contacts
DROP TRIGGER IF EXISTS trg_audit ON contacts;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION fn_audit('contact');

-- deals
DROP TRIGGER IF EXISTS trg_audit ON deals;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_audit('deal');

-- projects
DROP TRIGGER IF EXISTS trg_audit ON projects;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_audit('project');

-- milestones
DROP TRIGGER IF EXISTS trg_audit ON milestones;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION fn_audit('milestone');

-- tasks
DROP TRIGGER IF EXISTS trg_audit ON tasks;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION fn_audit('task');

-- payments
DROP TRIGGER IF EXISTS trg_audit ON payments;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_audit('payment');

-- credentials
DROP TRIGGER IF EXISTS trg_audit ON credentials;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION fn_audit('contact');
  -- entity_type 'contact' used for credentials since there's no 'credential' in entity_type enum;
  -- the entity_id is the credential.id — callers filter by entity_type='contact' AND entity_id=credential_id.
  -- Alternative: use 'contact' parent's id as entity_id. Design decision: log under contact
  -- since credentials belong to a contact. Noted here for clarity.

-- ratings
DROP TRIGGER IF EXISTS trg_audit ON ratings;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON ratings
  FOR EACH ROW EXECUTE FUNCTION fn_audit('rating');

-- ai_actions
DROP TRIGGER IF EXISTS trg_audit ON ai_actions;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON ai_actions
  FOR EACH ROW EXECUTE FUNCTION fn_audit('task');
  -- ai_actions don't have their own entity_type value; log under 'task' as the
  -- most common result_ref type. Phase 2: extend entity_type enum if needed.

-- notes
DROP TRIGGER IF EXISTS trg_audit ON notes;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION fn_audit('note');

-- attachments
DROP TRIGGER IF EXISTS trg_audit ON attachments;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION fn_audit('note');
  -- attachments don't have their own entity_type; log under 'note' as the closest
  -- non-entity polymorphic type. Phase 2: extend entity_type if needed.

COMMIT;
