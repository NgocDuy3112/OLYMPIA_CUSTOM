-- Question type follows the bucket.
--
-- Rows tagged into an ORAL bucket (Khoi Động Riêng, VĐ 40/50) were imported with
-- the default payload.type "TEXT", so the bucket guard refused them at assembly:
--
--   type TEXT does not fit slot khoi-dong/phase1 (expected ORAL)
--
-- Declare ORAL for them. The audience face stays OPTIONAL for ORAL rows
-- (assertPayloadForType), so a row carrying no `options` is still valid: the
-- audience simply shows the same text face as the player until a face is added
-- in the dialog.
--
-- `question_bank.type` is GENERATED from payload->>'type', so updating payload
-- is what moves it.
UPDATE question_bank
SET payload = jsonb_set(payload, '{type}', '"ORAL"', true),
    updated_at = now()
WHERE tags && ARRAY['khoi-dong:rieng', 've-dich:40', 've-dich:50']
  AND (payload ->> 'type' IS NULL OR payload ->> 'type' = 'TEXT');
