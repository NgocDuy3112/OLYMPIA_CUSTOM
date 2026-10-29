ALTER TYPE "public"."question_kind" ADD VALUE 'HINT';--> statement-breakpoint
-- ── HINT kind rollout ─────────────────────────────────────────────────────────
-- A hint is its own kind now: every giai-ma round config must allow it, or no
-- hint question can be staged or assembled for a match. Existing configs gain
-- the kind; matches that already froze their copy get it only while upcoming.
UPDATE "tournaments" SET "round_rules" = jsonb_set(
    "round_rules",
    '{giai-ma,allowedKinds}',
    COALESCE("round_rules" -> 'giai-ma' -> 'allowedKinds', '[]'::jsonb) || '"HINT"'::jsonb,
    true
) WHERE "round_rules" ? 'giai-ma';--> statement-breakpoint
UPDATE "matches" SET "round_configs" = jsonb_set(
    "round_configs",
    '{giai-ma,allowedKinds}',
    COALESCE("round_configs" -> 'giai-ma' -> 'allowedKinds', '[]'::jsonb) || '"HINT"'::jsonb,
    true
) WHERE "status" = 'UPCOMING' AND "round_configs" ? 'giai-ma';
-- NOTE: the interim marker conversion (`payload.hint = true` → kind HINT) is
-- deliberately NOT here: Postgres refuses to USE a new enum value in the same
-- transaction that adds it (SQLSTATE 55P04). It was run once, by hand, against
-- the dev database that actually held such rows — no other environment ever
-- saw the interim UI, so no other environment has them.
