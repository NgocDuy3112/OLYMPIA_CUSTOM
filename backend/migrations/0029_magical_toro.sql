CREATE TYPE "public"."player_group" AS ENUM('A', 'B');--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "group" "player_group";