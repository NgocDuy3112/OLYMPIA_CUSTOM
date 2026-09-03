-- ============================================================
-- Add role column to tournament_players table
-- ============================================================
-- Per-tournament roles: controller, mc, player, spectator
-- Default 'player' for backward compatibility.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/003_add_tournament_player_role.sql
--
-- Rollback:
--   psql -U <user> -d <database> -f packages/db/migrations/003_add_tournament_player_role_rollback.sql
-- ============================================================

BEGIN;

-- Add role column with default 'player'
ALTER TABLE tournament_players
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'player';

-- Valid roles constraint
ALTER TABLE tournament_players
  ADD CONSTRAINT check_valid_tournament_role
  CHECK (role IN ('controller', 'mc', 'player', 'spectator'));

COMMIT;

-- ============================================================
-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'tournament_players' AND column_name = 'role';
-- ============================================================
