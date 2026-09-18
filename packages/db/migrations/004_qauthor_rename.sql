-- ============================================================
-- 004 rename tournament role question_author -> qauthor
-- ============================================================
-- Code now uses 'qauthor' (RoleManager, tournament API, ai-agent).
-- Legacy rows may still hold 'question_author' — normalize them.
-- Also renames discord_role_map JSON key if present.
--
-- Usage (after 003_score_reviews.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/004_qauthor_rename.sql
-- ============================================================

BEGIN;

-- Tournament membership role rename (guard if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tournament_players') THEN
    UPDATE tournament_players SET role = 'qauthor' WHERE role = 'question_author';
  END IF;
END $$;

-- Discord role map JSON key rename (text column holding JSON)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'discord_role_map') THEN
    UPDATE tournaments
    SET discord_role_map = REPLACE(discord_role_map, '"question_author"', '"qauthor"')
    WHERE discord_role_map LIKE '%question_author%';
  END IF;
END $$;

COMMIT;
