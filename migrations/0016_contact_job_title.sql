-- Migration 0016 | contact_job_title | Add optional job_title to contacts | Depends: 0015
--
-- Recommended add (Manish's call): the Contact Detail header sub-line shows a
-- role/title ("Head of Operations"). job_title is a standard, lightweight CRM
-- field — nullable text, non-derived, no drift risk. Worth the column.
--
-- After applying, wire it: contacts editable allowlist + getContact select +
-- the header sub-line (role · company · created · updated).

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_title text;

COMMIT;
