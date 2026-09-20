-- ============================================================
-- 011 qualifier per tournament (option A)
-- ============================================================
-- qualifier_questions: 1 tournament share 1 bo de trac nghiem
--   4-6 options (jsonb array), 1 dap an dung (correct_option A-F)
-- qualifier_attempts: 1 row / player / question
--   ranking = count(is_correct) + response_time_ms
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/011_qualifier.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS qualifier_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  question_code VARCHAR(25) NOT NULL,
  content VARCHAR NOT NULL,
  options JSONB NOT NULL,
  correct_option VARCHAR(1) NOT NULL,
  explanation VARCHAR,
  media_url VARCHAR,
  round_number INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_qualifier_options_4_to_6 CHECK (jsonb_array_length(options) BETWEEN 4 AND 6),
  CONSTRAINT check_qualifier_correct_option CHECK (correct_option IN ('A','B','C','D','E','F'))
);
CREATE INDEX IF NOT EXISTS idx_qualifier_questions_tournament ON qualifier_questions (tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qualifier_question_code ON qualifier_questions (tournament_id, question_code);

CREATE TABLE IF NOT EXISTS qualifier_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualifier_question_id UUID NOT NULL REFERENCES qualifier_questions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_option VARCHAR(1) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_qualifier_attempt UNIQUE (qualifier_question_id, player_id),
  CONSTRAINT check_qualifier_selected_option CHECK (selected_option IN ('A','B','C','D','E','F'))
);
CREATE INDEX IF NOT EXISTS idx_qualifier_attempts_question ON qualifier_attempts (qualifier_question_id);
CREATE INDEX IF NOT EXISTS idx_qualifier_attempts_player ON qualifier_attempts (player_id);

COMMIT;
