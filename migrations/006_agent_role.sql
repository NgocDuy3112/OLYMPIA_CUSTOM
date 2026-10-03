





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
