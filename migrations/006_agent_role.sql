-- 006 agent role (machine identities: bots, AI agents).
-- Apply: psql $DATABASE_URL -f migrations/006_agent_role.sql
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on old
-- versions; psql autocommit fine. IF NOT EXISTS needs PG 9.1+ (guarded
-- via DO block for idempotent re-runs).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'roleenum' AND e.enumlabel = 'agent'
  ) THEN
    ALTER TYPE "public"."roleenum" ADD VALUE 'agent';
  END IF;
END
$$;
