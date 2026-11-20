ALTER TABLE "question_bank" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "question_bank" SET "status" = 'DRAFT' WHERE "status" = 'PENDING';--> statement-breakpoint
DROP TYPE "public"."question_status";--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "status" SET DATA TYPE "public"."question_status" USING "status"::"public"."question_status";--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
