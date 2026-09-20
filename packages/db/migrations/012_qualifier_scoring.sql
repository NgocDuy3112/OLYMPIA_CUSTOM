-- ============================================================
-- 012 qualifier scoring: status + points + position unique
-- ============================================================
-- Zero-sum per question: X dung, Y sai, Z bo (Z = N - X - Y).
--   dung +Y / nguoi, sai -X / nguoi, bo 0.
-- status open -> closed freeze X/Y. points NULL until scored.
-- position 1-16 unique per tournament (16 cau vong loai).
-- Ranking: SUM(points) DESC, COUNT(correct) DESC, AVG(correct time) ASC.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/012_qualifier_scoring.sql
-- ============================================================

BEGIN;

ALTER TABLE qualifier_questions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open';

DO $$ BEGIN
  ALTER TABLE qualifier_questions
    ADD CONSTRAINT check_qualifier_status CHECK (status IN ('open','closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qualifier_position
  ON qualifier_questions (tournament_id, position);

ALTER TABLE qualifier_attempts
  ADD COLUMN IF NOT EXISTS points INTEGER;

COMMIT;
