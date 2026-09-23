-- ============================================================
-- 014 drop question_bank.tags (replaced by domain taxonomy)
-- ============================================================
-- Tags column removed entirely per product decision.
-- Domain grouping + embedding similarity replace tag search.
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS idx_bank_tags;
ALTER TABLE question_bank DROP COLUMN IF EXISTS tags;

COMMIT;
