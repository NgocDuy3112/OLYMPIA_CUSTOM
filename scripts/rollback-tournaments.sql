-- ============================================================
-- Rollback: Remove Tournaments tables
-- Dùng nếu cần quay lại trạng thái trước khi thêm tournaments
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS tournament_players;
DROP TABLE IF EXISTS tournaments;

COMMIT;
