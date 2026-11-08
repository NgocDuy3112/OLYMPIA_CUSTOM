ALTER TABLE "question_bank" DROP CONSTRAINT "question_bank_hint_needs_keyword";--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
UPDATE "question_bank" SET "kind" = 'CHOICE' WHERE "kind" = 'MC';--> statement-breakpoint
DROP TYPE "public"."question_kind";--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('CHOICE', 'TEXT', 'KEYWORD', 'HINT');--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "kind" SET DATA TYPE "public"."question_kind" USING "kind"::"public"."question_kind";--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_hint_needs_keyword" CHECK ("kind" <> 'HINT' OR "keyword_id" IS NOT NULL);
