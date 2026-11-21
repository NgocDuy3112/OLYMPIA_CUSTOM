ALTER TABLE "question_bank" DROP CONSTRAINT IF EXISTS "question_bank_import_batch_id_question_import_batches_id_fk";--> statement-breakpoint
DROP TABLE IF EXISTS "question_import_rows";--> statement-breakpoint
DROP TABLE IF EXISTS "question_import_batches";
