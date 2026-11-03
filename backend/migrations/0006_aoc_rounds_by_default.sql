-- The round list and its rules stop being a form an operator fills in, so a
-- tournament without rounds is no longer a state anyone can reach — or should keep.
-- Tournaments created before this get the four AOC rounds, in playing order.
UPDATE "tournaments"
SET "rounds" = '[
  {"id":"khoi-dong","name":"Khởi động","order":0,"chart":"bars"},
  {"id":"giai-ma","name":"Giải mã","order":1,"chart":"bars"},
  {"id":"but-pha","name":"Bứt phá","order":2,"chart":"bars"},
  {"id":"ve-dich","name":"Về đích","order":3,"chart":"bars"}
]'::jsonb
WHERE jsonb_array_length("rounds"::jsonb) = 0;
