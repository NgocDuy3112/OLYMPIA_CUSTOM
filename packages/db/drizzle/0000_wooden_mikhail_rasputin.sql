CREATE TYPE "public"."auditactiontype" AS ENUM('LOGIN', 'LOGOUT', 'SCORE_CHANGE', 'MATCH_STATE_CHANGE', 'PLAYER_JOIN', 'PLAYER_LEAVE', 'QUESTION_USED', 'MATCH_CREATED', 'MATCH_DELETED');--> statement-breakpoint
CREATE TYPE "public"."matchstatusenum" AS ENUM('setup', 'active', 'in_progress', 'paused', 'completed', 'finished');--> statement-breakpoint
CREATE TYPE "public"."roleenum" AS ENUM('admin', 'member', 'spectator');--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" "auditactiontype" NOT NULL,
	"actor_code" varchar(50),
	"match_code" varchar(50),
	"target_code" varchar(50),
	"details" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_code" varchar(50) NOT NULL,
	"checkpoint" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_player_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "uq_match_position" UNIQUE("match_id","position"),
	CONSTRAINT "uq_match_player" UNIQUE("match_id","player_id"),
	CONSTRAINT "check_valid_position" CHECK ("match_player_positions"."position" >= 1 AND "match_player_positions"."position" <= 4)
);
--> statement-breakpoint
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
	"team_1_id" uuid,
	"team_2_id" uuid,
	"tournament_id" uuid,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "matches_match_slug_unique" UNIQUE("match_slug"),
	CONSTRAINT "matches_match_code_unique" UNIQUE("match_code"),
	CONSTRAINT "matches_match_name_unique" UNIQUE("match_name")
);
--> statement-breakpoint
CREATE TABLE "qualifier_advancements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qualifier_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"points" integer NOT NULL,
	"response_time" double precision,
	"is_correct" boolean DEFAULT false NOT NULL,
	"round_number" integer DEFAULT 1 NOT NULL,
	"chosen_option" varchar(1),
	"is_deleted" boolean DEFAULT false,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_code" varchar(25) NOT NULL,
	"content" varchar NOT NULL,
	"answer" varchar NOT NULL,
	"media_url" varchar,
	"explanation" varchar,
	"options" varchar,
	"is_used" boolean DEFAULT false,
	"is_deleted" boolean DEFAULT false,
	"match_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_team_player" UNIQUE("team_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'player' NOT NULL,
	"group_number" varchar(20),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_tournament_player" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"team_name" varchar(100) NOT NULL,
	"team_code" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_team_code_tournament" UNIQUE("tournament_id","team_code")
);
--> statement-breakpoint
CREATE TABLE "tournament_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_name" varchar(100) NOT NULL,
	"template_type" varchar(50) NOT NULL,
	"description" varchar(500),
	"config" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
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
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tournaments_tournament_code_unique" UNIQUE("tournament_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_slug" varchar(50) NOT NULL,
	"google_id" varchar(255),
	"email" varchar(255) NOT NULL,
	"user_code" varchar(50) NOT NULL,
	"user_name" varchar(100) NOT NULL,
	"avatar_url" varchar(500),
	"role" "roleenum" DEFAULT 'member' NOT NULL,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_user_slug_unique" UNIQUE("user_slug"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_user_code_unique" UNIQUE("user_code"),
	CONSTRAINT "check_user_code_starts_with_OC_U" CHECK (position('OC_U' in "users"."user_code") = 1)
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_positions" ADD CONSTRAINT "match_player_positions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_positions" ADD CONSTRAINT "match_player_positions_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_1_id_tournament_teams_id_fk" FOREIGN KEY ("team_1_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_2_id_tournament_teams_id_fk" FOREIGN KEY ("team_2_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifier_advancements" ADD CONSTRAINT "qualifier_advancements_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifier_advancements" ADD CONSTRAINT "qualifier_advancements_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifier_records" ADD CONSTRAINT "qualifier_records_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifier_records" ADD CONSTRAINT "qualifier_records_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifier_records" ADD CONSTRAINT "qualifier_records_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_templates" ADD CONSTRAINT "tournament_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_answers_player_id" ON "answers" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_answers_match_id" ON "answers" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_answers_question_id" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action_type" ON "audit_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_audit_actor_code" ON "audit_logs" USING btree ("actor_code");--> statement-breakpoint
CREATE INDEX "idx_audit_match_code" ON "audit_logs" USING btree ("match_code");--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_checkpoint_match_time" ON "match_checkpoints" USING btree ("match_code","created_at");--> statement-breakpoint
CREATE INDEX "idx_matches_created_by" ON "matches" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_matches_tournament_id" ON "matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_matches_phase_id" ON "matches" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "idx_qa_player_id" ON "qualifier_advancements" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_qa_match_id" ON "qualifier_advancements" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_qr_player_id" ON "qualifier_records" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_qr_match_id" ON "qualifier_records" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_qr_question_id" ON "qualifier_records" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_questions_match_id" ON "questions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_records_player_id" ON "records" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_records_match_id" ON "records" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_records_question_id" ON "records" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_team_members_team" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_team_members_player" ON "team_members" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_players_tournament" ON "tournament_players" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_players_player" ON "tournament_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_teams_tournament" ON "tournament_teams" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_templates_type" ON "tournament_templates" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "idx_templates_system" ON "tournament_templates" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "idx_tournaments_created_by" ON "tournaments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_tournaments_status" ON "tournaments" USING btree ("status");