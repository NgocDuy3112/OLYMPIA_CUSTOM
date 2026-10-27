ALTER TABLE "matches" ADD COLUMN "join_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "matches_join_code_unique" ON "matches" USING btree ("join_code") WHERE join_code IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
-- Backfill: every live-standard match gets a door-in code (6 chars, unambiguous
-- alphabet, retried on the off chance of a collision). The mass event keeps none.
DO $$
DECLARE
    row record;
    code text;
BEGIN
    FOR row IN SELECT id FROM matches WHERE kind = 'STANDARD' AND join_code IS NULL AND deleted_at IS NULL LOOP
        LOOP
            code := upper(substr(md5(random()::text || row.id::text), 1, 6));
            CONTINUE WHEN EXISTS (SELECT 1 FROM matches WHERE join_code = code);
            EXIT;
        END LOOP;
        UPDATE matches SET join_code = code WHERE id = row.id;
    END LOOP;
END $$;
