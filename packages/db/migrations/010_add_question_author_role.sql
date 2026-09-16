-- ============================================================
-- Add question_author to tournament_players roles
-- ============================================================
-- question_author: per-tournament staff who writes questions.
-- Sees answers like controller/mc, can write questions in the
-- assigned tournament, but can NEVER sit as a player in a match
-- (enforced in POST /matches/:slug/players).
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/010_add_question_author_role.sql
-- ============================================================

BEGIN;

-- Drop old check, add new one including question_author
ALTER TABLE tournament_players DROP CONSTRAINT IF EXISTS check_valid_tournament_role;

ALTER TABLE tournament_players
  ADD CONSTRAINT check_valid_tournament_role
  CHECK (role IN ('controller', 'mc', 'question_author', 'player', 'spectator'));

COMMIT;

-- ============================================================
-- Verification:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'check_valid_tournament_role';
-- ============================================================
