-- ============================================================
-- Add Discord identity for auto role assignment (players only)
-- ============================================================
-- - tournament_players: + discord_user_id, + discord_nickname
-- - tournaments: + discord_guild_id, + discord_role_map (JSON text)
--
-- Discord identity lives on tournament_players, NOT users:
-- only in-tournament players need it for AI mention + auto role.
--
-- discord_role_map example:
--   {"player": "<role_id>", "mc": "<role_id>", "controller": "<role_id>"}
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/009_add_discord_identity.sql
-- ============================================================

BEGIN;

-- ── Tournament players: Discord identity ──
ALTER TABLE tournament_players
  ADD COLUMN IF NOT EXISTS discord_user_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS discord_nickname VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_tournament_players_discord
  ON tournament_players (tournament_id, discord_user_id);

-- ── Tournaments: guild + role map ──
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS discord_role_map TEXT;

CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments (discord_guild_id);

COMMIT;

-- ============================================================
-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('tournament_players', 'tournaments')
--   AND column_name IN ('discord_user_id', 'discord_nickname', 'discord_guild_id', 'discord_role_map');
-- ============================================================
