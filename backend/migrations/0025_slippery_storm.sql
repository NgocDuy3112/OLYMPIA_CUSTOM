DROP INDEX "question_bank_tag_idx";--> statement-breakpoint
DROP INDEX "question_bank_tag_status_idx";--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "keyword_id" uuid;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_keyword_id_question_bank_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."question_bank"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_bank_keyword_idx" ON "question_bank" USING btree ("keyword_id");--> statement-breakpoint
ALTER TABLE "question_bank" DROP COLUMN "tag";--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_hint_needs_keyword" CHECK (kind <> 'HINT' OR keyword_id IS NOT NULL);