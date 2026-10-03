





INSERT INTO "users" ("user_slug", "email", "user_code", "user_name", "role", "operator_scopes")
VALUES
  ('ocee-agent', 'ocee@local', 'OC_U_OCEE01', 'OCee Agent', 'agent', 'controller,qauthor'),
  ('discord-bot', 'bot@local', 'OC_U_BOT01', 'Discord Bot', 'agent', 'controller')
ON CONFLICT ("user_code") DO UPDATE SET
  "role" = EXCLUDED."role",
  "operator_scopes" = EXCLUDED."operator_scopes",
  "is_deleted" = false,
  "updated_at" = now();
