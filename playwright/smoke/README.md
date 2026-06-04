# Phase 1 Playwright Smoke Test Plan

These tests will be implemented when Phase 1 (core functionality) is complete.
Each test must pass before Phase 1 is declared done.

## Test matrix

### 1. Spine entities (contacts, companies, deals, projects, milestones, tasks)
For each entity:
- [ ] List page loads and renders at least 1 row
- [ ] Detail page loads (click first row)
- [ ] Create modal/form opens, creates a record, appears in list
- [ ] Inline field edit: click a field, change it, tab away, verify saved (no submit button)
- [ ] Archive (not delete): verify no delete button exists; archive removes from list

### 2. Polymorphic cards (on each detail page)
- [ ] Attachments card renders
- [ ] Notes card renders, new note can be added
- [ ] Conversation card renders
- [ ] AI Insights card renders (may be empty)

### 3. Multi-owner assignment
- [ ] Project: can assign multiple PMs and developers
- [ ] Task: can assign multiple developers

### 4. RLS projections (login as each role)
- [ ] As developer: companies/contacts/deals/payments pages return 0 results or redirect
- [ ] As developer: project detail page (for member project) renders without billing fields
- [ ] As sales: no create-project button visible or functional

### 5. Responsive (all three viewports in playwright.config.ts)
- [ ] List pages render without horizontal scroll at mobile (375px)
- [ ] Detail pages render at tablet (768px)
- [ ] No layout breakage at desktop (1440px)

## Screenshot targets (captured on every CI run)
- /contacts list
- /contacts/[id] detail
- /projects list
- /projects/[id] detail
- /projects/[id] as developer (should not show billing)

## How to run (Phase 1 onwards)
```bash
npx playwright test --project=desktop
npx playwright test --reporter=html  # open HTML report
```
