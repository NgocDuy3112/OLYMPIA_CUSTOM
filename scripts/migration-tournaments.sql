-- ============================================================
-- Migration: Add Tournaments tables
-- Chạy TRƯỚC khi deploy tournament feature
-- ============================================================

BEGIN;

-- 1. Tournaments table
-- ─────────────────────
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
  created_by UUID REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments(created_by);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);

-- 2. TournamentPlayers table
-- ───────────────────────────
CREATE TABLE IF NOT EXISTS tournament_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  group_number VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);

COMMIT;
