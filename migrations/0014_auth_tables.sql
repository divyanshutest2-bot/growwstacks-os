-- Migration 0014 | auth_tables | Auth.js verification token store | Depends: 0013
--
-- Auth.js (next-auth v5) Email/magic-link provider needs a place to store
-- single-use verification tokens. With the JWT session strategy we DO NOT need
-- a session/account/user table — only this verification_token table.
--
-- This is an INFRA table, not user data:
--   * It is app_user-only (no other role touches it).
--   * Rows are looked up by the (identifier, token) value the user already holds
--     from their magic-link email — there is no "list all tokens" access path.
--   * Therefore NO RLS is applied here; RLS guards USER DATA in public.*, not
--     this transient token store. Auth.js needs INSERT (issue), SELECT (verify),
--     and DELETE (consume/expire) on it.

BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.verification_token (
  identifier text        NOT NULL,
  token      text        NOT NULL,
  expires    timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- app_user is the production (non-owner) role the app connects as.
GRANT USAGE ON SCHEMA auth TO app_user;
GRANT SELECT, INSERT, DELETE ON auth.verification_token TO app_user;

COMMIT;
