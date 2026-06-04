-- Migration 0006 | ai_layer | AI tables: ai_actions, sop_documents, project_timeline_events, digests, embeddings | Depends: 0005
--
-- After creating ai_actions, we wire the deferred FK from tasks.ai_action_id
-- that could not be added in 0002/0005.
--
-- embeddings uses pgvector (installed in 0000) with a 512-dim vector and HNSW index.

BEGIN;

-- ============================================================
-- AI_ACTIONS — the human-in-the-loop spine for every AI proposal
-- Every action that touches a person/client is a PROPOSAL first.
-- Low-risk insights may use 'auto_applied'; anything creating a task,
-- rating a person, or messaging a client stays 'proposed' until confirmed.
-- result_ref: the UUID of the row created on confirm (e.g. the task id).
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_actions (
  id           uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  agent        ai_agent_type     NOT NULL,
  action_type  ai_action_type    NOT NULL,
  status       ai_action_status  NOT NULL DEFAULT 'proposed',
  -- The entity this action acts on (e.g. 'task', 'contact').
  target_type  entity_type,
  target_id    uuid,
  -- The proposed content (task title/details, rating, message draft, etc.).
  payload      jsonb,
  -- What the agent read to form this proposal (for trust/audit/debug).
  evidence     jsonb,
  proposed_at  timestamptz       NOT NULL DEFAULT now(),
  decided_by   uuid              REFERENCES users(id),
  decided_at   timestamptz,
  -- The row created when status transitions to 'confirmed' (e.g. the new task id).
  result_ref   uuid,
  created_at   timestamptz       NOT NULL DEFAULT now(),
  updated_at   timestamptz       NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_status_proposed
  ON ai_actions(status, proposed_at)
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS idx_ai_actions_target
  ON ai_actions(target_type, target_id)
  WHERE target_type IS NOT NULL;

-- ============================================================
-- ADD DEFERRED FK: tasks.ai_action_id -> ai_actions(id)
-- Could not be added in 0002 because ai_actions did not exist yet.
-- ============================================================
DO $$ BEGIN
  ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_ai_action
    FOREIGN KEY (ai_action_id) REFERENCES ai_actions(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SOP_DOCUMENTS — the rules the AI checks reality against
-- Embedded (via embeddings table) so agents retrieve relevant SOP chunks
-- when judging scope/quality/delivery.
-- 'communication' added to sop_category enum in 0001.
-- ============================================================
CREATE TABLE IF NOT EXISTS sop_documents (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text         NOT NULL,
  category    sop_category NOT NULL,
  body        text,   -- Markdown
  version     int          NOT NULL DEFAULT 1,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sop_documents_category_active
  ON sop_documents(category, is_active)
  WHERE archived_at IS NULL;

-- ============================================================
-- PROJECT_TIMELINE_EVENTS — delay attribution per project
-- Populated by the timeline agent from conversation_entries + status changes.
-- duration_hours is a GENERATED column (stored) derived from started_at/ended_at.
-- source_evidence: the messages/status-changes justifying this classification.
-- ============================================================
CREATE TABLE IF NOT EXISTS project_timeline_events (
  id               uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid                  NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  event_type       timeline_event_type   NOT NULL,
  started_at       timestamptz           NOT NULL,
  ended_at         timestamptz,
  attributed_to    delay_attribution     NOT NULL DEFAULT 'none',
  -- GENERATED ALWAYS AS STORED: derived from started_at/ended_at.
  -- NULL when ended_at is NULL (event still in progress).
  duration_hours   numeric(6,1) GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
      THEN ROUND((EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600)::numeric, 1)
      ELSE NULL
    END
  ) STORED,
  detail           text,
  -- The messages/status-changes that justify this classification (for trust/debug).
  source_evidence  jsonb,
  created_at       timestamptz           NOT NULL DEFAULT now()
  -- No archived_at: timeline events are append-only facts.
  -- No updated_at: events are not edited; new events supersede old ones.
);

CREATE INDEX IF NOT EXISTS idx_project_timeline_project_time
  ON project_timeline_events(project_id, started_at);

-- ============================================================
-- DIGESTS — daily per-person / per-PM / management briefings
-- Generated by the digest agent nightly.
-- subject_id is null for management-level digests.
-- ============================================================
CREATE TABLE IF NOT EXISTS digests (
  id            uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  digest_subject_type NOT NULL,
  -- Null for management-level digests.
  subject_id    uuid,
  period_date   date                NOT NULL,
  body          text,   -- Markdown narrative
  -- planned-vs-actual hours, tasks done/in-progress/blocked, due today/tomorrow/week.
  metrics       jsonb,
  generated_at  timestamptz         NOT NULL DEFAULT now(),
  created_at    timestamptz         NOT NULL DEFAULT now(),
  updated_at    timestamptz         NOT NULL DEFAULT now()
  -- No archived_at: digests are historical records, not archived.
);

CREATE INDEX IF NOT EXISTS idx_digests_subject_period
  ON digests(subject_type, subject_id, period_date);

-- ============================================================
-- EMBEDDINGS — pgvector table for semantic search (polymorphic)
-- 512-dim vectors (text-embedding-3-small reduced) per ARCHITECTURE §8.7.
-- Strategy: embed selectively (conversation_entries, sop_documents, notes,
-- requirement fields, summaries). Chunk + summarize; never dump full text.
-- Incremental: process only new content each nightly run.
-- ============================================================
CREATE TABLE IF NOT EXISTS embeddings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type   entity_type NOT NULL,
  parent_id     uuid        NOT NULL,
  -- Index within a multi-chunk document. 0 = first (or only) chunk.
  chunk_index   int         NOT NULL DEFAULT 0,
  content_chunk text        NOT NULL,
  -- 512-dim embedding per architecture decision (low storage, good retrieval).
  embedding     vector(512),
  -- The model used to generate this embedding (e.g. 'text-embedding-3-small').
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Mandatory composite index on polymorphic parent.
CREATE INDEX IF NOT EXISTS idx_embeddings_parent
  ON embeddings(parent_type, parent_id);

-- HNSW index for fast cosine-similarity nearest-neighbor search.
-- Agents use: WHERE parent_type = X AND parent_id = Y ORDER BY embedding <=> $query_vec
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON embeddings USING hnsw (embedding vector_cosine_ops);

COMMIT;
