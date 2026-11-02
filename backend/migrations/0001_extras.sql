-- HAND-WRITTEN MIGRATION — do not regenerate, do not squash into the baseline.
--
-- Everything here is beyond what drizzle-kit can express in `src/db/schema`, so
-- it lives alone where it cannot be lost:
--
--   * the `unaccent` extension,
--   * an IMMUTABLE wrapper around it (`unaccent()` itself is only STABLE),
--   * `question_bank.search_vector` — a GENERATED column built on that wrapper,
--   * the GIN index the question search queries.
--
-- Consequence: `question_bank.search_vector` is NOT in the drizzle snapshot, so
-- `db:generate` neither creates nor drops it. If this file is ever deleted, full
-- text search (questions/service.ts `searchQ`) silently returns nothing.

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

CREATE INDEX "question_bank_search_idx" ON "question_bank" USING gin ("search_vector");
