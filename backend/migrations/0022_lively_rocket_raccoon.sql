-- Remove the mass event and the tie-break record (feature removal).
-- Order matters: the enum swap's cast would reject 'QUALIFICATION' rows, and
-- answers/match_results/match_stats/match_events reference matches WITHOUT
-- cascade — children first, then the matches, then the type.
DROP TABLE "match_tie_breaks" CASCADE;--> statement-breakpoint
DELETE FROM "answers" WHERE "match_id" IN (SELECT "id" FROM "matches" WHERE "kind" = 'QUALIFICATION');--> statement-breakpoint
DELETE FROM "match_results" WHERE "match_id" IN (SELECT "id" FROM "matches" WHERE "kind" = 'QUALIFICATION');--> statement-breakpoint
DELETE FROM "match_stats" WHERE "match_id" IN (SELECT "id" FROM "matches" WHERE "kind" = 'QUALIFICATION');--> statement-breakpoint
DELETE FROM "match_events" WHERE "match_id" IN (SELECT "id" FROM "matches" WHERE "kind" = 'QUALIFICATION');--> statement-breakpoint
DELETE FROM "matches" WHERE "kind" = 'QUALIFICATION';--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "kind" SET DEFAULT 'STANDARD'::text;--> statement-breakpoint
DROP TYPE "public"."match_kind";--> statement-breakpoint
CREATE TYPE "public"."match_kind" AS ENUM('STANDARD');--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "kind" SET DEFAULT 'STANDARD'::"public"."match_kind";--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "kind" SET DATA TYPE "public"."match_kind" USING "kind"::"public"."match_kind";--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN "current_position";--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN "released_at";
