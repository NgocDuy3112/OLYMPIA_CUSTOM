ALTER TABLE "tournaments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "tournaments" CASCADE;--> statement-breakpoint
-- The CASCADE above already dropped the constraints that pointed at the tournament.
DROP INDEX "question_bank_tournament_status_idx";--> statement-breakpoint
CREATE INDEX "question_bank_tag_status_idx" ON "question_bank" USING btree ("tag","status");--> statement-breakpoint
ALTER TABLE "question_bank" DROP COLUMN "tournament_id";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tournament_id";