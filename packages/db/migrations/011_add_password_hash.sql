-- ============================================================
-- Add password_hash for email/password signup (argon2id)
-- ============================================================
-- google_id stays nullable for OAuth users.
-- password_hash nullable: OAuth-only accounts have NULL.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/011_add_password_hash.sql
-- ============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

COMMIT;

-- ============================================================
-- Verification:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name = 'password_hash';
-- ============================================================
