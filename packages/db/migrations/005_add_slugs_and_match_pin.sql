-- ============================================================
-- Add matchSlug + matchPin
-- ============================================================
-- matchSlug is UUID used in URLs (not guessable).
-- matchPin is a 6-digit code players use to join matches.
-- Tournaments keep using tournamentCode (short code).
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/005_add_slugs_and_match_pin.sql
--
-- Rollback:
--   psql -U <user> -d <database> -f packages/db/migrations/005_add_slugs_and_match_pin_rollback.sql
-- ============================================================

BEGIN;

-- ── Matches: add matchSlug + matchPin ──
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS match_slug VARCHAR(50) NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS match_pin VARCHAR(6) NOT NULL DEFAULT '000000';

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_match_slug ON matches (match_slug);

-- Generate random 6-digit PINs for existing matches
UPDATE matches SET match_pin = LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0')
WHERE match_pin = '000000';

COMMIT;

-- ============================================================
-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'matches' AND column_name IN ('match_slug', 'match_pin');
-- ============================================================
