DROP INDEX "match_stats_season_round_idx";--> statement-breakpoint
DROP INDEX "matches_season_status_idx";--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "current_position" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "match_stats_tournament_round_idx" ON "match_stats" USING btree ("tournament_id","round_id");--> statement-breakpoint
CREATE INDEX "matches_tournament_status_idx" ON "matches" USING btree ("tournament_id","status");