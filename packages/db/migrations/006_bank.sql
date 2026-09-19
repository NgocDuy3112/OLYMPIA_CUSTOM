-- ============================================================
-- 006 question bank (QB_* codes) + enum compat + used index
-- ============================================================
-- Bank rows use QB_* codes (stable, searchable, no round prefix).
-- Match questions keep OC3_Q_* codes for live WS/game pages.
-- Pick flow: POST /questions/pick copies bank -> match, generates
-- OC3_Q_* code, stores source_bank_id for "used where" tracking.
--
-- Usage (after 005_drop_players.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/006_bank.sql
-- ============================================================

BEGIN;

-- ── Enum compat: Drizzle roleEnum includes controller/member ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'roleenum' AND e.enumlabel = 'controller'
  ) THEN
    ALTER TYPE roleenum ADD VALUE 'controller';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'roleenum' AND e.enumlabel = 'member'
  ) THEN
    ALTER TYPE roleenum ADD VALUE 'member';
  END IF;
END $$;

-- ── Question bank ──
CREATE TABLE IF NOT EXISTS question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_code VARCHAR(25) NOT NULL UNIQUE,
  content VARCHAR NOT NULL,
  answer VARCHAR NOT NULL,
  media_url VARCHAR,
  explanation VARCHAR,
  options VARCHAR,
  tags VARCHAR(200),
  round_hint VARCHAR(20),
  is_deleted BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_bank_code_starts_with_QB CHECK (position('QB_' in bank_code) = 1)
);
CREATE INDEX IF NOT EXISTS idx_bank_code ON question_bank (bank_code);
CREATE INDEX IF NOT EXISTS idx_bank_round_hint ON question_bank (round_hint);
CREATE INDEX IF NOT EXISTS idx_bank_tags ON question_bank (tags);

-- ── Link match questions back to bank (used-where tracking) ──
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS source_bank_id UUID REFERENCES question_bank(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_questions_source_bank ON questions (source_bank_id);

-- ── Used flag index (bank "used" filter + live markUsed) ──
CREATE INDEX IF NOT EXISTS idx_questions_used ON questions (match_id, is_used);

COMMIT;
