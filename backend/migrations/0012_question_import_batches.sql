CREATE TABLE "question_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"source_name" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"sheet" text NOT NULL,
	"source_id" text NOT NULL,
	"cells" jsonb NOT NULL,
	"error" text,
	"warning" text,
	"dropped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "question_import_batches" ADD CONSTRAINT "question_import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_import_rows" ADD CONSTRAINT "question_import_rows_batch_id_question_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."question_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_import_batch_id_question_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."question_import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_import_rows_batch_pos" ON "question_import_rows" USING btree ("batch_id","position");
