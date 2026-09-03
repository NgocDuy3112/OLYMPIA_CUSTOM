-- Rollback: restore old role enum

BEGIN;

-- Update users back to old roles
UPDATE users SET role = 'player' WHERE role = 'member';
UPDATE users SET role = 'guest' WHERE role = 'spectator';

-- Create old enum type
CREATE TYPE roleenum_old AS ENUM ('guest', 'player', 'mc', 'admin');

-- Alter the column
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE roleenum_old USING role::text::roleenum_old;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'player';

-- Drop current enum
DROP TYPE roleenum;

-- Rename
ALTER TYPE roleenum_old RENAME TO roleenum;

COMMIT;
