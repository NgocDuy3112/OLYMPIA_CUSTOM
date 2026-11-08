ALTER TABLE "question_import_batches" DROP CONSTRAINT "question_import_batches_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "question_import_batches" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question_import_batches" ADD CONSTRAINT "question_import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;