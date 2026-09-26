-- ============================================================
-- 005 question sets (bộ đề): preset câu hỏi theo trận, pick từ bank.
-- 1 bộ thuộc đúng 1 matchCode. Pick là tham chiếu bankCode.
-- Apply: ./scripts/migrate.sh (tracked in schema_migrations)
-- Drizzle source: packages/db/src/schema/question-set.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS "question_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_code" varchar(30) NOT NULL UNIQUE,
	"set_name" varchar(100) NOT NULL,
	"match_code" varchar(25),
	"status" varchar(20) NOT NULL DEFAULT 'draft',
	"active_match_code" varchar(25),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_qsets_match_code" ON "question_sets" ("match_code");
CREATE INDEX IF NOT EXISTS "idx_qsets_status" ON "question_sets" ("status");
CREATE INDEX IF NOT EXISTS "idx_qsets_active_match" ON "question_sets" ("active_match_code");

CREATE TABLE IF NOT EXISTS "question_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL REFERENCES "question_sets"("id") ON DELETE CASCADE,
	"round" varchar(10) NOT NULL,
	"slot" varchar(25) NOT NULL,
	"bank_code" varchar(25) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_qset_items_set_id" ON "question_set_items" ("set_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_qset_items_set_slot" ON "question_set_items" ("set_id","slot") WHERE "slot" IS NOT NULL;
