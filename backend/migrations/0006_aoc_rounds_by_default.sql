UPDATE "tournaments"
SET "rounds" = '[
  {"id":"khoi-dong","name":"Khởi động","order":0,"chart":"bars"},
  {"id":"giai-ma","name":"Giải mã","order":1,"chart":"bars"},
  {"id":"but-pha","name":"Bứt phá","order":2,"chart":"bars"},
  {"id":"ve-dich","name":"Về đích","order":3,"chart":"bars"}
]'::jsonb
WHERE jsonb_array_length("rounds"::jsonb) = 0;
