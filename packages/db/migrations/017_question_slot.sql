-- ============================================================
-- 017 match question slots (round-aware pick)
-- ============================================================
-- slot formats: KDC_1..6 | KDR{1..4}_1..6 | GM_KEY/GM_H1..H8 |
-- BP_1..4 | VD_<DOMAIN>_<20|30|40|50>
-- One slot per match max (partial unique).
-- ============================================================

BEGIN;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS slot VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_match_slot
  ON questions (match_id, slot) WHERE slot IS NOT NULL;

COMMIT;
