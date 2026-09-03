BEGIN;

-- ── Tournament Templates ──
CREATE TABLE IF NOT EXISTS tournament_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(100) NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  description VARCHAR(500),
  config JSONB NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_type ON tournament_templates (template_type);
CREATE INDEX IF NOT EXISTS idx_templates_system ON tournament_templates (is_system);

-- ── Tournament Teams ──
CREATE TABLE IF NOT EXISTS tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_name VARCHAR(100) NOT NULL,
  team_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_tournament ON tournament_teams (tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_code_tournament ON tournament_teams (tournament_id, team_code);

-- ── Team Members ──
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_player ON team_members (player_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_player ON team_members (team_id, player_id);

-- ── Update Matches table ──
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS match_format VARCHAR(20) NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS match_label VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phase_id UUID,
  ADD COLUMN IF NOT EXISTS team_1_id UUID REFERENCES tournament_teams(id),
  ADD COLUMN IF NOT EXISTS team_2_id UUID REFERENCES tournament_teams(id);

CREATE INDEX IF NOT EXISTS idx_matches_phase_id ON matches (phase_id);

-- ── Seed Templates ──

-- OC3 Classic
INSERT INTO tournament_templates (template_name, template_type, description, config, is_system)
VALUES (
  'OC3 Classic',
  'oc3',
  'Format clásico: 2 rounds individual + Leaderboard',
  '{
    "type": "individual",
    "playersPerMatch": 4,
    "phases": [
      { "name": "Group Stage", "type": "group_stage", "rounds": 2 }
    ],
    "hasLeaderboard": true,
    "tiers": ["S", "A", "B", "C"]
  }'::jsonb,
  true
);

-- OC4 Full
INSERT INTO tournament_templates (template_name, template_type, description, config, is_system)
VALUES (
  'OC4 Full',
  'oc4',
  'Group Stage + Playoffs + Grand Finale',
  '{
    "type": "individual",
    "playersPerMatch": 4,
    "phases": [
      { "name": "Group Stage", "type": "group_stage", "rounds": 2, "tiers": ["S", "A", "B", "C"] },
      { "name": "Playoffs Phase 1", "type": "playoffs", "matches": 4, "playerSource": "tiers" },
      { "name": "Playoffs Phase 2", "type": "playoffs", "matches": 3, "playerSource": "previous_phase" },
      { "name": "Playoffs Phase 3", "type": "playoffs", "matches": 2, "playerSource": "previous_phase" },
      { "name": "Playoffs Phase 4", "type": "playoffs", "matches": 1, "playerSource": "previous_phase" },
      { "name": "Grand Finale", "type": "finale", "matches": 1 }
    ],
    "hasLeaderboard": true,
    "advancementRules": [
      { "from": "M09", "rank": 1, "to": "M19" },
      { "from": "M09", "rank": 2, "to": "M13" },
      { "from": "M09", "rank": 3, "to": "M13" },
      { "from": "M09", "rank": 4, "to": "M13" },
      { "from": "M10", "rank": 1, "to": "M13" },
      { "from": "M10", "rank": 2, "to": "M14" },
      { "from": "M10", "rank": 3, "to": "M14" },
      { "from": "M10", "rank": 4, "to": "M14" },
      { "from": "M11", "rank": 1, "to": "M14" },
      { "from": "M11", "rank": 2, "to": "M15" },
      { "from": "M11", "rank": 3, "to": "M15" },
      { "from": "M11", "rank": 4, "to": "M15" },
      { "from": "M12", "rank": 1, "to": "M15" }
    ]
  }'::jsonb,
  true
);

-- OC HCMC 2v2
INSERT INTO tournament_templates (template_name, template_type, description, config, is_system)
VALUES (
  'OC HCMC 2v2',
  'ochcmc',
  'Team vs Team - 2 người mỗi team',
  '{
    "type": "team",
    "playersPerTeam": 2,
    "teamsPerMatch": 2,
    "phases": [
      { "name": "Group Stage", "type": "group_stage", "rounds": 2 },
      { "name": "Semi Finals", "type": "playoffs", "matches": 2 },
      { "name": "Grand Finale", "type": "finale", "matches": 1 }
    ],
    "hasLeaderboard": true
  }'::jsonb,
  true
);

COMMIT;
