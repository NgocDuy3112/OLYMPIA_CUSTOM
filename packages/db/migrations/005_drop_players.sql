-- ============================================================
-- 005 drop legacy players table, keep tournament_players
-- ============================================================
-- Baseline 001 used to create `players` (no role column).
-- Code uses `tournament_players` (role + discord identity) everywhere:
-- discord, tournament, question, ws routes + drizzle schema.
-- This migration moves data (if any) then drops the legacy table.
--
-- Usage (after 004_qauthor_rename.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/005_drop_players.sql
-- ============================================================

BEGIN;

-- Move legacy rows into tournament_players (skip duplicates)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'players')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tournament_players') THEN
    INSERT INTO tournament_players (tournament_id, player_id, role, group_number, discord_user_id, discord_nickname, notes, created_at)
    SELECT p.tournament_id, p.player_id, 'player', p.group_number, p.discord_user_id, p.discord_nickname, p.notes, p.created_at
    FROM players p
    WHERE NOT EXISTS (
      SELECT 1 FROM tournament_players tp
      WHERE tp.tournament_id = p.tournament_id AND tp.player_id = p.player_id
    );
  END IF;
END $$;

DROP TABLE IF EXISTS players;

COMMIT;
