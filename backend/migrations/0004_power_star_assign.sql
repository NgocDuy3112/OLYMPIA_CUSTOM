-- HOPE becomes STAR and SHIELD is retired, so the enum is rebuilt around the two
-- powers the show has: STAR (a multiplier on your own answer, any phase) and
-- ASSIGN (a duel for the question, Riêng only). Rows are mapped while the column
-- is TEXT — before the cast — or the cast fails on any row that still says
-- HOPE or SHIELD.
ALTER TABLE "match_stats" ALTER COLUMN "power" SET DATA TYPE text;--> statement-breakpoint
UPDATE "match_stats" SET "power" = 'STAR' WHERE "power" = 'HOPE';--> statement-breakpoint
-- SHIELD has no successor: its rows keep the points they scored, but lose a
-- label that would now mean something else.
UPDATE "match_stats" SET "power" = NULL WHERE "power" = 'SHIELD';--> statement-breakpoint
UPDATE "match_events" SET "payload" = jsonb_set("payload", '{power}', '"STAR"')
 WHERE "kind" = 'POWER' AND "payload"->>'power' = 'HOPE';--> statement-breakpoint
-- An old SHIELD event is marked retired rather than relabelled as a power it
-- never was — the unique key on POWER events IS the power's name.
UPDATE "match_events" SET "payload" = ("payload" - 'power') || '{"retired":"SHIELD"}'::jsonb
 WHERE "kind" = 'POWER' AND "payload"->>'power' = 'SHIELD';--> statement-breakpoint
DROP TYPE "public"."power";--> statement-breakpoint
CREATE TYPE "public"."power" AS ENUM('STAR', 'ASSIGN');--> statement-breakpoint
ALTER TABLE "match_stats" ALTER COLUMN "power" SET DATA TYPE "public"."power" USING "power"::"public"."power";
