-- ============================================================
-- New role model: admin / operator / player / spectator
-- + operator_scopes for staff capabilities
-- ============================================================
-- users.role: admin (full), operator (staff), player, spectator.
-- users.operator_scopes: comma list of question_creator,controller,mc.
--   Only meaningful when role = 'operator'.
-- Legacy values controller/member kept in enum for backward compat.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/012_role_operator_scopes.sql
-- ============================================================

BEGIN;

-- Add operator_scopes column
ALTER TABLE users ADD COLUMN IF NOT EXISTS operator_scopes VARCHAR(100);

-- Extend role enum with new values (keep old ones for compat)
ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'operator';
ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'player';
ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'question_author';

-- Migrate legacy defaults: member -> player
UPDATE users SET role = 'player' WHERE role = 'member';

-- Change column default to player
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'player';

COMMIT;

-- ============================================================
-- Verification:
-- SELECT column_name, column_default FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name IN ('role', 'operator_scopes');
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'roleenum'::regtype;
-- ============================================================
