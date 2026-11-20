WITH exploded AS (
    SELECT
        m."id" AS match_id,
        r.round_key,
        r.round_value,
        (
            SELECT jsonb_agg(
                CASE
                    WHEN t.turn_value ? 'flow' THEN t.turn_value
                    ELSE t.turn_value || CASE r.round_key
                        WHEN 'khoi-dong' THEN CASE t.turn_index
                            WHEN 1 THEN '{"flow":"rieng","buckets":["khoi-dong:rieng"],"window":{"mode":"Oral","eligibility":"CurrentTurn","seconds":40}}'::jsonb
                            WHEN 2 THEN '{"flow":"chung","buckets":["khoi-dong:chung"],"window":{"mode":"Typed","eligibility":"Everyone","seconds":10}}'::jsonb
                            ELSE '{}'::jsonb
                        END
                        WHEN 'giai-ma' THEN
                            '{"flow":"chung","buckets":["giai-ma"],"window":{"mode":"Typed","eligibility":"Everyone","seconds":15}}'::jsonb
                        WHEN 'but-pha' THEN
                            '{"flow":"chung","buckets":["but-pha"],"window":{"mode":"Typed","eligibility":"Everyone","seconds":30}}'::jsonb
                        WHEN 've-dich' THEN CASE t.turn_index
                            WHEN 1 THEN '{"flow":"chung","buckets":["ve-dich:20","ve-dich:30"],"window":{"mode":"Typed","eligibility":"CurrentTurn"}}'::jsonb
                            WHEN 2 THEN '{"flow":"rieng","buckets":["ve-dich:40","ve-dich:50"],"window":{"mode":"Oral","eligibility":"CurrentTurn"}}'::jsonb
                            ELSE '{}'::jsonb
                        END
                        ELSE '{}'::jsonb
                    END
                END
                ORDER BY t.turn_index
            )
            FROM jsonb_array_elements(r.round_value -> 'turns') WITH ORDINALITY AS t(turn_value, turn_index)
        ) AS new_turns
    FROM "matches" m
    CROSS JOIN LATERAL jsonb_each(m."round_configs") AS r(round_key, round_value)
    WHERE jsonb_typeof(r.round_value -> 'turns') = 'array'
),
regrouped AS (
    SELECT
        match_id,
        jsonb_object_agg(round_key, jsonb_set(round_value, '{turns}', new_turns)) AS round_configs
    FROM exploded
    GROUP BY match_id
)
UPDATE "matches" m
SET "round_configs" = regrouped.round_configs
FROM regrouped
WHERE m."id" = regrouped.match_id;
