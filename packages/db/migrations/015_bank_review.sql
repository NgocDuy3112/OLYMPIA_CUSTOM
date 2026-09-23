-- ============================================================
-- 015 bank review status (pending/approved/rejected + reviewer note)
-- ============================================================
-- New rows default pending; existing live rows backfilled approved.
-- ============================================================

BEGIN;

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Existing rows are already live in matches: mark approved.
UPDATE question_bank SET status = 'approved' WHERE status = 'pending';

ALTER TABLE question_bank
  DROP CONSTRAINT IF EXISTS check_bank_status;
ALTER TABLE question_bank
  ADD CONSTRAINT check_bank_status CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_bank_status ON question_bank (status);

COMMIT;
