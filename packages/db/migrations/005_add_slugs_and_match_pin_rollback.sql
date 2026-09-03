-- Rollback: remove matchSlug and matchPin

BEGIN;

DROP INDEX IF EXISTS idx_matches_match_slug;
ALTER TABLE matches DROP COLUMN IF EXISTS match_slug;
ALTER TABLE matches DROP COLUMN IF EXISTS match_pin;

COMMIT;
