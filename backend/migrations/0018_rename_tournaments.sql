-- The season is the unit, and the unit is a tournament: the tables take the name the
-- staff already use.
ALTER TABLE "seasons" RENAME TO "tournaments";--> statement-breakpoint
ALTER TABLE "season_players" RENAME TO "tournament_players";--> statement-breakpoint
ALTER TABLE "season_standings" RENAME TO "tournament_standings";--> statement-breakpoint
ALTER INDEX "seasons_slug_unique" RENAME TO "tournaments_slug_unique";--> statement-breakpoint
ALTER INDEX "seasons_current_unique" RENAME TO "tournaments_current_unique";--> statement-breakpoint
ALTER TABLE "matches" RENAME COLUMN "season_id" TO "tournament_id";--> statement-breakpoint
ALTER TABLE "match_results" RENAME COLUMN "season_id" TO "tournament_id";--> statement-breakpoint
ALTER TABLE "match_stats" RENAME COLUMN "season_id" TO "tournament_id";--> statement-breakpoint
ALTER TABLE "tournament_players" RENAME COLUMN "season_id" TO "tournament_id";--> statement-breakpoint
ALTER TABLE "tournament_standings" RENAME COLUMN "season_id" TO "tournament_id";--> statement-breakpoint
ALTER TABLE "matches" RENAME CONSTRAINT "matches_season_id_seasons_id_fk" TO "matches_tournament_id_tournaments_id_fk";--> statement-breakpoint
ALTER TABLE "tournament_players" RENAME CONSTRAINT "season_players_season_id_seasons_id_fk" TO "tournament_players_tournament_id_tournaments_id_fk";--> statement-breakpoint
ALTER TABLE "tournament_players" RENAME CONSTRAINT "season_players_user_id_users_id_fk" TO "tournament_players_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tournament_standings" RENAME CONSTRAINT "season_standings_season_id_seasons_id_fk" TO "tournament_standings_tournament_id_tournaments_id_fk";--> statement-breakpoint
ALTER TABLE "tournament_standings" RENAME CONSTRAINT "season_standings_user_id_users_id_fk" TO "tournament_standings_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tournament_standings" RENAME CONSTRAINT "season_standings_one_identity_check" TO "tournament_standings_one_identity_check";--> statement-breakpoint
-- The demo follows the rename.
UPDATE "tournaments" SET "name" = 'Demo Tournament 2026', "slug" = 'demo-tournament-2026'
WHERE "slug" = 'demo-season-2026';--> statement-breakpoint
