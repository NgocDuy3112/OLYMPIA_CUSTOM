-- The PIN door is gone: players register their own accounts and log in, so a
-- match no longer carries a code that mints a session for whoever types it.
-- Existing codes are dead data — drop the column and its unique index with it.
ALTER TABLE "matches" DROP COLUMN "join_code";
