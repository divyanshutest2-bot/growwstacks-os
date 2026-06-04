-- Migration 0000 | extensions | Enable required Postgres extensions | Depends: nothing

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

COMMIT;
