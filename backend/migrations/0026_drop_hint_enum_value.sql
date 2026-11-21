ALTER TABLE "question_bank" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."question_kind";--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('CHOICE', 'TEXT', 'KEYWORD');--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "kind" SET DATA TYPE "public"."question_kind" USING "kind"::"public"."question_kind";
