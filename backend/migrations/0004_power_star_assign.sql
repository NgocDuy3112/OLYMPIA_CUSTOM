ALTER TABLE "match_stats" ALTER COLUMN "power" SET DATA TYPE text;--> statement-breakpoint
UPDATE "match_stats" SET "power" = 'STAR' WHERE "power" = 'HOPE';--> statement-breakpoint
UPDATE "match_stats" SET "power" = NULL WHERE "power" = 'SHIELD';--> statement-breakpoint
UPDATE "match_events" SET "payload" = jsonb_set("payload", '{power}', '"STAR"')
 WHERE "kind" = 'POWER' AND "payload"->>'power' = 'HOPE';--> statement-breakpoint
UPDATE "match_events" SET "payload" = ("payload" - 'power') || '{"retired":"SHIELD"}'::jsonb
 WHERE "kind" = 'POWER' AND "payload"->>'power' = 'SHIELD';--> statement-breakpoint
DROP TYPE "public"."power";--> statement-breakpoint
CREATE TYPE "public"."power" AS ENUM('STAR', 'ASSIGN');--> statement-breakpoint
ALTER TABLE "match_stats" ALTER COLUMN "power" SET DATA TYPE "public"."power" USING "power"::"public"."power";
