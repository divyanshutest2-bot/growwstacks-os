// playwright/support/seed.ts — single source of truth for seed-data identifiers
// used across the contacts specs. Mirrors migrations/0012_seed.sql exactly.
//
// If the seed changes, change it HERE — the specs import from this file so the
// data contract lives in one place.

/** Seed user UUIDs (migrations/0012_seed.sql). */
export const SEED_USERS = {
  admin: '00000000-0000-0000-0000-000000000001',
  pm: '00000000-0000-0000-0000-000000000002',
  developer: '00000000-0000-0000-0000-000000000003',
  sales: '00000000-0000-0000-0000-000000000004',
  finance: '00000000-0000-0000-0000-000000000005',
} as const;

export type SeedRole = keyof typeof SEED_USERS;

/** Seed contact UUIDs (migrations/0012_seed.sql). Two contacts seeded. */
export const SEED_CONTACTS = {
  // Contact 1: Alice Smith, active_client, owned by the SALES user, has a company.
  alice: 'b0000000-0000-0000-0000-000000000001',
  // Contact 2: Bob Johnson, prospect, solo lead (no company).
  bob: 'b0000000-0000-0000-0000-000000000002',
} as const;

/**
 * The contact a developer must NEVER be able to reach through the app path.
 * Used by the developer-projection-wall spec to hit a detail route directly.
 */
export const WALLED_CONTACT_ID = SEED_CONTACTS.alice;

/** Seed company UUIDs (migrations/0012_seed.sql). One company seeded. */
export const SEED_COMPANIES = {
  // Acme Corp, type='client', display_id CO-201. Alice's company.
  acme: 'a0000000-0000-0000-0000-000000000001',
} as const;

/**
 * The company a developer must NEVER be able to reach through the app path.
 * Developers have ZERO access to companies (RLS: no SELECT policy). Used by the
 * developer-projection-wall spec to hit /companies and the detail route directly.
 */
export const WALLED_COMPANY_ID = SEED_COMPANIES.acme;
