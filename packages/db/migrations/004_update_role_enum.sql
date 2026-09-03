-- ============================================================
-- Update role enum: guest → spectator, player/mc → member
-- ============================================================
-- Global roles are now: admin, member, spectator
-- Per-tournament roles (controller, mc, player) are in tournament_players table.
--
-- Usage:
--   psql -U <user> -d <database> -f packages/db/migrations/004_update_role_enum.sql
--
-- Rollback:
--   psql -U <user> -d <database> -f packages/db/migrations/004_update_role_enum_rollback.sql
-- ============================================================

BEGIN;

-- Update existing users:
-- "guest" → "spectator"
-- "player" → "member"
-- "mc" → "member"
UPDATE users SET role = 'spectator' WHERE role = 'guest';
UPDATE users SET role = 'member' WHERE role = 'player';
UPDATE users SET role = 'member' WHERE role = 'mc';

-- Update the enum type
-- First, create new enum type
CREATE TYPE roleenum_new AS ENUM ('admin', 'member', 'spectator');

-- Alter the column to use new type
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE roleenum_new USING role::text::roleenum_new;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';

-- Drop old enum type
DROP TYPE roleenum;

-- Rename new enum to old name
ALTER TYPE roleenum_new RENAME TO roleenum;

COMMIT;

-- ============================================================
-- Verification:
-- SELECT DISTINCT role FROM users;
-- Should show: admin, member, spectator
-- ============================================================
