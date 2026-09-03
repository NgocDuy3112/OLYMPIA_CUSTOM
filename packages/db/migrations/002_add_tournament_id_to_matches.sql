-- ============================================================
-- Add tournament_id FK to matches table
-- ============================================================
-- Links matches to tournaments for tournament-level aggregation.
-- Nullable — existing matches without tournament stay valid.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/002_add_tournament_id_to_matches.sql
--
-- Rollback:
--   psql -U <user> -d <database> -f packages/db/migrations/002_add_tournament_id_to_matches_rollback.sql
-- ============================================================

BEGIN;

-- Add nullable FK column
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS tournament_id UUID
  REFERENCES tournaments(id) ON DELETE SET NULL;

-- Index for filtering matches by tournament
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id
  ON matches (tournament_id);

COMMIT;

-- ============================================================
-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'matches' AND column_name = 'tournament_id';
-- ============================================================
