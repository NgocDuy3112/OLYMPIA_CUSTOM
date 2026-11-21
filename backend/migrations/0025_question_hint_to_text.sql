UPDATE "question_bank" SET "kind" = 'TEXT' WHERE "kind" = 'HINT';--> statement-breakpoint
UPDATE "question_bank" SET "payload" = jsonb_set("payload", '{type}', '"TEXT"') WHERE "payload" ->> 'type' = 'HINT';--> statement-breakpoint
ALTER TABLE "question_bank" DROP CONSTRAINT "question_bank_hint_needs_keyword";
