UPDATE "tournaments"
SET "format" = jsonb_set("format"::jsonb, '{allowedCompetitorCounts}', '[3, 4]'::jsonb)::json
WHERE "format" ? 'competitorsPerMatch'
  AND NOT ("format" ? 'allowedCompetitorCounts');
