-- ============================================================
-- 003 score_reviews: controller asks qauthor to judge answers
-- ============================================================
-- Flow: controller marks [position] name on web -> API creates pending row ->
-- Discord bot posts embed + buttons -> qauthor decides -> callback.
--
-- Usage (after 002_fk_checkpoint.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/003_score_reviews.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS score_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  match_code VARCHAR(50) NOT NULL,
  question_code VARCHAR(25) NOT NULL,
  candidates JSONB NOT NULL,
  decisions JSONB NOT NULL DEFAULT '{}',
  ocee_suggestion JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_by VARCHAR(50),
  decided_by VARCHAR(50),
  discord_message_id VARCHAR(32),
  discord_channel_id VARCHAR(32),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_score_reviews_match ON score_reviews (match_id, status);
CREATE INDEX IF NOT EXISTS idx_score_reviews_question ON score_reviews (question_id, status);

COMMIT;
