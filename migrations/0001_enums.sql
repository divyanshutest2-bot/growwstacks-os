-- Migration 0001 | enums | Create all application enum types | Depends: 0000

BEGIN;

-- Idempotent enum creation pattern: use DO/EXCEPTION to skip if already exists.
-- Each enum is wrapped individually so one failure doesn't prevent others.

DO $$ BEGIN
  CREATE TYPE entity_type AS ENUM (
    'contact', 'company', 'deal', 'project', 'milestone',
    'task', 'payment', 'user', 'test', 'note', 'rating'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE company_type AS ENUM (
    'prospect', 'client', 'partner', 'past_client'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE company_size AS ENUM (
    '1-10', '11-50', '50-200', '200+'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_status AS ENUM (
    'prospect', 'active_client', 'partner', 'on_hold', 'churned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_rating AS ENUM (
    'great', 'good', 'average', 'bad'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE platform AS ENUM (
    'whatsapp', 'teams', 'slack', 'email', 'upwork', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_source AS ENUM (
    'upwork_bid', 'upwork_direct', 'website_form', 'call',
    'inquiry', 'referral', 'make_opportunity', 'open_source_linkedin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deal_stage AS ENUM (
    'new', 'qualified', 'requirement_analysis', 'proposal',
    'price_quote', 'negotiation', 'review', 'payment_followup',
    'approval', 'closed_won', 'closed_lost', 'on_hold',
    'handed_over', 'lost_after_handover', 'lost_no_response', 'lost_not_fit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_type AS ENUM (
    'milestone', 'one_time', 'early', 'retainer', 'subscription'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'due', 'overdue', 'client_paid', 'received', 'confirmed', 'in_team_accounts'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM (
    'upcoming', 'in_progress', 'client_pending', 'on_hold',
    'payment_pending', 'handover', 'completed', 'internal', 'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE milestone_status AS ENUM (
    'not_started', 'in_progress', 'in_review', 'on_hold', 'done'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'upcoming', 'waiting_for_client', 'waiting_to_start', 'todo',
    'in_progress', 'visibility_check', 'qa_review', 'client_review',
    'client_pending', 'internal_action', 'stuck', 'on_hold', 'done', 'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_delivery_state AS ENUM (
    'not_delivered', 'delivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority AS ENUM (
    'low', 'medium', 'high'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'admin', 'pm', 'developer', 'sales', 'finance', 'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM (
    'active', 'away', 'left_org'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_channel AS ENUM (
    'phone', 'slack', 'gmail', 'outlook', 'whatsapp',
    'upwork', 'google_meet', 'zoom', 'fireflies', 'teams'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM (
    'inbound', 'outbound'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attachment_kind AS ENUM (
    'file', 'link'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE insight_kind AS ENUM (
    'blocker', 'highlight'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sentiment AS ENUM (
    'positive', 'neutral', 'risk'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE test_type AS ENUM (
    'developer', 'uat'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE test_outcome AS ENUM (
    'pass', 'fail'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tester_role_type AS ENUM (
    'developer', 'pm'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rater_type AS ENUM (
    'human', 'ai'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE proficiency AS ENUM (
    'expert', 'intermediate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE time_log_source AS ENUM (
    'manual', 'team_logger'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_agent_type AS ENUM (
    'observer', 'allocator', 'rater', 'timeline', 'digest'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_action_type AS ENUM (
    'create_task', 'rate', 'flag', 'escalate', 'message', 'summarize'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_action_status AS ENUM (
    'proposed', 'confirmed', 'rejected', 'auto_applied'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE timeline_event_type AS ENUM (
    'contract_start', 'credential_requested', 'credential_received',
    'kickoff_call', 'work_started', 'waiting_on_client', 'client_responded',
    'blocked', 'milestone_done', 'delivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delay_attribution AS ENUM (
    'us', 'client', 'external', 'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE digest_subject_type AS ENUM (
    'user', 'pm', 'management'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_actor_type AS ENUM (
    'human', 'ai', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'create', 'update', 'archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sop_category AS ENUM (
    'scope', 'delivery_standard', 'payment_terms',
    'testing', 'onboarding', 'escalation', 'communication'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
