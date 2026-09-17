-- ============================================================
-- BASELINE v5 — fresh DB install
-- ============================================================
-- Single path (old DB is gone).
-- Includes final state:
--   users.role: admin/operator/player/spectator + operator_scopes
--   players (renamed from tournament_players, no role column)
--   matches + scheduling, phases, bracket, templates (no teams)
--   questions/answers/records/qualifier/audit/checkpoints
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/001_baseline.sql
-- ============================================================

BEGIN;

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ──
DO $$ BEGIN
  CREATE TYPE roleenum AS ENUM ('admin', 'operator', 'player', 'spectator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE matchstatusenum AS ENUM ('setup', 'active', 'in_progress', 'paused', 'completed', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE auditactiontype AS ENUM ('LOGIN', 'LOGOUT', 'SCORE_CHANGE', 'MATCH_STATE_CHANGE', 'PLAYER_JOIN', 'PLAYER_LEAVE', 'QUESTION_USED', 'MATCH_CREATED', 'MATCH_DELETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Users ──
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_slug VARCHAR(50) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  google_id VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  user_code VARCHAR(50) NOT NULL UNIQUE,
  user_name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500),
  role roleenum NOT NULL DEFAULT 'player',
  operator_scopes VARCHAR(100),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_user_code_starts_with_OC_U CHECK (position('OC_U' in user_code) = 1)
);

-- ── Tournaments ──
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_code VARCHAR(50) NOT NULL UNIQUE,
  tournament_name VARCHAR(200) NOT NULL,
  description TEXT,
  tournament_format VARCHAR(50) NOT NULL DEFAULT 'oc3',
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  max_players VARCHAR(10),
  venue VARCHAR(200),
  notes TEXT,
  discord_guild_id VARCHAR(32),
  discord_role_map TEXT,
  discord_notify_channel_id VARCHAR(32),
  created_by UUID REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments (created_by);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status);
CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments (discord_guild_id);

-- ── Players (renamed from tournament_players, membership only, no role) ──
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  group_number VARCHAR(20),
  discord_user_id VARCHAR(32),
  discord_nickname VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_players_tournament_player UNIQUE (tournament_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_players_tournament ON players (tournament_id);
CREATE INDEX IF NOT EXISTS idx_players_player ON players (player_id);
CREATE INDEX IF NOT EXISTS idx_players_discord ON players (tournament_id, discord_user_id);

-- ── Tournament phases ──
CREATE TABLE IF NOT EXISTS tournament_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  phase_name VARCHAR(100) NOT NULL,
  phase_type VARCHAR(20) NOT NULL DEFAULT 'group_stage',
  match_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phases_tournament ON tournament_phases (tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase_number ON tournament_phases (tournament_id, phase_number);

-- ── Matches ──
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_slug VARCHAR(50) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  match_pin VARCHAR(6) NOT NULL DEFAULT '000000',
  match_code VARCHAR(50) NOT NULL UNIQUE,
  match_name VARCHAR(100) NOT NULL UNIQUE,
  match_status matchstatusenum NOT NULL DEFAULT 'setup',
  tournament_format VARCHAR(50) NOT NULL DEFAULT 'oc3',
  video_url VARCHAR(500),
  match_format VARCHAR(20) NOT NULL DEFAULT 'individual',
  match_label VARCHAR(20),
  phase_id UUID REFERENCES tournament_phases(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  venue VARCHAR(200),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_matches_created_by ON matches (created_by);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_phase_id ON matches (phase_id);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled_at ON matches (scheduled_at);

-- ── Match player positions (lineup 1-4) ──
CREATE TABLE IF NOT EXISTS match_player_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  CONSTRAINT uq_match_position UNIQUE (match_id, position),
  CONSTRAINT uq_match_player UNIQUE (match_id, player_id),
  CONSTRAINT check_valid_position CHECK (position >= 1 AND position <= 4)
);

-- ── Bracket edges ──
CREATE TABLE IF NOT EXISTS bracket_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 4),
  to_match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_bracket_edge UNIQUE (from_match_id, rank, to_match_id)
);
CREATE INDEX IF NOT EXISTS idx_bracket_from ON bracket_edges (from_match_id);
CREATE INDEX IF NOT EXISTS idx_bracket_to ON bracket_edges (to_match_id);

-- ── Questions ──
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_code VARCHAR(25) NOT NULL,
  content VARCHAR NOT NULL,
  answer VARCHAR NOT NULL,
  media_url VARCHAR,
  explanation VARCHAR,
  options VARCHAR,
  is_used BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  match_id UUID NOT NULL REFERENCES matches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_match_id ON questions (match_id);

-- ── Answers ──
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_text VARCHAR,
  has_buzzed BOOLEAN DEFAULT false,
  timestamp NUMERIC(16, 3),
  is_deleted BOOLEAN DEFAULT false,
  player_id UUID NOT NULL REFERENCES users(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  question_id UUID NOT NULL REFERENCES questions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_answers_player_id ON answers (player_id);
CREATE INDEX IF NOT EXISTS idx_answers_match_id ON answers (match_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers (question_id);

-- ── Records (scores) ──
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  points INTEGER NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  player_id UUID NOT NULL REFERENCES users(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  question_id UUID NOT NULL REFERENCES questions(id),
  round_number INTEGER,
  question_code VARCHAR(25),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_points_multiple_of_5 CHECK (points % 5 = 0)
);
CREATE INDEX IF NOT EXISTS idx_records_player_id ON records (player_id);
CREATE INDEX IF NOT EXISTS idx_records_match_id ON records (match_id);
CREATE INDEX IF NOT EXISTS idx_records_question_id ON records (question_id);

-- ── Qualifier records ──
CREATE TABLE IF NOT EXISTS qualifier_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  points INTEGER NOT NULL,
  response_time DOUBLE PRECISION,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  round_number INTEGER NOT NULL DEFAULT 1,
  chosen_option VARCHAR(1),
  is_deleted BOOLEAN DEFAULT false,
  player_id UUID NOT NULL REFERENCES users(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  question_id UUID NOT NULL REFERENCES questions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_player_id ON qualifier_records (player_id);
CREATE INDEX IF NOT EXISTS idx_qr_match_id ON qualifier_records (match_id);
CREATE INDEX IF NOT EXISTS idx_qr_question_id ON qualifier_records (question_id);

-- ── Qualifier advancements ──
CREATE TABLE IF NOT EXISTS qualifier_advancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  round_number INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_player_id ON qualifier_advancements (player_id);
CREATE INDEX IF NOT EXISTS idx_qa_match_id ON qualifier_advancements (match_id);

-- ── Match checkpoints ──
CREATE TABLE IF NOT EXISTS match_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code VARCHAR(50) NOT NULL,
  checkpoint JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkpoint_match_time ON match_checkpoints (match_code, created_at DESC);

COMMIT;
