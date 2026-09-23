-- ============================================================
-- 016 round-typed bank columns (single table, UI splits 4 groups)
-- ============================================================
-- domain/difficulty: VĐ (domain in 6 groups, difficulty 20/30/40/50)
-- set_code/hint_index: GM (1 KEY + 8 hints per set)
-- KĐ/BP use round_hint only, these columns stay NULL.
-- ============================================================

BEGIN;

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS domain VARCHAR(10),
  ADD COLUMN IF NOT EXISTS difficulty INTEGER,
  ADD COLUMN IF NOT EXISTS set_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hint_index VARCHAR(4);

ALTER TABLE question_bank
  DROP CONSTRAINT IF EXISTS check_bank_domain;
ALTER TABLE question_bank
  ADD CONSTRAINT check_bank_domain CHECK (
    domain IS NULL OR domain IN ('THTH', 'TNSS', 'XHPL', 'VHNT', 'TTGT', 'KTTH')
  );

ALTER TABLE question_bank
  DROP CONSTRAINT IF EXISTS check_bank_difficulty;
ALTER TABLE question_bank
  ADD CONSTRAINT check_bank_difficulty CHECK (
    difficulty IS NULL OR difficulty IN (20, 30, 40, 50)
  );

ALTER TABLE question_bank
  DROP CONSTRAINT IF EXISTS check_bank_hint_index;
ALTER TABLE question_bank
  ADD CONSTRAINT check_bank_hint_index CHECK (
    hint_index IS NULL OR hint_index IN ('KEY', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8')
  );

CREATE INDEX IF NOT EXISTS idx_bank_domain ON question_bank (domain, difficulty);
CREATE INDEX IF NOT EXISTS idx_bank_set ON question_bank (set_code);
-- Mỗi set GM đúng 8 hint: cấm trùng vị trí trong set.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_set_hint
  ON question_bank (set_code, hint_index) WHERE set_code IS NOT NULL;

COMMIT;
