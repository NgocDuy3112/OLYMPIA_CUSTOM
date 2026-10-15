CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OPERATOR', 'PLAYER');--> statement-breakpoint
CREATE TYPE "public"."match_event_kind" AS ENUM('PICK', 'BUZZ', 'POWER');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('UPCOMING', 'LIVE', 'FINISHED');--> statement-breakpoint
CREATE TYPE "public"."power" AS ENUM('HOPE', 'SHIELD');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('CORRECT', 'INCORRECT');--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('MC', 'TEXT', 'KEYWORD');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('DRAFT', 'PENDING', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"target_id" uuid,
	"action" varchar(100) NOT NULL,
	"match_id" uuid,
	"details" jsonb,
	"ip" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{READ}' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ip" varchar(45),
	"last_user_agent" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"sub" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"username" varchar(50),
	"email" varchar(255),
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"discord_id" varchar(30),
	"password_hash" text,
	"totp_secret" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_used_step" integer,
	"token_version" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_identity_check" CHECK ((role = 'PLAYER' AND email IS NOT NULL) OR (role IN ('ADMIN', 'OPERATOR') AND username IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"drafts" jsonb,
	"first_answered_ms" integer,
	"answered_ms" integer,
	"auto_matched" boolean DEFAULT false NOT NULL,
	"judged" boolean DEFAULT false NOT NULL,
	"verdict" "verdict",
	"points_awarded" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_value_object_check" CHECK (jsonb_typeof(value) = 'object' AND value <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"round_id" text,
	"kind" "match_event_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_events_payload_kind_check" CHECK (payload->>'kind' = kind::text),
	CONSTRAINT "match_events_power_round_check" CHECK (kind <> 'POWER' OR round_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"results" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_stats" (
	"match_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"round_id" text NOT NULL,
	"question_id" uuid,
	"user_id" uuid,
	"team_id" uuid,
	"tag" varchar(64),
	"base_points" integer,
	"answered" boolean,
	"correct" boolean,
	"verdict" "verdict",
	"points_awarded" integer,
	"first_answered_ms" integer,
	"answered_ms" integer,
	"pick_order" integer,
	"buzz_ms" integer,
	"buzz_won" boolean,
	"power" "power",
	CONSTRAINT "match_stats_one_identity_check" CHECK ((user_id IS NULL) <> (team_id IS NULL)),
	CONSTRAINT "match_stats_question_grain_check" CHECK ((team_id IS NULL) = (question_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"stage_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"status" "match_status" DEFAULT 'UPCOMING' NOT NULL,
	"players" jsonb NOT NULL,
	"round_configs" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"live" jsonb,
	"discord" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_live_phase_check" CHECK (live IS NULL OR jsonb_typeof(live->'phase') = 'string')
);
--> statement-breakpoint
CREATE TABLE "season_standings" (
	"season_id" uuid NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"total_score" integer NOT NULL,
	"rank" integer NOT NULL,
	"placement_points" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_standings_one_identity_check" CHECK ((user_id IS NULL) <> (team_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "question_kind" NOT NULL,
	"question_text" text NOT NULL,
	"tag" varchar(64) NOT NULL,
	"media" jsonb,
	"payload" jsonb NOT NULL,
	"time_limit" integer,
	"status" "question_status" DEFAULT 'DRAFT' NOT NULL,
	"tournament_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_players" (
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_players_season_id_user_id_pk" PRIMARY KEY("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"current" boolean DEFAULT false NOT NULL,
	"rounds" jsonb NOT NULL,
	"format" jsonb NOT NULL,
	"placement_tiers" jsonb NOT NULL,
	"stages" jsonb NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(100) NOT NULL,
	"visibility" "visibility" DEFAULT 'PUBLIC' NOT NULL,
	"owner_id" uuid NOT NULL,
	"default_tags" text[] NOT NULL,
	"default_rounds" jsonb NOT NULL,
	"default_format" jsonb NOT NULL,
	"default_placement_tiers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_keys" ADD CONSTRAINT "mcp_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_standings" ADD CONSTRAINT "season_standings_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_standings" ADD CONSTRAINT "season_standings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_players" ADD CONSTRAINT "season_players_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_players" ADD CONSTRAINT "season_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_events_match_idx" ON "audit_events" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_keys_key_hash_unique" ON "mcp_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "mcp_keys_user_idx" ON "mcp_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_provider_sub_unique" ON "oauth_accounts" USING btree ("provider","sub");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_discord_id_unique" ON "users" USING btree ("discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_upsert_unique" ON "answers" USING btree ("match_id","question_id","user_id");--> statement-breakpoint
CREATE INDEX "answers_match_idx" ON "answers" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_pick_unique" ON "match_events" USING btree ("match_id","question_id") WHERE kind = 'PICK';--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_buzz_unique" ON "match_events" USING btree ("match_id","question_id","user_id") WHERE kind = 'BUZZ';--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_power_unique" ON "match_events" USING btree ("match_id","round_id","user_id") WHERE kind = 'POWER';--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_stats_member_unique" ON "match_stats" USING btree ("match_id","round_id","question_id","user_id") WHERE team_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_stats_team_unique" ON "match_stats" USING btree ("match_id","round_id","team_id") WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX "match_stats_season_round_idx" ON "match_stats" USING btree ("season_id","round_id");--> statement-breakpoint
CREATE INDEX "matches_season_status_idx" ON "matches" USING btree ("season_id","status");--> statement-breakpoint
CREATE INDEX "matches_players_gin" ON "matches" USING gin ("players");--> statement-breakpoint
CREATE UNIQUE INDEX "season_standings_user_unique" ON "season_standings" USING btree ("season_id","user_id") WHERE team_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "season_standings_team_unique" ON "season_standings" USING btree ("season_id","team_id") WHERE user_id IS NULL;--> statement-breakpoint
CREATE INDEX "question_bank_status_idx" ON "question_bank" USING btree ("status");--> statement-breakpoint
CREATE INDEX "question_bank_tag_idx" ON "question_bank" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_current_unique" ON "seasons" USING btree ("tournament_id") WHERE current = true;--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_slug_unique" ON "tournaments" USING btree ("slug");