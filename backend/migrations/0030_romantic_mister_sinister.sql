-- Teams are removed: the two team_id columns, their partial indices and the
-- one-identity constraints go, and the user identity becomes required.
--
-- NOTE the season_* index names: 0018 renamed the TABLE season_standings →
-- tournament_standings, and Postgres keeps an index's name through a table
-- rename. THIS migration's new CREATE below is what finally gives them the
-- tournament_* names the schema declares.
ALTER TABLE "match_stats" DROP CONSTRAINT "match_stats_one_identity_check";--> statement-breakpoint
ALTER TABLE "match_stats" DROP CONSTRAINT "match_stats_question_grain_check";--> statement-breakpoint
ALTER TABLE "tournament_standings" DROP CONSTRAINT "tournament_standings_one_identity_check";--> statement-breakpoint
DROP INDEX "match_stats_team_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "season_standings_team_unique";--> statement-breakpoint
DROP INDEX "match_stats_member_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "season_standings_user_unique";--> statement-breakpoint
ALTER TABLE "match_stats" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_standings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_stats_member_unique" ON "match_stats" USING btree ("match_id","round_id","question_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_standings_user_unique" ON "tournament_standings" USING btree ("tournament_id","user_id");--> statement-breakpoint
ALTER TABLE "match_stats" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "tournament_standings" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_question_grain_check" CHECK (question_id IS NOT NULL);