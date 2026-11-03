-- AOC group matches hold 3 or 4 players, and the team-point scale resolves by the
-- real count. Tournaments created before this carried only a fixed
-- `competitorsPerMatch`, which made the New-match dialog offer exactly that many
-- seats and the API refuse any other count.
UPDATE "tournaments"
SET "format" = jsonb_set("format"::jsonb, '{allowedCompetitorCounts}', '[3, 4]'::jsonb)::json
WHERE "format" ? 'competitorsPerMatch'
  AND NOT ("format" ? 'allowedCompetitorCounts');
