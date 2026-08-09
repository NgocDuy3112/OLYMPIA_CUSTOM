-- ============================================================
-- OC3 → OC4 Rollback
-- ============================================================
-- Reverts 001_v3_to_v4.sql
-- Safe to run — only removes columns/tables added in v4 migration.
-- ============================================================

BEGIN;

-- Remove new columns from users
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;

-- Remove new columns from matches
ALTER TABLE matches DROP COLUMN IF EXISTS tournament_format;
ALTER TABLE matches DROP COLUMN IF EXISTS video_url;

-- Drop new table
DROP TABLE IF EXISTS match_checkpoints;

COMMIT;
