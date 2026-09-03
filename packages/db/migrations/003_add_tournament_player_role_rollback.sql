-- Rollback: remove role from tournament_players

BEGIN;

ALTER TABLE tournament_players DROP CONSTRAINT IF EXISTS check_valid_tournament_role;
ALTER TABLE tournament_players DROP COLUMN IF EXISTS role;

COMMIT;
