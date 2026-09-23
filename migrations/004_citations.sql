-- ============================================================
-- 004 citations JSONB (thay template nhét trong explanation)
-- Row cũ giữ explanation nguyên, citations rỗng, qauthor bổ sung sau.
-- Item: [{source, url, accessed_at}] — accessed_at timestamptz,
-- hiển thị DD/MM/YYYY theo Asia/Ho_Chi_Minh ở web/agent.
-- ============================================================

BEGIN;

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]';

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]';

COMMIT;
