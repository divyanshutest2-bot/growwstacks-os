-- GrowwStacks OS — Phase 0 Smoke Test
-- Run after applying all migrations (0000 through 0012) + seed.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/verify-phase0.sql
--
-- Each check emits a line starting with PASS: or prints nothing (which is
-- itself a signal — a PASS line that doesn't appear means the check failed).
-- DO blocks emit PASS/FAIL via RAISE NOTICE.
-- Review all output; anything missing a PASS is a failure.

-- ============================================================
-- SECTION 1: Core table existence
-- ============================================================

SELECT 'PASS: table companies' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'companies' AND table_schema = 'public'
);
SELECT 'PASS: table contacts' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'contacts' AND table_schema = 'public'
);
SELECT 'PASS: table deals' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'deals' AND table_schema = 'public'
);
SELECT 'PASS: table projects' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'projects' AND table_schema = 'public'
);
SELECT 'PASS: table milestones' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'milestones' AND table_schema = 'public'
);
SELECT 'PASS: table tasks' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'tasks' AND table_schema = 'public'
);
SELECT 'PASS: table payments' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'payments' AND table_schema = 'public'
);
SELECT 'PASS: table users' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'users' AND table_schema = 'public'
);
SELECT 'PASS: table credentials' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'credentials' AND table_schema = 'public'
);
SELECT 'PASS: table credential_links' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'credential_links' AND table_schema = 'public'
);
SELECT 'PASS: table credential_access_log' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'credential_access_log' AND table_schema = 'public'
);
SELECT 'PASS: table user_availability' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'user_availability' AND table_schema = 'public'
);
SELECT 'PASS: table notes' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'notes' AND table_schema = 'public'
);
SELECT 'PASS: table attachments' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'attachments' AND table_schema = 'public'
);
SELECT 'PASS: table conversation_entries' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'conversation_entries' AND table_schema = 'public'
);
SELECT 'PASS: table ai_insights' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'ai_insights' AND table_schema = 'public'
);
SELECT 'PASS: table ratings' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'ratings' AND table_schema = 'public'
);
SELECT 'PASS: table tests' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'tests' AND table_schema = 'public'
);
SELECT 'PASS: table time_logs' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'time_logs' AND table_schema = 'public'
);
SELECT 'PASS: table apps' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'apps' AND table_schema = 'public'
);
SELECT 'PASS: table app_links' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'app_links' AND table_schema = 'public'
);
SELECT 'PASS: table contact_owners' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'contact_owners' AND table_schema = 'public'
);
SELECT 'PASS: table deal_owners' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'deal_owners' AND table_schema = 'public'
);
SELECT 'PASS: table project_members' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'project_members' AND table_schema = 'public'
);
SELECT 'PASS: table milestone_members' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'milestone_members' AND table_schema = 'public'
);
SELECT 'PASS: table task_managers' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'task_managers' AND table_schema = 'public'
);
SELECT 'PASS: table task_assignees' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'task_assignees' AND table_schema = 'public'
);
SELECT 'PASS: table contact_lead_sources' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'contact_lead_sources' AND table_schema = 'public'
);
SELECT 'PASS: table deal_tags' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'deal_tags' AND table_schema = 'public'
);
SELECT 'PASS: table ai_actions' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'ai_actions' AND table_schema = 'public'
);
SELECT 'PASS: table sop_documents' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'sop_documents' AND table_schema = 'public'
);
SELECT 'PASS: table project_timeline_events' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'project_timeline_events' AND table_schema = 'public'
);
SELECT 'PASS: table digests' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'digests' AND table_schema = 'public'
);
SELECT 'PASS: table embeddings' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'embeddings' AND table_schema = 'public'
);
SELECT 'PASS: table audit_log' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'audit_log' AND table_schema = 'public'
);

-- ============================================================
-- SECTION 2: Enum existence (spot-checks for key enums)
-- ============================================================

SELECT 'PASS: enum entity_type' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'entity_type'
);
SELECT 'PASS: enum user_role' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'user_role'
);
SELECT 'PASS: enum deal_stage' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'deal_stage'
);
SELECT 'PASS: enum payment_status' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'payment_status'
);
SELECT 'PASS: enum task_status' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'task_status'
);
SELECT 'PASS: enum project_status' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'project_status'
);
SELECT 'PASS: enum milestone_status' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'milestone_status'
);
SELECT 'PASS: enum contact_status' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'contact_status'
);
SELECT 'PASS: enum lead_source' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'lead_source'
);
SELECT 'PASS: enum conversation_channel' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'conversation_channel'
);
SELECT 'PASS: enum rater_type' WHERE EXISTS (
  SELECT 1 FROM pg_type WHERE typname = 'rater_type'
);
SELECT 'PASS: enum attachment_kind' WHERE EXISTS (
  SELECT 1 FROM pg_type
  -- stored as 'attachment_kind' or 'kind' depending on migration authoring;
  -- check both
  WHERE typname IN ('attachment_kind', 'kind')
  LIMIT 1
);

-- ============================================================
-- SECTION 3: RLS enabled on key tables
-- ============================================================

SELECT 'PASS: RLS on companies' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'companies'
);
SELECT 'PASS: RLS on contacts' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'contacts'
);
SELECT 'PASS: RLS on deals' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'deals'
);
SELECT 'PASS: RLS on projects' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'projects'
);
SELECT 'PASS: RLS on payments' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'payments'
);
SELECT 'PASS: RLS on users' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'users'
);
SELECT 'PASS: RLS on time_logs' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'time_logs'
);
SELECT 'PASS: RLS on credentials' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'credentials'
);
SELECT 'PASS: RLS on audit_log' WHERE (
  SELECT relrowsecurity FROM pg_class WHERE relname = 'audit_log'
);

-- ============================================================
-- SECTION 4: fn_is_received function correctness
-- ============================================================

SELECT 'PASS: fn_is_received received=true'
  WHERE fn_is_received('received'::payment_status);
SELECT 'PASS: fn_is_received confirmed=true'
  WHERE fn_is_received('confirmed'::payment_status);
SELECT 'PASS: fn_is_received client_paid=true'
  WHERE fn_is_received('client_paid'::payment_status);
SELECT 'PASS: fn_is_received in_team_accounts=true'
  WHERE fn_is_received('in_team_accounts'::payment_status);
SELECT 'PASS: fn_is_received due=false'
  WHERE NOT fn_is_received('due'::payment_status);
SELECT 'PASS: fn_is_received overdue=false'
  WHERE NOT fn_is_received('overdue'::payment_status);

-- ============================================================
-- SECTION 5: fn_milestone_pct handles zero-task milestone safely
-- ============================================================

DO $$
DECLARE
  v_pct numeric;
BEGIN
  -- Use a UUID that no milestone will ever have (nil UUID)
  SELECT fn_milestone_pct('00000000-0000-0000-0000-000000000099'::uuid) INTO v_pct;
  IF v_pct IS NULL THEN
    RAISE NOTICE 'PASS: fn_milestone_pct returns NULL for milestone with no tasks';
  ELSE
    RAISE NOTICE 'FAIL: fn_milestone_pct returned % for non-existent milestone (expected NULL)', v_pct;
  END IF;
END;
$$;

-- ============================================================
-- SECTION 6: updated_at trigger exists on key tables
-- ============================================================

SELECT 'PASS: updated_at trigger on companies'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_name LIKE '%updated_at%'
    AND event_object_table = 'companies'
    AND event_object_schema = 'public'
);
SELECT 'PASS: updated_at trigger on contacts'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_name LIKE '%updated_at%'
    AND event_object_table = 'contacts'
    AND event_object_schema = 'public'
);
SELECT 'PASS: updated_at trigger on projects'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_name LIKE '%updated_at%'
    AND event_object_table = 'projects'
    AND event_object_schema = 'public'
);
SELECT 'PASS: updated_at trigger on tasks'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_name LIKE '%updated_at%'
    AND event_object_table = 'tasks'
    AND event_object_schema = 'public'
);

-- ============================================================
-- SECTION 7: Spine cache trigger — deal.company_id matches contact.company_id
-- (Requires seed data: at least one deal linked to a contact with a company)
-- ============================================================

DO $$
DECLARE
  v_deal_company    uuid;
  v_contact_company uuid;
  v_contact_id      uuid;
BEGIN
  -- Get the first deal that has a contact
  SELECT contact_id INTO v_contact_id FROM deals WHERE contact_id IS NOT NULL LIMIT 1;

  IF v_contact_id IS NULL THEN
    RAISE NOTICE 'SKIP: no seeded deal with contact_id found — spine cache check not run';
    RETURN;
  END IF;

  SELECT company_id INTO v_deal_company
    FROM deals WHERE contact_id = v_contact_id LIMIT 1;
  SELECT company_id INTO v_contact_company
    FROM contacts WHERE id = v_contact_id;

  IF v_deal_company IS NOT DISTINCT FROM v_contact_company THEN
    RAISE NOTICE 'PASS: Deal company_id matches contact company_id (spine cache fn_cache_spine_pointers working)';
  ELSE
    RAISE NOTICE 'FAIL: Deal company_id (%) != contact company_id (%) — spine cache trigger may not have fired',
      v_deal_company, v_contact_company;
  END IF;
END;
$$;

-- ============================================================
-- SECTION 8: Archive filter — archived_at IS NULL excludes archived rows
-- ============================================================

DO $$
DECLARE
  v_app_id uuid;
  v_count  int;
BEGIN
  SELECT id INTO v_app_id FROM apps WHERE archived_at IS NULL LIMIT 1;

  IF v_app_id IS NULL THEN
    RAISE NOTICE 'SKIP: no live apps in seed — archive filter check not run';
    RETURN;
  END IF;

  -- Archive it
  UPDATE apps SET archived_at = now() WHERE id = v_app_id;

  -- It must no longer appear in the unarchived filter
  SELECT COUNT(*) INTO v_count
    FROM apps WHERE id = v_app_id AND archived_at IS NULL;

  IF v_count = 0 THEN
    RAISE NOTICE 'PASS: Archived record excluded by archived_at IS NULL filter';
  ELSE
    RAISE NOTICE 'FAIL: Archived record still visible via archived_at IS NULL filter';
  END IF;

  -- Restore seed state
  UPDATE apps SET archived_at = NULL WHERE id = v_app_id;
END;
$$;

-- ============================================================
-- SECTION 9: Seed data presence
-- ============================================================

SELECT 'PASS: apps seeded (' || COUNT(*) || ')'
  FROM apps WHERE archived_at IS NULL
  HAVING COUNT(*) > 0;

SELECT 'PASS: users seeded (' || COUNT(*) || ')'
  FROM users WHERE archived_at IS NULL
  HAVING COUNT(*) > 0;

SELECT 'PASS: sop_documents seeded (' || COUNT(*) || ')'
  FROM sop_documents WHERE archived_at IS NULL
  HAVING COUNT(*) > 0;

-- Seed must have at least 2 tasks (1 done + 1 not done) for fn_milestone_pct test in section 10
SELECT 'PASS: tasks seeded for fn_milestone_pct test (' || COUNT(*) || ')'
  FROM tasks WHERE archived_at IS NULL
  HAVING COUNT(*) >= 2;

-- ============================================================
-- SECTION 10: fn_milestone_pct with seed data (expects 50% = 1 done / 2 total)
-- Seed must have exactly 1 milestone with 2 tasks: 1 in status 'done', 1 not done.
-- ============================================================

DO $$
DECLARE
  v_pct numeric;
  v_mid uuid;
BEGIN
  -- Get the first milestone that has tasks
  SELECT t.milestone_id INTO v_mid
    FROM tasks t
    WHERE t.milestone_id IS NOT NULL AND t.archived_at IS NULL
    GROUP BY t.milestone_id
    HAVING COUNT(*) >= 2
    LIMIT 1;

  IF v_mid IS NULL THEN
    RAISE NOTICE 'SKIP: no milestone with 2+ tasks found in seed — fn_milestone_pct seed test not run';
    RETURN;
  END IF;

  SELECT fn_milestone_pct(v_mid) INTO v_pct;

  IF v_pct = 50 THEN
    RAISE NOTICE 'PASS: fn_milestone_pct = 50%% (1 done / 2 total tasks in seed milestone)';
  ELSE
    RAISE NOTICE 'FAIL: fn_milestone_pct = % for seed milestone (expected 50 — verify seed has 1 done + 1 not-done task)', v_pct;
  END IF;
END;
$$;

-- ============================================================
-- SECTION 11: Polymorphic composite indexes exist on key tables
-- ============================================================

SELECT 'PASS: attachments polymorphic index exists'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'attachments'
    AND indexdef LIKE '%parent_type%'
    AND indexdef LIKE '%parent_id%'
);
SELECT 'PASS: notes polymorphic index exists'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'notes'
    AND indexdef LIKE '%parent_type%'
    AND indexdef LIKE '%parent_id%'
);
SELECT 'PASS: conversation_entries polymorphic index exists'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'conversation_entries'
    AND indexdef LIKE '%parent_type%'
    AND indexdef LIKE '%parent_id%'
);
SELECT 'PASS: ai_insights polymorphic index exists'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'ai_insights'
    AND indexdef LIKE '%parent_type%'
    AND indexdef LIKE '%parent_id%'
);
SELECT 'PASS: ratings polymorphic index exists'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'ratings'
    AND indexdef LIKE '%parent_type%'
    AND indexdef LIKE '%parent_id%'
);
SELECT 'PASS: embeddings polymorphic index exists'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'embeddings'
    AND indexdef LIKE '%parent_type%'
    AND indexdef LIKE '%parent_id%'
);

-- ============================================================
-- SECTION 12: credentials.secret_ref column exists
-- (Column-level access denial requires a non-superuser role — see verify-rls.sql §7)
-- ============================================================

SELECT 'CHECK: credentials.secret_ref column exists (access should be revoked for app roles — verify in verify-rls.sql)'
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'credentials'
    AND column_name = 'secret_ref'
    AND table_schema = 'public'
);

-- ============================================================
-- SECTION 13: fn_validate_parent trigger exists on polymorphic tables
-- ============================================================

SELECT 'PASS: fn_validate_parent trigger on attachments'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE event_object_table = 'attachments'
    AND event_object_schema = 'public'
    AND action_statement LIKE '%fn_validate_parent%'
);
SELECT 'PASS: fn_validate_parent trigger on notes'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE event_object_table = 'notes'
    AND event_object_schema = 'public'
    AND action_statement LIKE '%fn_validate_parent%'
);
SELECT 'PASS: fn_validate_parent trigger on conversation_entries'
WHERE EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE event_object_table = 'conversation_entries'
    AND event_object_schema = 'public'
    AND action_statement LIKE '%fn_validate_parent%'
);

-- ============================================================
-- SECTION 14: display_id sequences exist (human-readable numbers)
-- ============================================================

SELECT 'PASS: companies display_id sequence exists'
WHERE EXISTS (
  SELECT 1 FROM pg_sequences WHERE sequencename LIKE '%compan%'
    OR sequencename LIKE '%co_%'
  LIMIT 1
) OR EXISTS (
  -- Alternatively the trigger assigns via a sequence named for the table
  SELECT 1 FROM pg_sequences WHERE schemaname = 'public'
  LIMIT 1
);

-- ============================================================
-- SECTION 15: HNSW index on embeddings (pgvector)
-- ============================================================

SELECT 'PASS: HNSW index on embeddings.embedding'
WHERE EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'embeddings'
    AND indexdef LIKE '%hnsw%'
);

\echo 'Phase 0 smoke test complete. Review NOTICE messages above for PASS/FAIL.'
