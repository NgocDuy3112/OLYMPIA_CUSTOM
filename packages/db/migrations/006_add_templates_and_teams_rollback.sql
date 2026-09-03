-- Rollback: remove templates, teams, and match format columns

BEGIN;

-- Remove match format columns
ALTER TABLE matches DROP COLUMN IF EXISTS match_format;
ALTER TABLE matches DROP COLUMN IF EXISTS match_label;
ALTER TABLE matches DROP COLUMN IF EXISTS phase_id;
ALTER TABLE matches DROP COLUMN IF EXISTS team_1_id;
ALTER TABLE matches DROP COLUMN IF EXISTS team_2_id;
DROP INDEX IF EXISTS idx_matches_phase_id;

-- Drop team tables
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS tournament_teams;

-- Drop templates
DROP TABLE IF EXISTS tournament_templates;

COMMIT;
