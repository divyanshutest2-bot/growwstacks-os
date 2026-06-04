# UI Kit — Internal (Full mode)

High-fidelity, clickable recreations of the internal GrowwStacks OS app (admin / PM / sales —
the **Full** mode: everything visible, including money and client identity).

Built entirely on the foundation: `../../colors_and_type.css` (tokens) + Lucide icons. No raw hex.

## Shared files
- `shell.css` — app chrome + component CSS (sidebar, topbar, cards, table, inline-edit, badges, rating
  badge, conversation, toast). Link after `../../colors_and_type.css`.
- `nav.js` — renders the left nav into `<aside id="sidebar" data-active="…">`; keeps it identical everywhere. Pass `data-role="dev"` (plus `data-user`/`data-user-role`/`data-user-init`/`data-user-color`) to get the developer nav — Companies/Contacts/Deals/Payments/Users are omitted entirely, not hidden. Pass `data-role="client"` for the client-portal nav (only Projects / Timeline / Deliverables; no AI or admin sections).
- `inline-edit.js` — the signature click-to-edit auto-save (`initInlineEdit()`), plus `gsToast()` / `gsIcons()`.
- `list-kit.js` — reusable table list engine: `initList(cfg)` renders a column-config table with skeleton/empty/loading states, live search, filter-chip toggles, nav-on-row-click, and `LK` render helpers (avatars, owner stacks, status/schedule/rating badges, progress bars, money, mono). The four entity lists (Milestones, Tasks, Payments, Users) are thin configs on top of it.

## Screens
| File | Screen | Notes |
|---|---|---|
| `Dashboard.html` | **Dashboard — AI attention queue** (Full/admin) | The landing page. A calm AI digest, a quiet metrics row (no charts), and the centerpiece **AI attention queue**: prioritized propose→confirm items (overdue payment, stalled milestone, quiet client, task-from-message, AI ratings, rebalance) each with evidence + Confirm/Dismiss/Edit, plus an "already handled" reversible strip. Side rail: Today counts, active blockers, delivery health. |
| `index.html` | **Project detail** (`Lead-routing automation` for Acme Robotics) | The richest project screen — exercises most universal components. |
| `Project (Developer view).html` | **Project — developer view** | The same project as a delivery cockpit. Money, billing, deal, contact & company are **absent (not greyed)** — even the left nav drops Companies/Contacts/Deals/Payments. Completion is task-count; hours shown separately. Blockers phrased without client identity ("external dependency"). Tabs: Milestones / My tasks / Tests. |
| `Client Timeline.html` | **Client portal — project timeline** | The flagship, client-facing mode (calmer, more spacious, read-only). Honest delay-attribution timeline: a "where the time went" summary bar + a vertical chronological timeline with each gap neutrally marked **Our work / Awaiting your input / External dependency**. Plus client-safe milestones (no price/hours) and a deliverables gallery. No internal notes, AI internals, ratings, billing, or other clients. |
| `Contacts.html` | **Contacts list** | Table + FilterBar + AI strip + labeled rating badges. State switcher: Populated / Loading (skeleton) / Empty / Error. Search filters live; rows link to the detail. |
| `Companies.html` | **Companies list** | Org table — monogram logo, status, industry, internal owner stack, # contacts, projects, open tasks, **aggregate** lifetime value, rating. FilterBar + AI strip + state switcher. |
| `Deals.html` | **Deals — board + list** | Kanban pipeline (the centerpiece): columns per stage with count + summed value, draggable deal cards (drag = stage auto-save, recomputes totals + toast), Won/Lost columns visually distinct, stale-deal ⏳ chips. Board⇄List toggle; list shows weighted value. Money present (full projection). |
| `Deal Detail.html` | **Deal detail** (Annual retainer, Won) | Stat strip (deal value / received / outstanding / probability / owners), inline-editable value + stage enum, linked contact & company, negotiation-history conversation, deal-specific AI insights, sensitive reveal-logged attachments, and the **convert-to-project** action (Won → creates & links a project). |
| `Milestones.html` | **Milestones list** | Task-count completion bars, status + schedule badges, value (₹), tasks (total·done), owners. Built on `list-kit.js`. |
| `Milestone Detail.html` | **Milestone detail** (M4) | Completion is **read-only, derived from task count** (never editable; hours shown separately as effort). Tasks list, dev + UAT tests, billing-on-delivery, AI margin note, attachments, notes. |
| `Tasks.html` | **Tasks list** | Status + priority + delivery state, assignees + manager, due, effort (separate, never feeds completion). |
| `Task Detail.html` | **Task detail** (dev-safe) | **No money / client identity** (consistent with the Developer project view) — requirement, internal discussion, dev + UAT tests, the user's own time logged, AI review. |
| `Payments.html` | **Payments list** | Money-forward: aggregate Received vs Outstanding cards, full status lifecycle (draft / sent / paid / overdue / failed / refunded), against-tag (deal/project/milestone), overdue AI strip. |
| `Payment Detail.html` | **Payment detail** (PMT-0007, overdue) | Prominent amount, **finance-gated** status enum (Paid/Confirmed disabled for non-finance), draft→sent→paid→confirmed lifecycle rail, calm amber overdue treatment, sensitive reveal-logged invoice, activity (created/confirmed-by). |
| `Users.html` | **Users list** | Team with status dots (active/away/left-org), role, shift, projects, last active; "Invite user" (allowlist provisioning). |
| `User Detail.html` | **User detail** (Neha Kapoor) | Profile + tech expertise, 3-day availability + capacity, workload tree (projects/tasks), aggregate time spent, AI performance note, inline role change (admin-logged) and **Archive** (the kill switch — revokes access, keeps history). |
| `Company Detail.html` | **Company detail** (Acme Robotics) | Mirrors the contact detail, org-level: aggregate stat strip (people / projects / deals / received / outstanding), and the distinctive central **People panel** (each contact with role + portal indicator + status dot, linking to their detail). Account-level conversation, AI insights, projects with completion %, deals, tasks, notes. |
| `Contact Detail.html` | **Contact detail** (Ravi Menon, Acme Robotics) | The hub. Header w/ prominent Lifetime Value + inline status enum; left meta (all inline-edit) + CredentialsCard (reveal-logged) + AttachmentsCard; **ConversationPanel as the center of gravity** (5 channels, call card, composer); right rail of AI insights + Projects / Milestones / Tasks / Deals / Notes summaries. |

### What's interactive in `index.html`
- **Collapse the nav** (top-left panel button) — sidebar shrinks to the 64px icon rail.
- **Inline-edit** any field with a pencil affordance (title, App/area, dates): click → edit →
  auto-saves (spinner → green "Saved" → rests). Enter commits, Esc cancels.
- **Tabs**: Conversation / Milestones / Tasks / Tests (Tests shows the EmptyState).
- **Channel filter chips** in the conversation.
- **Composer**: type + Enter/Send appends an outbound message.
- **Task checkboxes** toggle done; **AI proposal** Confirm creates a task (and adds it to the Tasks
  tab) / Reject dismisses — both raise a toast.

## Layout (the standard detail template)
Header stat-strip → three columns: **left** meta + owners + health · **center** delivery timeline +
tabbed content · **right** AI Supervisor (insights + proposal) + billing + notes + attachments.

## Still to build (later passes)
Dashboard / AI attention queue, Deals, Companies, Contacts, Projects list, Payments — plus the
**Developer view** (money + client identity absent) and **Client portal** variants of these screens.
