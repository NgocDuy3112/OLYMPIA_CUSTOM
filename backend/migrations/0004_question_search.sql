-- Full-text search for the question bank. Kept inside Postgres: schema.md's
-- "no secondary stores" principle rules out an external search engine.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

-- unaccent() is STABLE, so it cannot appear in a generated column or an index
-- expression. This wrapper pins the dictionary and is safe to mark IMMUTABLE.
-- Caveat: if the unaccent rules are ever upgraded, rebuild the column + index.
CREATE FUNCTION immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT public.unaccent('public.unaccent', $1) $$;--> statement-breakpoint

-- 'simple' because Postgres ships no Vietnamese stemmer; combined with
-- immutable_unaccent() this makes "duong len dinh" match "Đường lên đỉnh".
ALTER TABLE "question_bank" ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent("question_text"))) STORED;--> statement-breakpoint

CREATE INDEX "question_bank_search_idx" ON "question_bank" USING gin ("search_vector");--> statement-breakpoint
