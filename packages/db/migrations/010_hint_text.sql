-- ============================================================
-- 010 add hint_text to questions + question_bank (GIAI_MA Goi y)
-- ============================================================
-- GIAI_MA sheet has a dedicated "Goi y" column (text or media file).
-- Previously handleShowHint reused explanation; now stored separately.
--
-- Usage (after 009_seed_bank.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/010_hint_text.sql
-- ============================================================

BEGIN;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS hint_text VARCHAR;

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS hint_text VARCHAR;

COMMIT;
