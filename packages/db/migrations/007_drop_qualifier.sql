-- ============================================================
-- 007 drop dead qualifier tables (unused by API/web/engine)
-- ============================================================
-- qualifier_records / qualifier_advancements exist in baseline
-- but no API route, repo, engine, or web page reads/writes them.
-- Qualifier flow now uses questions/answers/records like other rounds.
--
-- Usage (after 006_bank.sql):
--   psql -U <user> -d <database> -f packages/db/migrations/007_drop_qualifier.sql
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS qualifier_advancements;
DROP TABLE IF EXISTS qualifier_records;

COMMIT;
