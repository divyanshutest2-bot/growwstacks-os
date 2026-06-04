'use server';

// lib/actions/polymorphic.ts — thin read/write server actions for the UNIVERSAL
// polymorphic modules (notes / attachments / conversation_entries / ai_insights).
//
// These are generic over (parent_type, parent_id) so EVERY entity reuses them
// unchanged — never a per-entity table or per-entity action (CLAUDE.md rule 6).
//
// Rules enforced here (mirrors lib/actions/contacts.ts exactly):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - Reads filter archived_at IS NULL (where the table has the column).
//   - parentType is validated against the entity_type enum set before any query.
//   - No DELETE; no stored derived values; edge-safe (Neon driver + zod only).

import { z } from 'zod';

import { asUser } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';
import { sqlNoUser } from '@/lib/db';

// sqlNoUser is used purely as the tagged-template BUILDER; every built query is
// executed via asUser, so RLS always applies (same pattern as contacts.ts).
const sql = sqlNoUser;

// ---------------------------------------------------------------------------
// Session guard
// ---------------------------------------------------------------------------
async function requireUid(): Promise<string> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

// ---------------------------------------------------------------------------
// parent_type allowlist — the entity_type enum members (migrations/0001_enums).
// Validated BEFORE any query so a bad parent_type never reaches the DB. The value
// is still bound as a parameter and cast to entity_type, so the enum is the final
// gate; this is the early, friendly rejection.
// ---------------------------------------------------------------------------
const ENTITY_TYPES = [
  'contact',
  'company',
  'deal',
  'project',
  'milestone',
  'task',
  'payment',
  'user',
  'test',
  'note',
  'rating',
] as const;

const parentTypeSchema = z.enum(ENTITY_TYPES);
const uuidSchema = z.string().uuid();

export type ParentType = (typeof ENTITY_TYPES)[number];

function parseParent(parentType: string, parentId: string) {
  return {
    pType: parentTypeSchema.parse(parentType),
    pId: uuidSchema.parse(parentId),
  };
}

// ===========================================================================
// NOTES
// ===========================================================================

export async function listNotes(parentType: string, parentId: string) {
  const uid = await requireUid();
  const { pType, pId } = parseParent(parentType, parentId);

  return asUser(
    uid,
    sql`
      SELECT n.id, n.parent_type, n.parent_id, n.title, n.body,
             n.author_id, u.full_name AS author_name,
             n.created_at, n.updated_at
      FROM notes n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.parent_type = ${pType}::entity_type
        AND n.parent_id = ${pId}::uuid
        AND n.archived_at IS NULL
      ORDER BY n.created_at DESC
    `,
  );
}

const createNoteSchema = z
  .object({
    title: z.string().max(300).nullish(),
    body: z.string().min(1).max(20000),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export async function createNote(
  parentType: string,
  parentId: string,
  input: CreateNoteInput,
) {
  const uid = await requireUid();
  const { pType, pId } = parseParent(parentType, parentId);
  const data = createNoteSchema.parse(input);

  // author_id = the caller (fn_me() in SQL). RLS notes_insert requires
  // fn_can_edit(parent_type, parent_id); the fn_validate_parent trigger checks
  // the parent exists and is not archived.
  const rows = await asUser(
    uid,
    sql`
      INSERT INTO notes (parent_type, parent_id, title, body, author_id)
      VALUES (
        ${pType}::entity_type,
        ${pId}::uuid,
        ${data.title ?? null},
        ${data.body},
        ${uid}::uuid
      )
      RETURNING id, parent_type, parent_id, title, body, author_id, created_at, updated_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Create note not permitted');
  }
  return rows[0];
}

// ===========================================================================
// ATTACHMENTS
// ===========================================================================

export async function listAttachments(parentType: string, parentId: string) {
  const uid = await requireUid();
  const { pType, pId } = parseParent(parentType, parentId);

  return asUser(
    uid,
    sql`
      SELECT a.id, a.parent_type, a.parent_id, a.kind, a.title, a.url,
             a.mime_type, a.size_bytes, a.purpose,
             a.uploaded_by, u.full_name AS uploaded_by_name,
             a.created_at
      FROM attachments a
      LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.parent_type = ${pType}::entity_type
        AND a.parent_id = ${pId}::uuid
        AND a.archived_at IS NULL
      ORDER BY a.created_at DESC
    `,
  );
}

const addAttachmentLinkSchema = z
  .object({
    title: z.string().min(1).max(300),
    url: z.string().url().max(2000),
    purpose: z.string().max(100).nullish(),
  })
  .strict();

export type AddAttachmentLinkInput = z.infer<typeof addAttachmentLinkSchema>;

/**
 * addAttachmentLink — adds a kind='link' attachment. File uploads go through the
 * n8n Drive proxy later; links need no proxy, so this is enough now.
 */
export async function addAttachmentLink(
  parentType: string,
  parentId: string,
  input: AddAttachmentLinkInput,
) {
  const uid = await requireUid();
  const { pType, pId } = parseParent(parentType, parentId);
  const data = addAttachmentLinkSchema.parse(input);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO attachments (parent_type, parent_id, kind, title, url, purpose, uploaded_by)
      VALUES (
        ${pType}::entity_type,
        ${pId}::uuid,
        'link'::attachment_kind,
        ${data.title},
        ${data.url},
        ${data.purpose ?? null},
        ${uid}::uuid
      )
      RETURNING id, parent_type, parent_id, kind, title, url, purpose, uploaded_by, created_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Add attachment not permitted');
  }
  return rows[0];
}

// ===========================================================================
// CONVERSATION ENTRIES (read-only here; ingestion is via n8n sync, not the UI)
// ===========================================================================

export async function listConversation(parentType: string, parentId: string) {
  const uid = await requireUid();
  const { pType, pId } = parseParent(parentType, parentId);

  // ASC by occurred_at — oldest first, like a chat transcript. No archived_at
  // column on conversation_entries (messages are immutable history).
  return asUser(
    uid,
    sql`
      SELECT ce.id, ce.parent_type, ce.parent_id, ce.channel, ce.direction,
             ce.sender_user_id, su.full_name AS sender_user_name,
             ce.sender_contact_id, sc.full_name AS sender_contact_name,
             ce.body, ce.occurred_at, ce.meeting_summary,
             ce.meeting_recording_url, ce.duration_minutes
      FROM conversation_entries ce
      LEFT JOIN users su ON su.id = ce.sender_user_id
      LEFT JOIN contacts sc ON sc.id = ce.sender_contact_id
      WHERE ce.parent_type = ${pType}::entity_type
        AND ce.parent_id = ${pId}::uuid
      ORDER BY ce.occurred_at ASC
    `,
  );
}

// ===========================================================================
// AI INSIGHTS (read-only here; insights are agent-written via the AI layer)
// ===========================================================================

export async function listAiInsights(parentType: string, parentId: string) {
  const uid = await requireUid();
  const { pType, pId } = parseParent(parentType, parentId);

  return asUser(
    uid,
    sql`
      SELECT id, parent_type, parent_id, kind, sentiment, body,
             generated_at, generated_by, is_active
      FROM ai_insights
      WHERE parent_type = ${pType}::entity_type
        AND parent_id = ${pId}::uuid
        AND archived_at IS NULL
      ORDER BY generated_at DESC
    `,
  );
}
