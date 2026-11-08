
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

CREATE FUNCTION immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT public.unaccent('public.unaccent', $1) $$;--> statement-breakpoint

ALTER TABLE "question_bank" ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent("question_text"))) STORED;--> statement-breakpoint

CREATE INDEX "question_bank_search_idx" ON "question_bank" USING gin ("search_vector");
