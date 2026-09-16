-- ============================================================
-- Drop team-based tournament support (individual-only)
-- ============================================================
-- Removes tournament_teams, team_members, and matches.team_1_id / team_2_id.
-- Run AFTER deploying code without team references.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/007_drop_teams.sql
-- ============================================================

BEGIN;

-- Drop FK columns on matches first
ALTER TABLE matches DROP COLUMN IF EXISTS team_1_id;
ALTER TABLE matches DROP COLUMN IF EXISTS team_2_id;

-- Drop team tables (cascade removes members)
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS tournament_teams;

COMMIT;
