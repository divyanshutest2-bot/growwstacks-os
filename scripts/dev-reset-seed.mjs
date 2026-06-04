// scripts/dev-reset-seed.mjs — DEV utility: reset the seed to a clean state.
//
// The Playwright suite's inline-edit / status / add-member tests mutate seed
// rows (names→timestamps, statuses, membership joins) and don't always clean up.
// Run this to restore a tidy demo state (for screenshots or a manual walkthrough):
//   node scripts/dev-reset-seed.mjs
//
// Connects as app_user with the admin GUC (admin can write all entity fields +
// join tables). No owner credential, no migrations — data-only.

import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const A = '00000000-0000-0000-0000-000000000001';
const PM = '00000000-0000-0000-0000-000000000002';
const DEV = '00000000-0000-0000-0000-000000000003';
const SALES = '00000000-0000-0000-0000-000000000004';
const ALICE = 'b0000000-0000-0000-0000-000000000001';
const ACME = 'a0000000-0000-0000-0000-000000000001';
const DEAL = 'c0000000-0000-0000-0000-000000000001';
const PROJ = 'd0000000-0000-0000-0000-000000000001';
const MS = 'e0000000-0000-0000-0000-000000000001';
const T1 = 'f0000000-0000-0000-0000-000000000001';
const T2 = 'f0000000-0000-0000-0000-000000000002';
const PMT = 'cafe0000-0000-0000-0000-000000000001';
const FINANCE = '00000000-0000-0000-0000-000000000005';
const g = sql`select set_config('app.current_user_id', ${A}, true)`;
const tx = (q) => sql.transaction([g, q]);
// asUser(uid, q): run a single statement with the GUC set to a SPECIFIC user id.
// Used for the app_links parent_type='user' case (admin can't insert those; the
// user inserts their own expertise) — still the RLS path.
const asUser = (uid, q) => sql.transaction([sql`select set_config('app.current_user_id', ${uid}, true)`, q]);
// upsertByExist(table, id, insertQ, updateQ): manual upsert for tables whose RLS
// SELECT policy is SELF-REFERENTIAL (milestones, tasks use fn_can_see(self,id)).
// Postgres `INSERT … ON CONFLICT` runs a speculative SELECT-policy check against
// the not-yet-visible row, which evaluates to false and is wrongly rejected.
// So: admin SELECTs whether the row exists (passes — row visible if present),
// then runs UPDATE or INSERT. Both are plain statements (no ON CONFLICT).

// 1) Display names/titles back to seed.
await tx(sql`UPDATE contacts   SET full_name='Alice Smith'                         WHERE id=${ALICE}`);
await tx(sql`UPDATE companies  SET name='Acme Corp'                                WHERE id=${ACME}`);
await tx(sql`UPDATE deals      SET name='Acme Corp - Website Redesign'             WHERE id=${DEAL}`);
await tx(sql`UPDATE projects   SET name='Acme Corp Website Redesign'               WHERE id=${PROJ}`);
await tx(sql`UPDATE milestones SET name='Discovery & Requirements'                 WHERE id=${MS}`);
await tx(sql`UPDATE tasks      SET title='Gather client requirements and review existing site', status='done' WHERE id=${T1}`);
await tx(sql`UPDATE tasks      SET title='Draft wireframes for homepage and key pages', status='todo' WHERE id=${T2}`);

// 2) Statuses.
await tx(sql`UPDATE payments SET status='due', confirmed_by=NULL WHERE id=${PMT}`);

// 3) Membership joins back to seed.
await tx(sql`DELETE FROM project_members WHERE project_id=${PROJ}`);
await tx(sql`INSERT INTO project_members (project_id,user_id,role,created_at) VALUES (${PROJ},${PM},'pm',now()),(${PROJ},${DEV},'developer',now()) ON CONFLICT (project_id,user_id) DO NOTHING`);
await tx(sql`DELETE FROM milestone_members`);
await tx(sql`DELETE FROM task_managers`);
await tx(sql`DELETE FROM task_assignees`);
await tx(sql`INSERT INTO task_assignees (task_id,user_id,created_at) VALUES (${T1},${DEV},now()),(${T2},${DEV},now()) ON CONFLICT DO NOTHING`);
await tx(sql`DELETE FROM contact_owners WHERE contact_id=${ALICE}`);
await tx(sql`INSERT INTO contact_owners (contact_id,user_id,created_at) VALUES (${ALICE},${SALES},now()) ON CONFLICT DO NOTHING`);
await tx(sql`DELETE FROM deal_owners WHERE deal_id=${DEAL}`);
await tx(sql`INSERT INTO deal_owners (deal_id,user_id,created_at) VALUES (${DEAL},${SALES},now()) ON CONFLICT DO NOTHING`);

// 4) Archive stray payments the sales-create test left (keep PMT-0001).
await tx(sql`UPDATE payments SET archived_at=now() WHERE id<>${PMT} AND archived_at IS NULL`);

const counts = await sql.transaction([
  g,
  sql`select
    (select count(*) from contacts where archived_at is null)::int contacts,
    (select count(*) from payments where archived_at is null)::int payments,
    (select count(*) from project_members where project_id=${PROJ})::int members`,
]);
console.log('seed reset →', counts[1][0]);

// ════════════════════════════════════════════════════════════════════════
// DEMO DATASET (additive on top of the original seed).
//
// Everything below writes through the admin GUC (RLS path) — same policies a
// real admin hits. No owner credential, no migrations, no schema changes.
//
// Deterministic, hex-valid UUIDs per entity family so re-runs converge:
//   companies 0a… contacts 0b… deals 0c… projects 0d… milestones 0e…
//   tasks 0f… payments 1a… conversation 1b… notes 1c… attachments 1d…
//   ai_insights 1e… time_logs 2a… tests 2b… ratings 2c…
//   (none collide with seed a0/b0/c0/d0/e0/f0/cafe0).
//
// Entity rows: INSERT … ON CONFLICT (id) DO UPDATE SET <facts> (idempotent;
// display_id stays from first insert, triggers re-fill spine caches on update).
// Join tables: scoped DELETE of demo rows then re-INSERT (join tables have
// admin/pm delete policies; we scope to demo ids so seed joins are untouched).
// ════════════════════════════════════════════════════════════════════════

const OWNERS = [A, PM, SALES, FINANCE]; // varied account/contact/deal owners

// Pad an integer 1..255 into the last byte of a family-prefixed UUID.
const uid = (prefix, n) => `${prefix}-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const CO = (n) => uid('0a000000', n);
const CT = (n) => uid('0b000000', n);
const DL = (n) => uid('0c000000', n);
const PR = (n) => uid('0d000000', n);
const MS_ = (n) => uid('0e000000', n);
const TK = (n) => uid('0f000000', n);
const PAY = (n) => uid('1a000000', n);
const CONV = (n) => uid('1b000000', n);
const NOTE = (n) => uid('1c000000', n);
const ATT = (n) => uid('1d000000', n);
const INS = (n) => uid('1e000000', n);
const TL = (n) => uid('2a000000', n);  // time_logs
const TST = (n) => uid('2b000000', n); // tests
const RT = (n) => uid('2c000000', n);  // ratings

// dayOffset(n): real ISO date n days from today (negative = past). Returned as a
// 'YYYY-MM-DD' string and always cast ::date at the call site (DATE SAFETY).
const dayOffset = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Probe: does contacts.job_title exist (0016)? Skip gracefully if absent. ──
const jt = await sql.transaction([
  g,
  sql`SELECT 1 AS present FROM information_schema.columns
      WHERE table_name='contacts' AND column_name='job_title'`,
]);
const HAS_JOB_TITLE = jt[1].length > 0;

// ── 1) COMPANIES (10) — varied size/type/industry/location/owner. ──
const SIZES = ['1-10', '11-50', '50-200', '200+'];
const CTYPES = ['prospect', 'client', 'partner', 'past_client'];
const INDUSTRIES = ['SaaS', 'E-commerce', 'Fintech', 'Healthcare', 'Logistics', 'EdTech', 'Real Estate', 'Manufacturing', 'Media', 'Travel'];
const CITIES = [['Austin', 'TX', 'USA'], ['Mumbai', 'MH', 'India'], ['Sydney', 'NSW', 'Australia'], ['Berlin', 'BE', 'Germany'], ['Toronto', 'ON', 'Canada'], ['London', 'ENG', 'UK'], ['Bangalore', 'KA', 'India'], ['Singapore', 'SG', 'Singapore'], ['New York', 'NY', 'USA'], ['Pune', 'MH', 'India']];
const COMPANY_NAMES = ['Northwind Retail', 'Helios Fintech', 'Vireo Health', 'Cargo Loop', 'BrightPath EdTech', 'Marlin Estates', 'Forge Industrial', 'Lumen Media', 'Voyage Travel Co', 'Pixel & Pine SaaS'];
for (let i = 1; i <= 10; i++) {
  const [city, state, country] = CITIES[i - 1];
  await tx(sql`
    INSERT INTO companies (id, display_id, name, industry, company_size, city, state, country, type, account_owner_id, about, created_at, updated_at)
    VALUES (${CO(i)}, ${'CO-9' + (200 + i)}, ${COMPANY_NAMES[i - 1]}, ${INDUSTRIES[i - 1]}, ${SIZES[i % 4]}::company_size, ${city}, ${state}, ${country}, ${CTYPES[i % 4]}::company_type, ${OWNERS[i % OWNERS.length]}, ${'Demo account: ' + COMPANY_NAMES[i - 1]}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, industry=EXCLUDED.industry, company_size=EXCLUDED.company_size,
      city=EXCLUDED.city, state=EXCLUDED.state, country=EXCLUDED.country, type=EXCLUDED.type,
      account_owner_id=EXCLUDED.account_owner_id, about=EXCLUDED.about,
      archived_at=NULL, updated_at=now()`);
}

// ── 2) CONTACTS (25) — spread across companies; ~4 with NO company. ──
// Map: indices 22..25 (0-based 21..24) get NO company (hub-optional case).
const C_STATUS = ['prospect', 'active_client', 'partner', 'on_hold', 'churned'];
const C_RATING = ['great', 'good', 'average', 'bad'];
const C_PLATFORM = ['whatsapp', 'teams', 'slack', 'email', 'upwork', 'other'];
const LEAD_SRC = ['upwork_bid', 'upwork_direct', 'website_form', 'call', 'inquiry', 'referral', 'make_opportunity', 'open_source_linkedin'];
const JOB_TITLES = ['CEO', 'CTO', 'Product Lead', 'Head of Ops', 'Marketing Director', 'Founder'];
const FIRST = ['Maya', 'Liam', 'Aria', 'Noah', 'Zoe', 'Ethan', 'Isla', 'Kai', 'Nora', 'Leo', 'Priya', 'Sam', 'Tara', 'Owen', 'Lena', 'Raj', 'Mia', 'Finn', 'Anya', 'Dev', 'Cora', 'Ivan', 'Lucy', 'Omar', 'Beth'];
const LAST = ['Rao', 'Patel', 'Nguyen', 'Khan', 'Silva', 'Cohen', 'Mehta', 'Wong', 'Larsen', 'Dubois', 'Singh', 'Brown', 'Iyer', 'Reilly', 'Park', 'Gupta', 'Cruz', 'Hale', 'Volk', 'Shah', 'Ford', 'Petrov', 'Adams', 'Farah', 'Lowe'];
// Company assignment: contacts 1..21 across 10 companies; 22..25 no company.
const contactCompany = (i) => (i <= 21 ? CO(((i - 1) % 10) + 1) : null);
for (let i = 1; i <= 25; i++) {
  const name = `${FIRST[i - 1]} ${LAST[i - 1]}`;
  const company = contactCompany(i);
  const portal = i % 5 === 0; // a fifth have client portal enabled
  // Build the insert with/without job_title depending on the probe.
  if (HAS_JOB_TITLE && i <= 6) {
    await tx(sql`
      INSERT INTO contacts (id, display_id, full_name, email, phone, country, city, main_platform, status, rating, company_id, is_client_portal_enabled, job_title, created_at, updated_at)
      VALUES (${CT(i)}, ${'CT-9' + (100 + i)}, ${name}, ${name.toLowerCase().replace(' ', '.') + '@demo.example.com'}, ${'+1-555-01' + i.toString().padStart(2, '0')}, ${CITIES[(i - 1) % 10][2]}, ${CITIES[(i - 1) % 10][0]}, ${C_PLATFORM[i % 6]}::platform, ${C_STATUS[i % 5]}::contact_status, ${C_RATING[i % 4]}::contact_rating, ${company}, ${portal}, ${JOB_TITLES[(i - 1) % 6]}, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        full_name=EXCLUDED.full_name, email=EXCLUDED.email, phone=EXCLUDED.phone,
        country=EXCLUDED.country, city=EXCLUDED.city, main_platform=EXCLUDED.main_platform,
        status=EXCLUDED.status, rating=EXCLUDED.rating, company_id=EXCLUDED.company_id,
        is_client_portal_enabled=EXCLUDED.is_client_portal_enabled, job_title=EXCLUDED.job_title,
        archived_at=NULL, updated_at=now()`);
  } else {
    await tx(sql`
      INSERT INTO contacts (id, display_id, full_name, email, phone, country, city, main_platform, status, rating, company_id, is_client_portal_enabled, created_at, updated_at)
      VALUES (${CT(i)}, ${'CT-9' + (100 + i)}, ${name}, ${name.toLowerCase().replace(' ', '.') + '@demo.example.com'}, ${'+1-555-01' + i.toString().padStart(2, '0')}, ${CITIES[(i - 1) % 10][2]}, ${CITIES[(i - 1) % 10][0]}, ${C_PLATFORM[i % 6]}::platform, ${C_STATUS[i % 5]}::contact_status, ${C_RATING[i % 4]}::contact_rating, ${company}, ${portal}, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        full_name=EXCLUDED.full_name, email=EXCLUDED.email, phone=EXCLUDED.phone,
        country=EXCLUDED.country, city=EXCLUDED.city, main_platform=EXCLUDED.main_platform,
        status=EXCLUDED.status, rating=EXCLUDED.rating, company_id=EXCLUDED.company_id,
        is_client_portal_enabled=EXCLUDED.is_client_portal_enabled,
        archived_at=NULL, updated_at=now()`);
  }
  // contact_lead_sources: 1–2 per contact (scoped clear + reinsert).
  await tx(sql`DELETE FROM contact_lead_sources WHERE contact_id=${CT(i)}`);
  await tx(sql`INSERT INTO contact_lead_sources (contact_id, lead_source, created_at)
    VALUES (${CT(i)}, ${LEAD_SRC[i % 8]}::lead_source, now()) ON CONFLICT DO NOTHING`);
  if (i % 2 === 0) {
    await tx(sql`INSERT INTO contact_lead_sources (contact_id, lead_source, created_at)
      VALUES (${CT(i)}, ${LEAD_SRC[(i + 3) % 8]}::lead_source, now()) ON CONFLICT DO NOTHING`);
  }
}

// contact_owners on ~8 contacts (authoritative join). Scoped clear + reinsert.
const ownedContacts = [1, 3, 5, 7, 9, 11, 13, 15];
for (const i of ownedContacts) {
  await tx(sql`DELETE FROM contact_owners WHERE contact_id=${CT(i)}`);
  await tx(sql`INSERT INTO contact_owners (contact_id, user_id, created_at)
    VALUES (${CT(i)}, ${SALES}, now()) ON CONFLICT DO NOTHING`);
  if (i % 3 === 0) {
    await tx(sql`INSERT INTO contact_owners (contact_id, user_id, created_at)
      VALUES (${CT(i)}, ${PM}, now()) ON CONFLICT DO NOTHING`);
  }
}

// ── 3) DEALS (15) — varied stage incl. closed_won (→ projects) + closed_lost. ──
const STAGES = ['new', 'qualified', 'requirement_analysis', 'proposal', 'closed_won', 'closed_won', 'closed_won', 'closed_won', 'closed_won', 'closed_won', 'negotiation', 'review', 'closed_lost', 'closed_lost', 'on_hold'];
const CURR = ['USD', 'INR', 'AUD'];
const PTYPE = ['milestone', 'one_time', 'early', 'retainer', 'subscription'];
const DEAL_NAMES = ['Platform Rebuild', 'Mobile App MVP', 'Data Pipeline', 'CRM Integration', 'Marketing Site', 'Analytics Dashboard', 'Payment Gateway', 'AI Chat Assistant', 'Inventory System', 'Booking Engine', 'API Modernization', 'Customer Portal', 'Legacy Migration', 'Loyalty Program', 'Internal Tooling'];
// Each deal pinned to a contact (required). Spread across the 25 contacts.
const dealContact = (i) => CT(((i - 1) % 21) + 1); // only contacts that may carry company
for (let i = 1; i <= 15; i++) {
  await tx(sql`
    INSERT INTO deals (id, display_id, name, contact_id, payment_type, deal_value, currency, stage, close_date, description, created_at, updated_at)
    VALUES (${DL(i)}, ${'DL-9' + i.toString().padStart(3, '0')}, ${DEAL_NAMES[i - 1]}, ${dealContact(i)}, ${PTYPE[i % 5]}::payment_type, ${(10000 + i * 3500).toFixed(2)}, ${CURR[i % 3]}, ${STAGES[i - 1]}::deal_stage, (now() - (${i} || ' days')::interval)::date, ${'Demo deal — ' + DEAL_NAMES[i - 1]}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, contact_id=EXCLUDED.contact_id, payment_type=EXCLUDED.payment_type,
      deal_value=EXCLUDED.deal_value, currency=EXCLUDED.currency, stage=EXCLUDED.stage,
      close_date=EXCLUDED.close_date, description=EXCLUDED.description,
      archived_at=NULL, updated_at=now()`);
  // deal_tags on some deals.
  if (i % 2 === 1) {
    await tx(sql`DELETE FROM deal_tags WHERE deal_id=${DL(i)}`);
    await tx(sql`INSERT INTO deal_tags (deal_id, tag, created_at)
      VALUES (${DL(i)}, ${'priority'}, now()), (${DL(i)}, ${'inbound'}, now()) ON CONFLICT DO NOTHING`);
  }
}

// deal_owners on ~5 deals (authoritative). Scoped clear + reinsert.
const ownedDeals = [1, 2, 5, 8, 11];
for (const i of ownedDeals) {
  await tx(sql`DELETE FROM deal_owners WHERE deal_id=${DL(i)}`);
  await tx(sql`INSERT INTO deal_owners (deal_id, user_id, created_at)
    VALUES (${DL(i)}, ${SALES}, now()) ON CONFLICT DO NOTHING`);
  if (i % 2 === 0) {
    await tx(sql`INSERT INTO deal_owners (deal_id, user_id, created_at)
      VALUES (${DL(i)}, ${PM}, now()) ON CONFLICT DO NOTHING`);
  }
}

// ── 4) PROJECTS (6) — each from a closed_won deal (deals 5..10). ──
const wonDeals = [5, 6, 7, 8, 9, 10]; // the closed_won deals from STAGES above
const P_STATUS = ['in_progress', 'in_progress', 'completed', 'on_hold', 'client_pending', 'completed'];
const P_NAMES = ['Marketing Site Build', 'Analytics Dashboard', 'Payment Gateway Rollout', 'AI Chat Assistant', 'Inventory System', 'Booking Engine'];
for (let p = 1; p <= 6; p++) {
  const status = P_STATUS[p - 1];
  const completed = status === 'completed';
  await tx(sql`
    INSERT INTO projects (id, display_id, name, deal_id, status, start_date, estimated_completion_date, actual_completion_date, estimated_hours, created_at, updated_at)
    VALUES (${PR(p)}, ${'pr-9' + p.toString().padStart(3, '0')}, ${P_NAMES[p - 1]}, ${DL(wonDeals[p - 1])}, ${status}::project_status,
      (now() - (${30 + p * 5} || ' days')::interval)::date,
      (now() + (${20 - p * 2} || ' days')::interval)::date,
      ${completed ? dayOffset(-p) : null}::date,
      ${(120 + p * 30).toFixed(1)}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, deal_id=EXCLUDED.deal_id, status=EXCLUDED.status,
      start_date=EXCLUDED.start_date, estimated_completion_date=EXCLUDED.estimated_completion_date,
      actual_completion_date=EXCLUDED.actual_completion_date, estimated_hours=EXCLUDED.estimated_hours,
      archived_at=NULL, updated_at=now()`);
}

// ── SECURITY-PROJECTION WIRING ──
// Developer (…0003) is a project_members 'developer' on EXACTLY 3 of 6 demo
// projects (1,2,3) and NOT the other 3 (4,5,6). PM is on all 6.
const DEV_MEMBER_PROJECTS = [1, 2, 3];
const DEV_NONMEMBER_PROJECTS = [4, 5, 6];
for (let p = 1; p <= 6; p++) {
  await tx(sql`DELETE FROM project_members WHERE project_id=${PR(p)}`);
  await tx(sql`INSERT INTO project_members (project_id, user_id, role, created_at)
    VALUES (${PR(p)}, ${PM}, 'pm', now()) ON CONFLICT (project_id, user_id) DO NOTHING`);
  if (DEV_MEMBER_PROJECTS.includes(p)) {
    await tx(sql`INSERT INTO project_members (project_id, user_id, role, created_at)
      VALUES (${PR(p)}, ${DEV}, 'developer', now()) ON CONFLICT (project_id, user_id) DO NOTHING`);
  }
}

// ── 5) MILESTONES + TASKS per project. ──
// Varied milestone count (2–4) and task count (3–8); completion deliberately
// varied — project 1 near-done (mostly 'done'), project 4 barely started.
const MS_STATUS = ['done', 'in_progress', 'in_review', 'not_started', 'on_hold'];
const T_STATUS_DONE = 'done';
const T_STATUS_MIX = ['todo', 'in_progress', 'qa_review', 'client_review', 'stuck', 'on_hold', 'upcoming', 'waiting_for_client'];
const PRIO = ['low', 'medium', 'high'];
const DELIV = ['not_delivered', 'delivered'];
// Per-project "doneness": fraction of tasks set to 'done'.
const PROJECT_DONE_FRACTION = [0.85, 0.5, 1.0, 0.1, 0.4, 0.7];
const msPerProject = [3, 2, 4, 2, 3, 3];
const taskCounter = { n: 0 }; // global task index for deterministic ids
let msIndex = 0;
const taskIdsByProject = {}; // project p -> [taskId,...]
for (let p = 1; p <= 6; p++) {
  taskIdsByProject[p] = [];
  const nMs = msPerProject[p - 1];
  const doneFrac = PROJECT_DONE_FRACTION[p - 1];
  for (let m = 1; m <= nMs; m++) {
    msIndex++;
    const msId = MS_(msIndex);
    const msStatus = doneFrac >= 0.85 ? 'done' : MS_STATUS[(m + p) % MS_STATUS.length];
    // Manual upsert (milestones SELECT policy is self-referential → no ON CONFLICT).
    const msExists = await tx(sql`SELECT 1 FROM milestones WHERE id=${msId}`);
    const msName = P_NAMES[p - 1] + ' — Phase ' + m;
    const msActual = msStatus === 'done' ? dayOffset(-m) : null;
    if (msExists[1].length > 0) {
      await tx(sql`UPDATE milestones SET
        name=${msName}, project_id=${PR(p)}, status=${msStatus}::milestone_status,
        start_date=(now() - (${20 - m * 3} || ' days')::interval)::date,
        target_date=(now() + (${m * 7} || ' days')::interval)::date,
        actual_completion_date=${msActual}::date,
        estimated_hours=${(40 + m * 10).toFixed(1)}, price=${(8000 + m * 2500).toFixed(2)},
        currency=${CURR[(p + m) % 3]}, archived_at=NULL, updated_at=now() WHERE id=${msId}`);
    } else {
      await tx(sql`INSERT INTO milestones (id, display_id, name, project_id, status, start_date, target_date, actual_completion_date, estimated_hours, price, currency, created_at, updated_at)
        VALUES (${msId}, ${'DM' + msIndex}, ${msName}, ${PR(p)}, ${msStatus}::milestone_status,
          (now() - (${20 - m * 3} || ' days')::interval)::date,
          (now() + (${m * 7} || ' days')::interval)::date,
          ${msActual}::date,
          ${(40 + m * 10).toFixed(1)}, ${(8000 + m * 2500).toFixed(2)}, ${CURR[(p + m) % 3]}, now(), now())`);
    }

    // 3–8 tasks per milestone.
    const nTasks = 3 + ((p + m) % 6); // 3..8
    for (let t = 1; t <= nTasks; t++) {
      taskCounter.n++;
      const tid = TK(taskCounter.n);
      taskIdsByProject[p].push(tid);
      const isDone = (t / nTasks) <= doneFrac;
      const status = isDone ? T_STATUS_DONE : T_STATUS_MIX[(taskCounter.n) % T_STATUS_MIX.length];
      // plan_due_date: some past (overdue), some future.
      const overdue = !isDone && t % 2 === 0;
      const tTitle = 'Task ' + t + ' · ' + P_NAMES[p - 1];
      const tDue = overdue ? dayOffset(-(3 + t)) : dayOffset(5 + t);
      const tDeliv = isDone ? 'delivered' : 'not_delivered';
      // Manual upsert (tasks SELECT policy is self-referential → no ON CONFLICT).
      const tExists = await tx(sql`SELECT 1 FROM tasks WHERE id=${tid}`);
      if (tExists[1].length > 0) {
        await tx(sql`UPDATE tasks SET
          title=${tTitle}, parent_type='milestone', parent_id=${msId}, status=${status}::task_status,
          delivery_state=${tDeliv}::task_delivery_state, priority=${PRIO[t % 3]}::priority,
          start_date=(now() - (${10 + t} || ' days')::interval)::date, plan_due_date=${tDue}::date,
          time_reported_hours=${(2 + t).toFixed(1)}, archived_at=NULL, updated_at=now() WHERE id=${tid}`);
      } else {
        await tx(sql`INSERT INTO tasks (id, display_id, title, parent_type, parent_id, status, delivery_state, priority, start_date, plan_due_date, time_reported_hours, created_at, updated_at)
          VALUES (${tid}, ${'DT-' + taskCounter.n}, ${tTitle}, 'milestone', ${msId}, ${status}::task_status,
            ${tDeliv}::task_delivery_state, ${PRIO[t % 3]}::priority,
            (now() - (${10 + t} || ' days')::interval)::date,
            ${tDue}::date,
            ${(2 + t).toFixed(1)}, now(), now())`);
      }
    }
  }
}

// task_assignees: assign the developer to several tasks in the 3 member-projects.
// Scoped clear (by task id) then reinsert.
for (const p of DEV_MEMBER_PROJECTS) {
  for (const tid of taskIdsByProject[p]) {
    await tx(sql`DELETE FROM task_assignees WHERE task_id=${tid} AND user_id=${DEV}`);
  }
  // assign developer to the first ~4 tasks of each member project.
  for (const tid of taskIdsByProject[p].slice(0, 4)) {
    await tx(sql`INSERT INTO task_assignees (task_id, user_id, created_at)
      VALUES (${tid}, ${DEV}, now()) ON CONFLICT (task_id, user_id) DO NOTHING`);
  }
}

// ── 6) PAYMENTS (~20) across the FULL lifecycle. ──
// Hung off the closed_won deals; project_id/milestone_id where it fits.
const PAY_STATUS = ['due', 'overdue', 'client_paid', 'received', 'confirmed', 'in_team_accounts'];
// Skew toward overdue + received so the aggregate cards / overdue strip pop.
const PAY_PLAN = ['overdue', 'overdue', 'overdue', 'overdue', 'received', 'received', 'received', 'received', 'received', 'confirmed', 'confirmed', 'confirmed', 'in_team_accounts', 'in_team_accounts', 'client_paid', 'client_paid', 'due', 'due', 'due', 'due'];
const firstMsOfProject = {}; // p -> milestone index for linking
{
  let acc = 0;
  for (let p = 1; p <= 6; p++) { firstMsOfProject[p] = acc + 1; acc += msPerProject[p - 1]; }
}
for (let i = 1; i <= 20; i++) {
  const p = ((i - 1) % 6) + 1;
  const status = PAY_PLAN[i - 1];
  const confirmedSet = status === 'confirmed' || status === 'in_team_accounts';
  await tx(sql`
    INSERT INTO payments (id, display_id, deal_id, project_id, milestone_id, amount, currency, payment_type, payment_date, transaction_ref, status, created_by, confirmed_by, note, created_at, updated_at)
    VALUES (${PAY(i)}, ${'PMT-9' + i.toString().padStart(3, '0')}, ${DL(wonDeals[p - 1])}, ${PR(p)}, ${MS_(firstMsOfProject[p])},
      ${(2500 + i * 750).toFixed(2)}, ${CURR[i % 3]}, ${PTYPE[i % 5]}::payment_type,
      (now() - (${i} || ' days')::interval)::date, ${'TXN-DEMO-' + i}, ${status}::payment_status,
      ${PM}, ${confirmedSet ? FINANCE : null}, ${'Demo payment #' + i}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      deal_id=EXCLUDED.deal_id, project_id=EXCLUDED.project_id, milestone_id=EXCLUDED.milestone_id,
      amount=EXCLUDED.amount, currency=EXCLUDED.currency, payment_type=EXCLUDED.payment_type,
      payment_date=EXCLUDED.payment_date, transaction_ref=EXCLUDED.transaction_ref,
      status=EXCLUDED.status, created_by=EXCLUDED.created_by, confirmed_by=EXCLUDED.confirmed_by,
      note=EXCLUDED.note, archived_at=NULL, updated_at=now()`);
}

// ── 7) CONVERSATION + NOTES + ATTACHMENTS + AI_INSIGHTS on ≥3 contacts & ≥3 projects. ──
const CHANNELS = ['slack', 'gmail', 'whatsapp', 'zoom', 'google_meet'];
// On 3 contacts (1,3,5) and 3 projects (1,2,3).
const convTargets = [
  ['contact', CT(1), CT(1)], ['contact', CT(3), CT(3)], ['contact', CT(5), CT(5)],
  ['project', PR(1), null], ['project', PR(2), null], ['project', PR(3), null],
];
let convN = 0, noteN = 0, attN = 0, insN = 0;
for (const [ptype, pid, contactSender] of convTargets) {
  // 2 conversation entries each: one inbound (from contact), one outbound (from us).
  // For projects there's no contact sender → both outbound from us.
  // conversation_entries has NO UPDATE policy → can't ON CONFLICT DO UPDATE.
  // Static demo content; insert-only if absent (idempotent).
  convN++;
  const c1 = CONV(convN);
  if ((await tx(sql`SELECT 1 FROM conversation_entries WHERE id=${c1}`))[1].length === 0) {
    await tx(sql`
      INSERT INTO conversation_entries (id, parent_type, parent_id, channel, direction, sender_user_id, sender_contact_id, body, occurred_at, created_at)
      VALUES (${c1}, ${ptype}::entity_type, ${pid}, ${CHANNELS[convN % 5]}::conversation_channel, 'outbound', ${PM}, NULL, ${'Outbound: status update on ' + ptype}, (now() - (${convN} || ' days')::interval)::timestamptz, now())`);
  }
  convN++;
  const c2 = CONV(convN);
  if ((await tx(sql`SELECT 1 FROM conversation_entries WHERE id=${c2}`))[1].length === 0) {
    if (contactSender) {
      await tx(sql`
        INSERT INTO conversation_entries (id, parent_type, parent_id, channel, direction, sender_user_id, sender_contact_id, body, occurred_at, created_at)
        VALUES (${c2}, ${ptype}::entity_type, ${pid}, ${CHANNELS[convN % 5]}::conversation_channel, 'inbound', NULL, ${contactSender}, ${'Inbound: client question'}, (now() - (${convN} || ' days')::interval)::timestamptz, now())`);
    } else {
      await tx(sql`
        INSERT INTO conversation_entries (id, parent_type, parent_id, channel, direction, sender_user_id, sender_contact_id, body, occurred_at, created_at)
        VALUES (${c2}, ${ptype}::entity_type, ${pid}, ${CHANNELS[convN % 5]}::conversation_channel, 'outbound', ${PM}, NULL, ${'Outbound: internal sync note'}, (now() - (${convN} || ' days')::interval)::timestamptz, now())`);
    }
  }
  // 1 note each.
  noteN++;
  await tx(sql`
    INSERT INTO notes (id, parent_type, parent_id, title, body, author_id, created_at, updated_at)
    VALUES (${NOTE(noteN)}, ${ptype}::entity_type, ${pid}, ${'Demo note'}, ${'Internal note on this ' + ptype + ' for the demo.'}, ${PM}, now(), now())
    ON CONFLICT (id) DO UPDATE SET parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id,
      title=EXCLUDED.title, body=EXCLUDED.body, author_id=EXCLUDED.author_id, archived_at=NULL, updated_at=now()`);
  // 1 attachment (link) each.
  attN++;
  await tx(sql`
    INSERT INTO attachments (id, parent_type, parent_id, kind, title, url, purpose, uploaded_by, created_at)
    VALUES (${ATT(attN)}, ${ptype}::entity_type, ${pid}, 'link', ${'Spec doc'}, ${'https://demo.example.com/doc/' + attN}, ${'requirement'}, ${PM}, now())
    ON CONFLICT (id) DO UPDATE SET parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id,
      kind=EXCLUDED.kind, title=EXCLUDED.title, url=EXCLUDED.url, purpose=EXCLUDED.purpose,
      uploaded_by=EXCLUDED.uploaded_by, archived_at=NULL`);
  // 1 ai_insight each (alternate blocker/highlight).
  insN++;
  const kind = insN % 2 === 0 ? 'blocker' : 'highlight';
  const sent = kind === 'blocker' ? 'risk' : 'positive';
  await tx(sql`
    INSERT INTO ai_insights (id, parent_type, parent_id, kind, sentiment, body, generated_by, is_active, created_at)
    VALUES (${INS(insN)}, ${ptype}::entity_type, ${pid}, ${kind}::insight_kind, ${sent}::sentiment, ${kind === 'blocker' ? 'Client response delayed > 3 days.' : 'Milestone delivered ahead of schedule.'}, 'ai'::rater_type, true, now())
    ON CONFLICT (id) DO UPDATE SET parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id,
      kind=EXCLUDED.kind, sentiment=EXCLUDED.sentiment, body=EXCLUDED.body,
      generated_by=EXCLUDED.generated_by, is_active=EXCLUDED.is_active, archived_at=NULL`);
}

// ── 8) APP_LINKS proficiency for dev + pm — inserted AS those users (RLS path). ──
// admin CANNOT insert parent_type='user' app_links (fn_can_edit has no 'user' case);
// the policy intends the user sets their own expertise → insert as that user.
const appRows = await sql.transaction([
  g,
  sql`SELECT id, name FROM apps WHERE name IN ('React','Next.js','PostgreSQL','Node.js','Jira') ORDER BY name`,
]);
const appByName = Object.fromEntries(appRows[1].map((r) => [r.name, r.id]));
const devApps = [['React', 'expert'], ['Node.js', 'expert'], ['PostgreSQL', 'intermediate']];
const pmApps = [['Jira', 'expert'], ['Next.js', 'intermediate']];
for (const [name, prof] of devApps) {
  if (!appByName[name]) continue;
  await asUser(DEV, sql`
    INSERT INTO app_links (app_id, parent_type, parent_id, proficiency, created_at)
    VALUES (${appByName[name]}, 'user', ${DEV}, ${prof}::proficiency, now())
    ON CONFLICT (app_id, parent_type, parent_id) DO UPDATE SET proficiency=EXCLUDED.proficiency, archived_at=NULL`);
}
for (const [name, prof] of pmApps) {
  if (!appByName[name]) continue;
  await asUser(PM, sql`
    INSERT INTO app_links (app_id, parent_type, parent_id, proficiency, created_at)
    VALUES (${appByName[name]}, 'user', ${PM}, ${prof}::proficiency, now())
    ON CONFLICT (app_id, parent_type, parent_id) DO UPDATE SET proficiency=EXCLUDED.proficiency, archived_at=NULL`);
}

// ── 9) USER_AVAILABILITY — all 5 users × today..+2 = 15 rows (via admin GUC). ──
// 0017 dropped the misfired trg_touch_updated_at on user_availability, so
// ON CONFLICT (user_id,date) DO UPDATE is now safe and fully idempotent
// (the UNIQUE(user_id,date) constraint is the arbiter). admin may write any
// user's availability (user_avail_insert: fn_is_admin() OR user_id = fn_me()).
const AVAIL_USERS = [A, PM, DEV, SALES, FINANCE];
const availFor = (ui, d) => [6, 8, 4, 7, 5][(ui + d) % 5]; // varied hours per (user, day)
for (let d = 0; d <= 2; d++) {
  for (let ui = 0; ui < AVAIL_USERS.length; ui++) {
    await tx(sql`INSERT INTO user_availability (user_id, date, available_hours)
      VALUES (${AVAIL_USERS[ui]}, ${dayOffset(d)}::date, ${availFor(ui, d)})
      ON CONFLICT (user_id, date) DO UPDATE SET available_hours = EXCLUDED.available_hours`);
  }
}

// ── 10) TIME_LOGS (~80) — DEV's OWN effort on assigned member-project tasks. ──
// Inserted as the developer (RLS path: time_logs_insert allows developer where
// user_id = fn_me()). project_id/milestone_id are TRIGGER-cached from the task
// (fn_cache_spine_pointers) — never hand-set. Dates span THIS month and LAST
// month to exercise the v_user_rollup.time_this_month_minutes boundary
// (date_trunc('month', CURRENT_DATE)): each task's k=0 log lands in this month,
// k>=1 logs land in prior month(s) — counted in task/milestone/project totals
// (no date filter) but NOT in time_this_month.
const devTasks = DEV_MEMBER_PROJECTS.flatMap((p) => taskIdsByProject[p].slice(0, 4));
let tlN = 0;
for (let ti = 0; ti < devTasks.length; ti++) {
  const tid = devTasks[ti];
  for (let k = 0; k < 6; k++) {
    tlN++;
    const off = -(k * 7 + (ti % 4));               // 0..-39 days; k=0 → this month
    const minutes = 45 + ((ti * 37 + k * 53) % 9) * 25; // 45..245, varied, always > 0
    const src = tlN % 7 === 0 ? 'team_logger' : 'manual';
    await asUser(DEV, sql`
      INSERT INTO time_logs (id, task_id, user_id, minutes, logged_for_date, source, note, created_at, updated_at)
      VALUES (${TL(tlN)}, ${tid}, ${DEV}, ${minutes}, ${dayOffset(off)}::date, ${src}::time_log_source, ${'Demo work log #' + tlN}, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        task_id=EXCLUDED.task_id, user_id=EXCLUDED.user_id, minutes=EXCLUDED.minutes,
        logged_for_date=EXCLUDED.logged_for_date, source=EXCLUDED.source, note=EXCLUDED.note,
        archived_at=NULL, updated_at=now()`);
  }
}
// A few PM logs via admin GUC (policy permits admin/pm to insert any user_id).
// These prove the developer-isolation wall: DEV must NOT see them.
for (let k = 0; k < 8; k++) {
  tlN++;
  const tid = devTasks[k % devTasks.length];
  await tx(sql`
    INSERT INTO time_logs (id, task_id, user_id, minutes, logged_for_date, source, note, created_at, updated_at)
    VALUES (${TL(tlN)}, ${tid}, ${PM}, ${60 + (k % 4) * 30}, ${dayOffset(-(k * 3))}::date, 'manual'::time_log_source, ${'PM oversight log #' + (k + 1)}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      task_id=EXCLUDED.task_id, user_id=EXCLUDED.user_id, minutes=EXCLUDED.minutes,
      logged_for_date=EXCLUDED.logged_for_date, source=EXCLUDED.source, note=EXCLUDED.note,
      archived_at=NULL, updated_at=now()`);
}

// ── 11) TESTS (~30) — developer + UAT on milestones AND tasks, weighted toward
// high done-fraction projects. Inserted as admin (asUser path; admin satisfies
// fn_can_edit(parent)). test_type ∈ {developer,uat}; outcome ∈ {pass,fail};
// passes carry passed_at. ──
const HIGH_DONE_PROJECTS = [1, 3, 6, 2]; // ordered by PROJECT_DONE_FRACTION
let tstN = 0;
for (const p of HIGH_DONE_PROJECTS) {
  const doneFrac = PROJECT_DONE_FRACTION[p - 1];
  const msStart = firstMsOfProject[p];
  for (let m = 0; m < msPerProject[p - 1]; m++) {
    const msId = MS_(msStart + m);
    const devPass = doneFrac >= 0.7;
    tstN++;
    await asUser(A, sql`
      INSERT INTO tests (id, parent_type, parent_id, test_type, title, brief, outcome, tester_user_id, tester_role, conducted_at, passed_at, created_at, updated_at)
      VALUES (${TST(tstN)}, 'milestone', ${msId}, 'developer', ${'Dev test — phase ' + (m + 1)}, ${'Automated + manual developer verification'}, ${devPass ? 'pass' : 'fail'}::test_outcome, ${DEV}, 'developer'::tester_role_type, ${dayOffset(-3)}::timestamptz, ${devPass ? dayOffset(-2) : null}::timestamptz, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, test_type=EXCLUDED.test_type,
        title=EXCLUDED.title, brief=EXCLUDED.brief, outcome=EXCLUDED.outcome,
        tester_user_id=EXCLUDED.tester_user_id, tester_role=EXCLUDED.tester_role,
        conducted_at=EXCLUDED.conducted_at, passed_at=EXCLUDED.passed_at, archived_at=NULL, updated_at=now()`);
    if (m === 0 && doneFrac >= 0.7) {
      tstN++;
      await asUser(A, sql`
        INSERT INTO tests (id, parent_type, parent_id, test_type, title, brief, outcome, tester_user_id, tester_role, conducted_at, passed_at, created_at, updated_at)
        VALUES (${TST(tstN)}, 'milestone', ${msId}, 'uat', ${'UAT — client acceptance'}, ${'Client UAT pass-through'}, 'pass'::test_outcome, ${PM}, 'pm'::tester_role_type, ${dayOffset(-1)}::timestamptz, ${dayOffset(-1)}::timestamptz, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, test_type=EXCLUDED.test_type,
          title=EXCLUDED.title, brief=EXCLUDED.brief, outcome=EXCLUDED.outcome,
          tester_user_id=EXCLUDED.tester_user_id, tester_role=EXCLUDED.tester_role,
          conducted_at=EXCLUDED.conducted_at, passed_at=EXCLUDED.passed_at, archived_at=NULL, updated_at=now()`);
    }
  }
  // Task-level dev tests on the first 3 tasks of the project.
  for (const tid of taskIdsByProject[p].slice(0, 3)) {
    tstN++;
    const pass = doneFrac >= 0.5;
    await asUser(A, sql`
      INSERT INTO tests (id, parent_type, parent_id, test_type, title, brief, outcome, tester_user_id, tester_role, conducted_at, passed_at, created_at, updated_at)
      VALUES (${TST(tstN)}, 'task', ${tid}, 'developer', ${'Task dev test'}, ${'Unit / integration check'}, ${pass ? 'pass' : 'fail'}::test_outcome, ${DEV}, 'developer'::tester_role_type, ${dayOffset(-3)}::timestamptz, ${pass ? dayOffset(-2) : null}::timestamptz, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, test_type=EXCLUDED.test_type,
        title=EXCLUDED.title, brief=EXCLUDED.brief, outcome=EXCLUDED.outcome,
        tester_user_id=EXCLUDED.tester_user_id, tester_role=EXCLUDED.tester_role,
        conducted_at=EXCLUDED.conducted_at, passed_at=EXCLUDED.passed_at, archived_at=NULL, updated_at=now()`);
  }
}

// ── 12) RATINGS (~17) — human DIRECTIONAL (PM→DEV on tasks, admin→PM on
// projects), thing-ratings on deals (no ratee → direction bypassed), and AI
// ratings with rating_basis. Each inserted AS the correct rater per
// fn_check_rating_direction (allowed human directions: admin→pm, admin→dev,
// pm→dev). Lights avg_rating on v_task_rollup, v_deal_rollup, v_user_rollup. ──
let rtN = 0;
// PM→DEV on DEV's tasks → v_task_rollup.avg_rating + v_user_rollup.avg_rating[DEV].
for (let i = 0; i < 8; i++) {
  rtN++;
  await asUser(PM, sql`
    INSERT INTO ratings (id, parent_type, parent_id, rater_type, rater_user_id, ratee_user_id, stars, feedback, created_at, updated_at)
    VALUES (${RT(rtN)}, 'task', ${devTasks[i % devTasks.length]}, 'human'::rater_type, ${PM}, ${DEV}, ${3 + (i % 3)}, ${'Solid delivery on this task.'}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, rater_type=EXCLUDED.rater_type,
      rater_user_id=EXCLUDED.rater_user_id, ratee_user_id=EXCLUDED.ratee_user_id, stars=EXCLUDED.stars,
      feedback=EXCLUDED.feedback, archived_at=NULL, updated_at=now()`);
}
// admin→PM on projects → v_user_rollup.avg_rating[PM].
for (const p of [1, 2, 3]) {
  rtN++;
  await asUser(A, sql`
    INSERT INTO ratings (id, parent_type, parent_id, rater_type, rater_user_id, ratee_user_id, stars, feedback, created_at, updated_at)
    VALUES (${RT(rtN)}, 'project', ${PR(p)}, 'human'::rater_type, ${A}, ${PM}, ${4 + (p % 2)}, ${'Strong PM ownership.'}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, rater_type=EXCLUDED.rater_type,
      rater_user_id=EXCLUDED.rater_user_id, ratee_user_id=EXCLUDED.ratee_user_id, stars=EXCLUDED.stars,
      feedback=EXCLUDED.feedback, archived_at=NULL, updated_at=now()`);
}
// Thing-ratings on deals (ratee NULL → direction rule doesn't apply) → v_deal_rollup.avg_rating.
for (const d of [5, 6, 7]) {
  rtN++;
  await asUser(A, sql`
    INSERT INTO ratings (id, parent_type, parent_id, rater_type, rater_user_id, ratee_user_id, stars, feedback, created_at, updated_at)
    VALUES (${RT(rtN)}, 'deal', ${DL(d)}, 'human'::rater_type, ${A}, NULL, ${4}, ${'High-quality engagement.'}, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, rater_type=EXCLUDED.rater_type,
      rater_user_id=EXCLUDED.rater_user_id, ratee_user_id=EXCLUDED.ratee_user_id, stars=EXCLUDED.stars,
      feedback=EXCLUDED.feedback, archived_at=NULL, updated_at=now()`);
}
// AI ratings (rater_type='ai' → direction bypassed; rater_user_id NULL) with rating_basis.
const aiBasis = JSON.stringify({
  criteria: ['code_quality', 'timeliness', 'communication'],
  sop: 'dev-delivery-v1',
  score_breakdown: { code_quality: 5, timeliness: 4, communication: 4 },
});
for (let i = 0; i < 3; i++) {
  rtN++;
  await tx(sql`
    INSERT INTO ratings (id, parent_type, parent_id, rater_type, rater_user_id, ratee_user_id, stars, feedback, rating_basis, created_at, updated_at)
    VALUES (${RT(rtN)}, 'task', ${devTasks[(i * 3) % devTasks.length]}, 'ai'::rater_type, NULL, ${DEV}, ${4 + (i % 2)}, ${'AI evaluation against SOP criteria.'}, ${aiBasis}::jsonb, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      parent_type=EXCLUDED.parent_type, parent_id=EXCLUDED.parent_id, rater_type=EXCLUDED.rater_type,
      rater_user_id=EXCLUDED.rater_user_id, ratee_user_id=EXCLUDED.ratee_user_id, stars=EXCLUDED.stars,
      feedback=EXCLUDED.feedback, rating_basis=EXCLUDED.rating_basis, archived_at=NULL, updated_at=now()`);
}

// ── 13) TASK_MANAGERS (~10) — PM as task-level manager across projects. ──
// (task_managers is fully cleared at reset §3; re-add here. INSERT by admin/pm.)
const tmTasks = [
  ...taskIdsByProject[1].slice(0, 3),
  ...taskIdsByProject[2].slice(0, 2),
  ...taskIdsByProject[3].slice(0, 3),
  ...taskIdsByProject[4].slice(0, 2),
];
for (const tid of tmTasks) {
  await tx(sql`INSERT INTO task_managers (task_id, user_id, created_at)
    VALUES (${tid}, ${PM}, now()) ON CONFLICT (task_id, user_id) DO NOTHING`);
}

// ════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════
const demoCounts = await sql.transaction([
  g,
  sql`SELECT
    (SELECT count(*) FROM companies   WHERE id::text LIKE '0a000000%' AND archived_at IS NULL)::int companies,
    (SELECT count(*) FROM contacts    WHERE id::text LIKE '0b000000%' AND archived_at IS NULL)::int contacts,
    (SELECT count(*) FROM deals       WHERE id::text LIKE '0c000000%' AND archived_at IS NULL)::int deals,
    (SELECT count(*) FROM projects    WHERE id::text LIKE '0d000000%' AND archived_at IS NULL)::int projects,
    (SELECT count(*) FROM milestones  WHERE id::text LIKE '0e000000%' AND archived_at IS NULL)::int milestones,
    (SELECT count(*) FROM tasks       WHERE id::text LIKE '0f000000%' AND archived_at IS NULL)::int tasks,
    (SELECT count(*) FROM payments    WHERE id::text LIKE '1a000000%' AND archived_at IS NULL)::int payments,
    (SELECT count(*) FROM conversation_entries WHERE id::text LIKE '1b000000%')::int conversation,
    (SELECT count(*) FROM notes       WHERE id::text LIKE '1c000000%' AND archived_at IS NULL)::int notes,
    (SELECT count(*) FROM attachments WHERE id::text LIKE '1d000000%' AND archived_at IS NULL)::int attachments,
    (SELECT count(*) FROM ai_insights WHERE id::text LIKE '1e000000%' AND archived_at IS NULL)::int ai_insights,
    (SELECT count(*) FROM time_logs  WHERE id::text LIKE '2a000000%' AND archived_at IS NULL)::int time_logs,
    (SELECT count(*) FROM tests      WHERE id::text LIKE '2b000000%' AND archived_at IS NULL)::int tests,
    (SELECT count(*) FROM ratings    WHERE id::text LIKE '2c000000%' AND archived_at IS NULL)::int ratings,
    (SELECT count(*) FROM user_availability WHERE date >= CURRENT_DATE AND date < CURRENT_DATE + 3)::int availability_window,
    (SELECT count(*) FROM task_managers)::int task_managers`,
]);
const dc = demoCounts[1][0];

// Pick a confirmed & an overdue payment id for clickable URLs.
const payIds = await sql.transaction([
  g,
  sql`SELECT
    (SELECT id FROM payments WHERE id::text LIKE '1a000000%' AND status='confirmed' LIMIT 1) confirmed,
    (SELECT id FROM payments WHERE id::text LIKE '1a000000%' AND status='overdue'   LIMIT 1) overdue`,
]);
const confirmedPay = payIds[1][0].confirmed;
const overduePay = payIds[1][0].overdue;
const salesDeal = DL(ownedDeals[0]); // a sales-owned demo deal

console.log('\n════════════════════ DEMO DATASET SUMMARY ════════════════════');
console.log('Counts created (demo rows):', dc);
console.log('Original seed project d0000000 already has the developer (kept).');
console.log('contacts.job_title:', HAS_JOB_TITLE ? 'present (set on 6 contacts)' : 'SKIPPED — column absent (0016 not applied)');

console.log('\n── SECURITY PROJECTION ──');
console.log('Developer (…0003) IS a member of these 3 demo projects:');
for (const p of DEV_MEMBER_PROJECTS) console.log('   ', PR(p));
console.log('Developer is NOT a member of these 3 demo projects:');
for (const p of DEV_NONMEMBER_PROJECTS) console.log('   ', PR(p));

console.log('\n── READY-TO-OPEN URLS ──');
console.log('developer:');
console.log('   /projects/' + PR(DEV_MEMBER_PROJECTS[0]) + '   (delivery view, no money/client)');
console.log('   /projects/' + PR(DEV_NONMEMBER_PROJECTS[0]) + '   (→ not-found wall)');
console.log('   /payments                                            (empty for dev)');
console.log('finance/admin:');
console.log('   /payments/' + confirmedPay + '   (a confirmed payment)');
console.log('   /payments/' + overduePay + '   (an overdue payment)');
console.log('   /projects/' + PR(1) + '   (full money visible)');
console.log('sales:');
console.log('   /deals/' + salesDeal + '   (a sales-owned deal)');
console.log("   /payments                                            (only own deals' payments)");
console.log('═══════════════════════════════════════════════════════════════');
