-- Migration 0004 | polymorphic | Create all polymorphic universal-module tables | Depends: 0003
--
-- DESIGN: Each table uses (parent_type entity_type, parent_id uuid) instead of
-- per-parent FKs. Integrity enforced by:
--   1. The entity_type enum (no typos possible).
--   2. fn_validate_parent trigger (wired in 0007): checks parent exists and is not archived.
--   3. Archive-not-delete policy (parents never disappear, so orphans are impossible).
--   4. Nightly orphan sweep (backstop, wired in Phase 5).
-- Every polymorphic table MUST have a composite index on (parent_type, parent_id).
-- FK to users(id) is safe: users stub exists from 0002.

BEGIN;

-- ============================================================
-- ATTACHMENTS — files and links attached to any entity
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type   entity_type     NOT NULL,
  parent_id     uuid            NOT NULL,
  kind          attachment_kind NOT NULL,
  title         text            NOT NULL,
  url           text            NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  -- Google Drive file ID; allows re-resolving permissions later.
  drive_file_id text,
  -- Free-text purpose tag. Examples: requirement, client_delivery, signed_contract,
  -- proof_of_payment, appreciation. Used to filter without creating new tables.
  purpose       text,
  uploaded_by   uuid            REFERENCES users(id),
  created_at    timestamptz     NOT NULL DEFAULT now(),
  archived_at   timestamptz
);

-- Mandatory composite index on polymorphic parent (ARCHITECTURE §3).
CREATE INDEX IF NOT EXISTS idx_attachments_parent
  ON attachments(parent_type, parent_id);

-- Purpose-scoped index for "all client_delivery attachments for this entity" queries.
CREATE INDEX IF NOT EXISTS idx_attachments_parent_purpose
  ON attachments(parent_type, parent_id, purpose)
  WHERE purpose IS NOT NULL;

-- ============================================================
-- NOTES — Markdown notes attached to any entity
-- Notes can themselves be a polymorphic parent for attachments.
-- (attachments.parent_type = 'note' is valid per entity_type enum.)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type entity_type NOT NULL,
  parent_id   uuid        NOT NULL,
  title       text,
  body        text,   -- Markdown; constrained set per ARCHITECTURE §14
  author_id   uuid        REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notes_parent
  ON notes(parent_type, parent_id);

-- ============================================================
-- CONVERSATION_ENTRIES — multi-channel messages
-- Exactly one of sender_user_id / sender_contact_id must be set.
-- Deduped on external_message_id (when not null).
-- Primary embedding source (vectorized in 0006/agent layer).
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_entries (
  id                   uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type          entity_type          NOT NULL,
  parent_id            uuid                 NOT NULL,
  channel              conversation_channel NOT NULL,
  direction            message_direction    NOT NULL,
  -- Exactly one sender must be set:
  sender_user_id       uuid                 REFERENCES users(id),
  sender_contact_id    uuid                 REFERENCES contacts(id),
  body                 text,
  -- For deduplication when syncing from external platforms (WhatsApp, Slack, etc.).
  external_message_id  text,
  external_thread_id   text,
  occurred_at          timestamptz          NOT NULL,
  -- Meeting-specific fields (used when channel = google_meet | zoom | fireflies | teams).
  meeting_recording_url text,
  meeting_summary       text,
  duration_minutes      int,
  created_at            timestamptz          NOT NULL DEFAULT now(),
  -- CONSTRAINT: exactly one sender (user XOR contact).
  CONSTRAINT chk_conversation_sender CHECK (
    (sender_user_id IS NOT NULL AND sender_contact_id IS NULL)
    OR
    (sender_user_id IS NULL AND sender_contact_id IS NOT NULL)
  )
);

-- Mandatory composite index on polymorphic parent + time ordering.
CREATE INDEX IF NOT EXISTS idx_conversation_parent_time
  ON conversation_entries(parent_type, parent_id, occurred_at);

-- Dedupe index: unique external_message_id when present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_ext_msg_id
  ON conversation_entries(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ============================================================
-- AI_INSIGHTS — blockers and highlights on any entity
-- generated_by reuses rater_type enum: 'ai' for agent-generated, 'human' for manual.
-- is_active=false means resolved but kept for history (no hard-delete).
-- source_evidence: which messages/facts the AI used (for trust/debug).
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_insights (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type     entity_type  NOT NULL,
  parent_id       uuid         NOT NULL,
  kind            insight_kind NOT NULL,
  sentiment       sentiment,
  body            text         NOT NULL,
  generated_at    timestamptz  NOT NULL DEFAULT now(),
  -- 'ai' for agent-generated; 'human' for manually added highlights.
  generated_by    rater_type   NOT NULL,
  -- false = resolved/dismissed; row kept for history.
  is_active       boolean      NOT NULL DEFAULT true,
  -- The messages/facts that justified this insight (for audit/trust/debug).
  source_evidence jsonb,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

-- Composite index covers: "active blockers for this project", "all highlights for this contact".
CREATE INDEX IF NOT EXISTS idx_ai_insights_parent_kind_active
  ON ai_insights(parent_type, parent_id, kind, is_active);

-- ============================================================
-- RATINGS — directional star ratings (human or AI)
-- parent_type is usually 'task'; also deal/project/milestone/contact.
-- rater_user_id null when rater_type='ai'.
-- ratee_user_id null when rating a thing, not a person.
-- Directional rule for human ratings enforced by fn_check_rating_direction (0007):
--   admin -> pm, pm -> developer. AI bypasses direction but must carry rating_basis.
-- ============================================================
CREATE TABLE IF NOT EXISTS ratings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type   entity_type NOT NULL,
  parent_id     uuid        NOT NULL,
  rater_type    rater_type  NOT NULL,
  -- Null when rater_type = 'ai'.
  rater_user_id uuid        REFERENCES users(id),
  -- Null when rating a thing (task/project) not a person.
  ratee_user_id uuid        REFERENCES users(id),
  stars         smallint    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  feedback      text,
  -- For AI ratings: the scored SOP criteria that justify the score. Makes AI auditable.
  rating_basis  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ratings_parent
  ON ratings(parent_type, parent_id);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee
  ON ratings(ratee_user_id)
  WHERE ratee_user_id IS NOT NULL;

COMMIT;
