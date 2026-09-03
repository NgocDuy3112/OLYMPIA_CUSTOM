-- ============================================================
-- OC3 → OC4 Database Migration
-- ============================================================
-- Run BEFORE deploying the v4 Fastify backend.
-- All changes are additive — existing data is preserved.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/001_v3_to_v4.sql
--
-- Rollback:
--   psql -U <user> -d <database> -f packages/db/migrations/001_v3_to_v4_rollback.sql
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. Users table — add Google OAuth columns
-- ─────────────────────────────────────────────

-- google_id: nullable, unique — will be populated on first Google login
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- avatar_url: nullable — Google profile picture
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

-- NOTE: hashed_password column is NOT dropped yet.
-- It will be removed in Phase 4 cleanup after v4 is confirmed stable.

-- ─────────────────────────────────────────────
-- 2. Matches table — add tournament format + video
-- ─────────────────────────────────────────────

-- tournament_format: which engine to use. Default 'oc3' for backward compat.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tournament_format VARCHAR(50) NOT NULL DEFAULT 'oc3';

-- video_url: YouTube/Facebook live stream URL (set by admin after OBS starts)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);

-- ─────────────────────────────────────────────
-- 3. Match checkpoints — NEW table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_checkpoints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code VARCHAR(50) NOT NULL,
  checkpoint JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_match_time
  ON match_checkpoints (match_code, created_at DESC);

-- ─────────────────────────────────────────────
-- Done — commit
-- ─────────────────────────────────────────────

COMMIT;
