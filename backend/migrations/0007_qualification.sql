CREATE TABLE "season_phase_answers" (
	"season_id" uuid NOT NULL,
	"phase_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"verdict" "verdict",
	"auto_matched" boolean DEFAULT false NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_phase_answers_season_id_phase_id_question_id_user_id_pk" PRIMARY KEY("season_id","phase_id","question_id","user_id"),
	CONSTRAINT "season_phase_answers_object_check" CHECK (jsonb_typeof(value) = 'object' AND value <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "season_phase_results" (
	"season_id" uuid NOT NULL,
	"phase_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_phase_results_season_id_phase_id_user_id_pk" PRIMARY KEY("season_id","phase_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "progression" jsonb;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "qualification_questions" jsonb;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "default_progression" jsonb;--> statement-breakpoint
ALTER TABLE "season_phase_answers" ADD CONSTRAINT "season_phase_answers_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_phase_answers" ADD CONSTRAINT "season_phase_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_phase_results" ADD CONSTRAINT "season_phase_results_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_phase_results" ADD CONSTRAINT "season_phase_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_phase_answers_phase_user_idx" ON "season_phase_answers" USING btree ("season_id","phase_id","user_id");--> statement-breakpoint
CREATE INDEX "season_phase_results_rank_idx" ON "season_phase_results" USING btree ("season_id","phase_id","rank");