ALTER TABLE "season_phase_answers" ADD COLUMN "answered_ms" integer;--> statement-breakpoint
ALTER TABLE "season_phase_results" ADD COLUMN "correct_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_phase_results" ADD COLUMN "avg_time_ms" integer;