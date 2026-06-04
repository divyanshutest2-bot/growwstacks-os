-- Migration 0012 | seed | Seed data: apps catalog, users, SOP stubs, smoke-test sample data | Depends: 0011
--
-- WHAT THIS SEEDS:
--   1. Apps catalog (35 tools across dev/project/comms/design/cloud/framework/db categories)
--   2. One user per role (fixed UUIDs for deterministic testing)
--   3. SOP document stubs (one per sop_category: 7 total)
--   4. Smoke-test sample data: 1 company, 2 contacts, 1 deal, 1 project, 1 milestone,
--      2 tasks (one 'done', one 'todo') — enough to verify fn_milestone_pct returns 50.0
--
-- NOTE: Seed users have display_id set explicitly to bypass the trigger
-- (the trigger only fills display_id when it is NULL). They also have
-- full_name set to satisfy the NOT NULL constraint added in 0005.
--
-- The sample data uses ON CONFLICT DO NOTHING for full idempotency so this
-- migration can be re-run safely.

BEGIN;

-- ============================================================
-- 1. APPS CATALOG
-- ============================================================

-- Development tools
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'GitHub',         'github',         'development',    now()),
  (gen_random_uuid(), 'GitLab',         'gitlab',         'development',    now()),
  (gen_random_uuid(), 'VS Code',        'vscode',         'development',    now()),
  (gen_random_uuid(), 'Postman',        'postman',        'development',    now()),
  (gen_random_uuid(), 'Docker',         'docker',         'development',    now())
ON CONFLICT (name) DO NOTHING;

-- Project management
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'Jira',           'jira',           'project',        now()),
  (gen_random_uuid(), 'Linear',         'linear',         'project',        now()),
  (gen_random_uuid(), 'Trello',         'trello',         'project',        now()),
  (gen_random_uuid(), 'Asana',          'asana',          'project',        now()),
  (gen_random_uuid(), 'Notion',         'notion',         'project',        now()),
  (gen_random_uuid(), 'ClickUp',        'clickup',        'project',        now())
ON CONFLICT (name) DO NOTHING;

-- Communication
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'Slack',          'slack',          'communication',  now()),
  (gen_random_uuid(), 'Microsoft Teams','teams',          'communication',  now()),
  (gen_random_uuid(), 'WhatsApp',       'whatsapp',       'communication',  now()),
  (gen_random_uuid(), 'Zoom',           'zoom',           'communication',  now()),
  (gen_random_uuid(), 'Google Meet',    'google_meet',    'communication',  now()),
  (gen_random_uuid(), 'Fireflies',      'fireflies',      'communication',  now())
ON CONFLICT (name) DO NOTHING;

-- Design
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'Figma',          'figma',          'design',         now()),
  (gen_random_uuid(), 'Canva',          'canva',          'design',         now())
ON CONFLICT (name) DO NOTHING;

-- Cloud / Infrastructure
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'AWS',            'aws',            'cloud',          now()),
  (gen_random_uuid(), 'Google Cloud',   'gcp',            'cloud',          now()),
  (gen_random_uuid(), 'Azure',          'azure',          'cloud',          now()),
  (gen_random_uuid(), 'Firebase',       'firebase',       'cloud',          now()),
  (gen_random_uuid(), 'Supabase',       'supabase',       'cloud',          now()),
  (gen_random_uuid(), 'Cloudflare',     'cloudflare',     'cloud',          now())
ON CONFLICT (name) DO NOTHING;

-- Frameworks / Languages
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'React',          'react',          'framework',      now()),
  (gen_random_uuid(), 'Next.js',        'nextjs',         'framework',      now()),
  (gen_random_uuid(), 'Vue',            'vue',            'framework',      now()),
  (gen_random_uuid(), 'Angular',        'angular',        'framework',      now()),
  (gen_random_uuid(), 'Node.js',        'nodejs',         'framework',      now()),
  (gen_random_uuid(), 'Python',         'python',         'language',       now()),
  (gen_random_uuid(), 'Django',         'django',         'framework',      now()),
  (gen_random_uuid(), 'FastAPI',        'fastapi',        'framework',      now()),
  (gen_random_uuid(), 'Flutter',        'flutter',        'framework',      now()),
  (gen_random_uuid(), 'React Native',   'react_native',   'framework',      now()),
  (gen_random_uuid(), 'Laravel',        'laravel',        'framework',      now()),
  (gen_random_uuid(), 'WordPress',      'wordpress',      'framework',      now())
ON CONFLICT (name) DO NOTHING;

-- Databases
INSERT INTO apps (id, name, icon_key, category, created_at) VALUES
  (gen_random_uuid(), 'PostgreSQL',     'postgresql',     'database',       now()),
  (gen_random_uuid(), 'MySQL',          'mysql',          'database',       now()),
  (gen_random_uuid(), 'MongoDB',        'mongodb',        'database',       now()),
  (gen_random_uuid(), 'Redis',          'redis',          'database',       now())
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. SEED USERS (one per role, fixed UUIDs for deterministic testing)
-- display_id set explicitly; trigger skips when display_id is not null.
-- full_name is required (NOT NULL added in 0005).
-- ============================================================
INSERT INTO users (id, display_id, full_name, email, role, status, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'U-0001', 'Admin User',   'admin@growwstacks.com',   'admin',     'active', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'U-0002', 'PM User',      'pm@growwstacks.com',      'pm',        'active', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'U-0003', 'Dev User',     'dev@growwstacks.com',     'developer', 'active', now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'U-0004', 'Sales User',   'sales@growwstacks.com',   'sales',     'active', now(), now()),
  ('00000000-0000-0000-0000-000000000005', 'U-0005', 'Finance User', 'finance@growwstacks.com', 'finance',   'active', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. SOP DOCUMENT STUBS (one per sop_category)
-- Body format: '# [Title]\n\nTodo: Author this SOP.' — placeholder for Phase 3.
-- ============================================================
INSERT INTO sop_documents (id, title, category, body, version, is_active, created_at, updated_at) VALUES
  (gen_random_uuid(),
   'Scope Definition & Change Control',
   'scope',
   '# Scope Definition & Change Control

Todo: Author this SOP.

Key topics to cover:
- What is in scope vs out of scope
- How scope changes are proposed and agreed
- Change-request process and documentation
- Consequences of scope creep (how the system detects it)',
   1, true, now(), now()),

  (gen_random_uuid(),
   'Delivery Standard & Client Handover',
   'delivery_standard',
   '# Delivery Standard & Client Handover

Todo: Author this SOP.

Key topics to cover:
- Definition of "delivered" for our work
- The delivery package (what must be included)
- Client handover checklist
- Sign-off process',
   1, true, now(), now()),

  (gen_random_uuid(),
   'Payment Terms & Follow-up Cadence',
   'payment_terms',
   '# Payment Terms & Follow-up Cadence

Todo: Author this SOP.

Key topics to cover:
- Standard payment schedule (milestone-based vs retainer)
- Payment due dates and grace periods
- Follow-up cadence (Day 1, Day 7, Day 14, Day 30)
- Escalation steps for non-payment
- When to pause delivery',
   1, true, now(), now()),

  (gen_random_uuid(),
   'Testing SOP (Dev + UAT)',
   'testing',
   '# Testing SOP (Dev + UAT)

Todo: Author this SOP.

Key topics to cover:
- Minimum 3 developer tests per milestone
- Minimum 3 UAT tests per milestone
- What each test must cover
- Who conducts developer tests vs UAT
- Pass criteria and feedback documentation',
   1, true, now(), now()),

  (gen_random_uuid(),
   'Client Onboarding & Credential Collection',
   'onboarding',
   '# Client Onboarding & Credential Collection

Todo: Author this SOP.

Key topics to cover:
- Kickoff call agenda and checklist
- What credentials/access we need from the client
- Timelines for receiving access
- What happens when credentials are delayed',
   1, true, now(), now()),

  (gen_random_uuid(),
   'Escalation SOP',
   'escalation',
   '# Escalation SOP

Todo: Author this SOP.

Key topics to cover:
- When to escalate a stuck project
- When to escalate a non-responsive client
- Escalation chain (PM -> Management -> Client formal notice)
- Documentation requirements for escalation',
   1, true, now(), now()),

  (gen_random_uuid(),
   'Communication & Response-Time SOP',
   'communication',
   '# Communication & Response-Time SOP

Todo: Author this SOP.

Key topics to cover:
- Primary communication channel per client type
- Expected response times (internal vs client-facing)
- Silence detection thresholds (when is "no response" a blocker)
- How to document client communications for the AI layer',
   1, true, now(), now())

ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. SMOKE-TEST SAMPLE DATA
-- Purpose: verify fn_milestone_pct, spine-cache triggers, and RLS.
-- All IDs are fixed for deterministic testing and re-run safety.
-- ============================================================

-- Company (Acme Corp)
INSERT INTO companies (
  id, display_id, name, type, created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'CO-201',
  'Acme Corp',
  'client',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Contact 1: with company
INSERT INTO contacts (
  id, display_id, full_name, email, status,
  company_id, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'CT-101',
  'Alice Smith',
  'alice@acmecorp.com',
  'active_client',
  'a0000000-0000-0000-0000-000000000001',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Contact 2: no company (solo lead)
INSERT INTO contacts (
  id, display_id, full_name, email, status,
  created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'CT-102',
  'Bob Johnson',
  'bob@example.com',
  'prospect',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Deal for Contact 1
-- NOTE: spine trigger will fill company_id from contact.
-- We set display_id explicitly so trigger skips re-assignment.
INSERT INTO deals (
  id, display_id, name, contact_id,
  deal_value, currency, stage, created_at, updated_at
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'DL-0001',
  'Acme Corp - Website Redesign',
  'b0000000-0000-0000-0000-000000000001',
  50000.00, 'USD', 'closed_won',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Project for the deal
-- NOTE: spine trigger will fill contact_id and company_id from deal.
INSERT INTO projects (
  id, display_id, name, deal_id, status,
  start_date, estimated_completion_date,
  estimated_hours, created_at, updated_at
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'pr-0001',
  'Acme Corp Website Redesign',
  'c0000000-0000-0000-0000-000000000001',
  'in_progress',
  CURRENT_DATE,
  CURRENT_DATE + 60,
  200,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Add the seed PM as project member
INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'pm',
  now()
) ON CONFLICT (project_id, user_id) DO NOTHING;

-- Add the seed developer as project member
INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  'developer',
  now()
) ON CONFLICT (project_id, user_id) DO NOTHING;

-- Milestone M1 for the project
-- display_id set explicitly; trigger will still fire but will skip (not NULL).
-- We manually increment next_milestone_seq for the seed data.
UPDATE projects SET next_milestone_seq = 1
WHERE id = 'd0000000-0000-0000-0000-000000000001'
  AND next_milestone_seq = 0;

-- NOTE: fn_cache_spine_pointers will fill contact_id and company_id from project.
INSERT INTO milestones (
  id, display_id, name, project_id, status,
  start_date, target_date,
  price, currency, created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'M1',
  'Discovery & Requirements',
  'd0000000-0000-0000-0000-000000000001',
  'in_progress',
  CURRENT_DATE,
  CURRENT_DATE + 14,
  15000.00, 'USD',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Task 1: status='done' — contributes to fn_milestone_pct numerator
-- parent_type='milestone', parent_id = milestone.id
-- Spine trigger will set milestone_id, project_id, contact_id, company_id.
INSERT INTO tasks (
  id, display_id, title,
  parent_type, parent_id,
  status, priority, delivery_state,
  created_at, updated_at
) VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'T-1',
  'Gather client requirements and review existing site',
  'milestone',
  'e0000000-0000-0000-0000-000000000001',
  'done',
  'high',
  'delivered',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Task 2: status='todo' — contributes to fn_milestone_pct denominator only
INSERT INTO tasks (
  id, display_id, title,
  parent_type, parent_id,
  status, priority, delivery_state,
  created_at, updated_at
) VALUES (
  'f0000000-0000-0000-0000-000000000002',
  'T-2',
  'Draft wireframes for homepage and key pages',
  'milestone',
  'e0000000-0000-0000-0000-000000000001',
  'todo',
  'medium',
  'not_delivered',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Assign tasks to the developer
INSERT INTO task_assignees (task_id, user_id, created_at) VALUES
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', now()),
  ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', now())
ON CONFLICT (task_id, user_id) DO NOTHING;

-- Contact owner (sales user owns the contact)
INSERT INTO contact_owners (contact_id, user_id, created_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', now())
ON CONFLICT (contact_id, user_id) DO NOTHING;

-- Deal owner (sales user owns the deal)
INSERT INTO deal_owners (deal_id, user_id, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', now())
ON CONFLICT (deal_id, user_id) DO NOTHING;

-- Smoke-test payment (due status — not received, so fn_milestone_pct is unaffected)
INSERT INTO payments (
  id, display_id, deal_id, project_id, milestone_id,
  amount, currency, payment_type, status, created_by,
  created_at, updated_at
) VALUES (
  'cafe0000-0000-0000-0000-000000000001',
  'PMT-0001',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  15000.00, 'USD', 'milestone', 'due',
  '00000000-0000-0000-0000-000000000002',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. SAMPLE CREDENTIAL (so the secret_ref column-denial test has a row to bite on)
-- secret_ref is stored as base64-armored pgcrypto ciphertext (text column).
-- The real encryption key handling lives in the reveal_credential action (Phase 2);
-- this seed key is a throwaway placeholder for column-denial testing only.
-- ============================================================
INSERT INTO credentials (
  id, contact_id, label, login_url, username, secret_ref,
  two_factor_enabled, we_have_account_access,
  created_by, created_at, updated_at
) VALUES (
  'cafe0001-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Acme WordPress Admin',
  'https://acme.example.com/wp-admin',
  'acme_admin',
  encode(pgp_sym_encrypt('demo-password-not-real', 'seed-demo-key-phase0'), 'base64'),
  true, true,
  '00000000-0000-0000-0000-000000000002',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Link the credential to the contact and the seed project
-- (developer 00..03 is a project member, so the developer-reveal RLS path has coverage).
INSERT INTO credential_links (credential_id, parent_type, parent_id, created_at) VALUES
  ('cafe0001-0000-0000-0000-000000000001', 'contact', 'b0000000-0000-0000-0000-000000000001', now()),
  ('cafe0001-0000-0000-0000-000000000001', 'project', 'd0000000-0000-0000-0000-000000000001', now())
ON CONFLICT (credential_id, parent_type, parent_id) DO NOTHING;

-- ============================================================
-- 6. SEQUENCE RECONCILIATION (CRITICAL)
-- The seed sets display_id explicitly, so fn_assign_display_id returns early
-- WITHOUT advancing the sequences. Left unreconciled, the first trigger-generated
-- ID would collide with a seeded one (e.g. next project -> 'pr-0001' duplicate).
-- We derive each sequence from the MAX display number actually present, so this is
-- idempotent and never moves a sequence backward (safe if real data already exists).
-- ============================================================
SELECT setval('seq_company_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'CO-(\d+)')::int), 200) FROM companies), true);
SELECT setval('seq_contact_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'CT-(\d+)')::int), 100) FROM contacts), true);
SELECT setval('seq_deal_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'DL-(\d+)')::int), 0) FROM deals), true);
SELECT setval('seq_project_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'pr-(\d+)')::int), 0) FROM projects), true);
SELECT setval('seq_task_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'T-(\d+)')::int), 0) FROM tasks), true);
SELECT setval('seq_payment_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'PMT-(\d+)')::int), 0) FROM payments), true);
SELECT setval('seq_user_display',
  (SELECT COALESCE(MAX(substring(display_id FROM 'U-(\d+)')::int), 0) FROM users), true);

-- ============================================================
-- VERIFICATION QUERY (run manually to confirm seed)
-- Expected: milestone_pct = 50.0 (1 done / 2 total tasks)
--
-- SELECT fn_milestone_pct('e0000000-0000-0000-0000-000000000001');
-- -- Expected result: 50.0
--
-- SELECT fn_project_pct('d0000000-0000-0000-0000-000000000001');
-- -- Expected result: 50.0
--
-- SELECT received, outstanding, pct_collected FROM v_milestone_billing
--   WHERE milestone_id = 'e0000000-0000-0000-0000-000000000001';
-- -- Expected: received=0, outstanding=15000, pct_collected=0 (payment is 'due', not received)
-- ============================================================

COMMIT;
