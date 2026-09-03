-- Rollback: remove tournament_id from matches

BEGIN;

DROP INDEX IF EXISTS idx_matches_tournament_id;
ALTER TABLE matches DROP COLUMN IF EXISTS tournament_id;

COMMIT;
