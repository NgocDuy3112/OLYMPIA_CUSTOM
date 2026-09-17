-- ============================================================
-- 002 FK: match_checkpoints.match_code -> matches.match_code
-- ============================================================
-- Checkpoints use match_code (not id) so restores work even if
-- Valkey keys are code-based.
--
-- Usage (after 001_baseline.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/002_fk_checkpoint.sql
-- ============================================================

BEGIN;

ALTER TABLE match_checkpoints
  ADD CONSTRAINT fk_checkpoint_match_code
  FOREIGN KEY (match_code)
  REFERENCES matches (match_code)
  ON DELETE CASCADE;

COMMIT;
