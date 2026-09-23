-- ============================================================
-- 001 full schema (squashed, generated from Drizzle + adapted)
-- Drizzle source: packages/db/src/schema/*
-- Re-generate: pnpm --filter @oc/db exec drizzle-kit generate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "public"."auditactiontype" AS ENUM('LOGIN', 'LOGOUT', 'SCORE_CHANGE', 'MATCH_STATE_CHANGE', 'PLAYER_JOIN', 'PLAYER_LEAVE', 'QUESTION_USED', 'MATCH_CREATED', 'MATCH_DELETED');
CREATE TYPE "public"."matchstatusenum" AS ENUM('setup', 'active', 'in_progress', 'paused', 'completed', 'finished');
CREATE TYPE "public"."roleenum" AS ENUM('admin', 'operator', 'player', 'spectator', 'controller', 'member');
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_text" varchar,
	"has_buzzed" boolean DEFAULT false,
	"timestamp" numeric(16, 3),
	"is_deleted" boolean DEFAULT false,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE "match_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_code" varchar(50) NOT NULL,
	"checkpoint" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE "bracket_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_match_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"to_match_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_bracket_edge" UNIQUE("from_match_id","rank","to_match_id"),
	CONSTRAINT "check_bracket_rank" CHECK ("bracket_edges"."rank" >= 1 AND "bracket_edges"."rank" <= 4)
);
CREATE TABLE "match_player_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "uq_match_position" UNIQUE("match_id","position"),
	CONSTRAINT "uq_match_player" UNIQUE("match_id","player_id"),
	CONSTRAINT "check_valid_position" CHECK ("match_player_positions"."position" >= 1 AND "match_player_positions"."position" <= 4)
);
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_slug" varchar(50) NOT NULL,
	"match_pin" varchar(6) NOT NULL,
	"match_code" varchar(50) NOT NULL,
	"match_name" varchar(100) NOT NULL,
	"match_status" "matchstatusenum" DEFAULT 'setup' NOT NULL,
	"tournament_format" varchar(50) DEFAULT 'oc3' NOT NULL,
	"video_url" varchar(500),
	"match_format" varchar(20) DEFAULT 'individual' NOT NULL,
	"match_label" varchar(20),
	"phase_id" uuid,
	"scheduled_at" timestamp with time zone,
	"venue" varchar(200),
	"tournament_id" uuid,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "matches_match_slug_unique" UNIQUE("match_slug"),
	CONSTRAINT "matches_match_code_unique" UNIQUE("match_code"),
	CONSTRAINT "matches_match_name_unique" UNIQUE("match_name")
);
CREATE TABLE "qualifier_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qualifier_question_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"selected_option" varchar(1) NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"response_time_ms" integer DEFAULT 0 NOT NULL,
	"points" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_qualifier_attempt" UNIQUE("qualifier_question_id","player_id"),
	CONSTRAINT "check_qualifier_selected_option" CHECK ("qualifier_attempts"."selected_option" IN ('A','B','C','D','E','F'))
);
CREATE TABLE "qualifier_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"question_code" varchar(25) NOT NULL,
	"content" varchar NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" varchar(1) NOT NULL,
	"explanation" varchar,
	"media_url" varchar,
	"round_number" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_qualifier_question_code" UNIQUE("tournament_id","question_code"),
	CONSTRAINT "uq_qualifier_position" UNIQUE("tournament_id","position"),
	CONSTRAINT "check_qualifier_options_4_to_6" CHECK (jsonb_array_length("qualifier_questions"."options") BETWEEN 4 AND 6),
	CONSTRAINT "check_qualifier_correct_option" CHECK ("qualifier_questions"."correct_option" IN ('A','B','C','D','E','F')),
	CONSTRAINT "check_qualifier_status" CHECK ("qualifier_questions"."status" IN ('open','closed'))
);
CREATE TABLE "question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_code" varchar(25) NOT NULL,
	"content" varchar NOT NULL,
	"answer" varchar NOT NULL,
	"media_url" varchar,
	"explanation" varchar,
	"hint_text" varchar,
	"options" varchar,
	"round_hint" varchar(20),
	"domain" varchar(10),
	"difficulty" integer,
	"set_code" varchar(50),
	"hint_index" varchar(4),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "question_bank_bank_code_unique" UNIQUE("bank_code"),
	CONSTRAINT "check_bank_code_starts_with_QB" CHECK (position('QB_' in "question_bank"."bank_code") = 1),
	CONSTRAINT "check_bank_status" CHECK ("question_bank"."status" IN ('pending','approved','rejected')),
	CONSTRAINT "check_bank_domain" CHECK ("question_bank"."domain" IS NULL OR "question_bank"."domain" IN ('THTH','TNSS','XHPL','VHNT','TTGT','KTTH')),
	CONSTRAINT "check_bank_difficulty" CHECK ("question_bank"."difficulty" IS NULL OR "question_bank"."difficulty" IN (20,30,40,50)),
	CONSTRAINT "check_bank_hint_index" CHECK ("question_bank"."hint_index" IS NULL OR "question_bank"."hint_index" IN ('KEY','H1','H2','H3','H4','H5','H6','H7','H8'))
);
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_code" varchar(25) NOT NULL,
	"content" varchar NOT NULL,
	"answer" varchar NOT NULL,
	"media_url" varchar,
	"explanation" varchar,
	"hint_text" varchar,
	"options" varchar,
	"is_used" boolean DEFAULT false,
	"is_deleted" boolean DEFAULT false,
	"match_id" uuid NOT NULL,
	"source_bank_id" uuid,
	"slot" varchar(25),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"points" integer NOT NULL,
	"is_deleted" boolean DEFAULT false,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"round_number" integer,
	"question_code" varchar(25),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "check_points_multiple_of_5" CHECK ("records"."points" % 5 = 0)
);
CREATE TABLE "score_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"match_code" varchar(50) NOT NULL,
	"question_code" varchar(25) NOT NULL,
	"candidates" jsonb NOT NULL,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocee_suggestion" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_by" varchar(50),
	"decided_by" varchar(50),
	"discord_message_id" varchar(32),
	"discord_channel_id" varchar(32),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE "tournament_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"phase_number" integer NOT NULL,
	"phase_name" varchar(100) NOT NULL,
	"phase_type" varchar(20) DEFAULT 'group_stage' NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_phase_number" UNIQUE("tournament_id","phase_number")
);
CREATE TABLE "tournament_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'player' NOT NULL,
	"group_number" varchar(20),
	"discord_user_id" varchar(32),
	"discord_nickname" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_code" varchar(50) NOT NULL,
	"tournament_name" varchar(200) NOT NULL,
	"description" text,
	"tournament_format" varchar(50) DEFAULT 'oc3' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"max_players" varchar(10),
	"venue" varchar(200),
	"notes" text,
	"discord_guild_id" varchar(32),
	"discord_role_map" text,
	"discord_notify_channel_id" varchar(32),
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tournaments_tournament_code_unique" UNIQUE("tournament_code")
);
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_slug" varchar(50) NOT NULL,
	"google_id" varchar(255),
	"password_hash" varchar(255),
	"email" varchar(255) NOT NULL,
	"user_code" varchar(50) NOT NULL,
	"user_name" varchar(100) NOT NULL,
	"avatar_url" varchar(500),
	"role" "roleenum" DEFAULT 'player' NOT NULL,
	"operator_scopes" varchar(100),
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_user_slug_unique" UNIQUE("user_slug"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_user_code_unique" UNIQUE("user_code"),
	CONSTRAINT "check_user_code_starts_with_OC_U" CHECK (position('OC_U' in "users"."user_code") = 1)
);
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "answers" ADD CONSTRAINT "answers_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "match_checkpoints" ADD CONSTRAINT "fk_checkpoint_match_code" FOREIGN KEY ("match_code") REFERENCES "public"."matches"("match_code") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "bracket_edges" ADD CONSTRAINT "bracket_edges_from_match_id_matches_id_fk" FOREIGN KEY ("from_match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "bracket_edges" ADD CONSTRAINT "bracket_edges_to_match_id_matches_id_fk" FOREIGN KEY ("to_match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "match_player_positions" ADD CONSTRAINT "match_player_positions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "match_player_positions" ADD CONSTRAINT "match_player_positions_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "matches_phase_id_tournament_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."tournament_phases"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "qualifier_attempts" ADD CONSTRAINT "qualifier_attempts_qualifier_question_id_qualifier_questions_id_fk" FOREIGN KEY ("qualifier_question_id") REFERENCES "public"."qualifier_questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "qualifier_attempts" ADD CONSTRAINT "qualifier_attempts_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "qualifier_questions" ADD CONSTRAINT "qualifier_questions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "questions" ADD CONSTRAINT "questions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "records" ADD CONSTRAINT "records_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "records" ADD CONSTRAINT "records_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "records" ADD CONSTRAINT "records_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "score_reviews" ADD CONSTRAINT "score_reviews_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "score_reviews" ADD CONSTRAINT "score_reviews_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tournament_phases" ADD CONSTRAINT "tournament_phases_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "idx_answers_player_id" ON "answers" USING btree ("player_id");
CREATE INDEX "idx_answers_match_id" ON "answers" USING btree ("match_id");
CREATE INDEX "idx_answers_question_id" ON "answers" USING btree ("question_id");
CREATE INDEX "idx_checkpoint_match_time" ON "match_checkpoints" USING btree ("match_code","created_at");
CREATE INDEX "idx_bracket_from" ON "bracket_edges" USING btree ("from_match_id");
CREATE INDEX "idx_bracket_to" ON "bracket_edges" USING btree ("to_match_id");
CREATE INDEX "idx_matches_created_by" ON "matches" USING btree ("created_by");
CREATE INDEX "idx_matches_tournament_id" ON "matches" USING btree ("tournament_id");
CREATE INDEX "idx_matches_phase_id" ON "matches" USING btree ("phase_id");
CREATE INDEX "idx_matches_scheduled_at" ON "matches" USING btree ("scheduled_at");
CREATE INDEX "idx_qualifier_attempts_question" ON "qualifier_attempts" USING btree ("qualifier_question_id");
CREATE INDEX "idx_qualifier_attempts_player" ON "qualifier_attempts" USING btree ("player_id");
CREATE INDEX "idx_qualifier_questions_tournament" ON "qualifier_questions" USING btree ("tournament_id");
CREATE INDEX "idx_bank_code" ON "question_bank" USING btree ("bank_code");
CREATE INDEX "idx_bank_round_hint" ON "question_bank" USING btree ("round_hint");
CREATE INDEX "idx_bank_status" ON "question_bank" USING btree ("status");
CREATE INDEX "idx_bank_domain" ON "question_bank" USING btree ("domain","difficulty");
CREATE INDEX "idx_bank_set" ON "question_bank" USING btree ("set_code");
CREATE UNIQUE INDEX "uq_bank_set_hint" ON "question_bank" USING btree ("set_code","hint_index") WHERE "question_bank"."set_code" IS NOT NULL;
CREATE INDEX "idx_questions_match_id" ON "questions" USING btree ("match_id");
CREATE INDEX "idx_questions_source_bank" ON "questions" USING btree ("source_bank_id");
CREATE INDEX "idx_questions_used" ON "questions" USING btree ("match_id","is_used");
CREATE UNIQUE INDEX "uq_questions_match_slot" ON "questions" USING btree ("match_id","slot") WHERE "questions"."slot" IS NOT NULL;
CREATE INDEX "idx_records_player_id" ON "records" USING btree ("player_id");
CREATE INDEX "idx_records_match_id" ON "records" USING btree ("match_id");
CREATE INDEX "idx_records_question_id" ON "records" USING btree ("question_id");
CREATE INDEX "idx_score_reviews_match" ON "score_reviews" USING btree ("match_id","status");
CREATE INDEX "idx_score_reviews_question" ON "score_reviews" USING btree ("question_id","status");
CREATE INDEX "idx_phases_tournament" ON "tournament_phases" USING btree ("tournament_id");
CREATE INDEX "idx_tournament_players_tournament" ON "tournament_players" USING btree ("tournament_id");
CREATE INDEX "idx_tournament_players_player" ON "tournament_players" USING btree ("player_id");
CREATE INDEX "idx_tournament_players_discord" ON "tournament_players" USING btree ("tournament_id","discord_user_id");
CREATE INDEX "idx_tournaments_created_by" ON "tournaments" USING btree ("created_by");
CREATE INDEX "idx_tournaments_status" ON "tournaments" USING btree ("status");
CREATE INDEX "idx_tournaments_guild" ON "tournaments" USING btree ("discord_guild_id");