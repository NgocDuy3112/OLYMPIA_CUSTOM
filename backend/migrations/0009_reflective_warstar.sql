CREATE TABLE "match_draws" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "season_id" UUID NOT NULL,
    "stage_id" text NOT NULL,
    "seed" text NOT NULL,
    "groups" jsonb NOT NULL,
    "questions" jsonb NOT NULL,
    "drawn_by" UUID NOT NULL,
    "drawn_at" TIMESTAMP
    WITH
        TIME zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "slot" integer;
--> statement-breakpoint
ALTER TABLE "season_phase_results"
ADD COLUMN "round" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "season_phase_results"
DROP CONSTRAINT "season_phase_results_season_id_phase_id_user_id_pk";
--> statement-breakpoint
ALTER TABLE "season_phase_results"
ADD CONSTRAINT "season_phase_results_season_id_phase_id_user_id_round_pk" PRIMARY KEY (
    "season_id",
    "phase_id",
    "user_id",
    "round"
);
--> statement-breakpoint
ALTER TABLE "match_draws" ADD CONSTRAINT "match_draws_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_draws" ADD CONSTRAINT "match_draws_drawn_by_users_id_fk" FOREIGN KEY ("drawn_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "match_draws_stage_unique" ON "match_draws" USING btree ("season_id", "stage_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "matches_stage_slot_unique" ON "matches" USING btree (
    "season_id",
    "stage_id",
    "slot"
)
WHERE
    deleted_at IS NULL
    AND slot IS NOT NULL;