-- ============================================================
-- Add tournament phases, bracket edges, and match scheduling
-- ============================================================
-- - tournament_phases: persisted phases (replaces ephemeral phase_N ids)
-- - bracket_edges: advancement links (from_match rank -> to_match)
-- - matches: + scheduled_at, + venue, phase_id FK -> tournament_phases
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/008_add_phases_and_bracket.sql
-- ============================================================

BEGIN;

-- ── Tournament Phases ──
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

-- ── Bracket Edges ──
CREATE TABLE IF NOT EXISTS bracket_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 4),
  to_match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bracket_from ON bracket_edges (from_match_id);
CREATE INDEX IF NOT EXISTS idx_bracket_to ON bracket_edges (to_match_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bracket_edge ON bracket_edges (from_match_id, rank, to_match_id);

-- ── Matches: scheduling + phase FK ──
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS venue VARCHAR(200);

-- phase_id exists as plain UUID from 006; add FK constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_phase_id_tournament_phases_id_fk'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_phase_id_tournament_phases_id_fk
      FOREIGN KEY (phase_id) REFERENCES tournament_phases(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_scheduled_at ON matches (scheduled_at);

COMMIT;
