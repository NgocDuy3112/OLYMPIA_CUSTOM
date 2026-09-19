-- ============================================================
-- 008 normalize operator scope question_creator -> qauthor
-- ============================================================
-- Canonical operator scope is now 'qauthor' (was 'question_creator').
-- Code accepts both, but normalize stored rows so admin UI shows one name.
--
-- Usage (after 007_drop_qualifier.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/008_qauthor_scope.sql
-- ============================================================

BEGIN;

-- Users operator_scopes: replace question_creator token with qauthor,
-- dedupe if row already holds both.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'operator_scopes') THEN
    UPDATE users
    SET operator_scopes = REGEXP_REPLACE(operator_scopes, 'question_creator', 'qauthor', 'g')
    WHERE operator_scopes LIKE '%question_creator%';
    -- Dedupe qauthor,qauthor -> qauthor (both orders)
    UPDATE users
    SET operator_scopes = REGEXP_REPLACE(operator_scopes, 'qauthor,qauthor', 'qauthor', 'g')
    WHERE operator_scopes LIKE '%qauthor,qauthor%';
    UPDATE users
    SET operator_scopes = REGEXP_REPLACE(operator_scopes, 'qauthor, qauthor', 'qauthor', 'g')
    WHERE operator_scopes LIKE '%qauthor, qauthor%';
  END IF;
END $$;

-- Tournament membership role: normalize legacy question_creator -> qauthor
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tournament_players') THEN
    UPDATE tournament_players SET role = 'qauthor' WHERE role = 'question_creator';
  END IF;
END $$;

COMMIT;
