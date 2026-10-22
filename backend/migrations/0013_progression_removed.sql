DROP TABLE "match_draws" CASCADE;--> statement-breakpoint
DROP TABLE "season_phase_answers" CASCADE;--> statement-breakpoint
DROP TABLE "season_phase_clocks" CASCADE;--> statement-breakpoint
DROP TABLE "season_phase_results" CASCADE;--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "progression";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "qualification_questions";--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN "default_progression";