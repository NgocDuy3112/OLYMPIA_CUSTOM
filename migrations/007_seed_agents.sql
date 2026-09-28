-- 007 seed agent accounts (identity rows, KHÔNG chứa secret).
-- Secret (password hash) nằm ở STAFF_CREDENTIALS env:
--   STAFF_CREDENTIALS="ocee:$argon2id$...:agent:controller,qauthor;bot:$argon2id$...:agent:controller"
-- Tạo hash: node -e "import('hash-wasm').then(async ({argon2id}) => console.log(await argon2id({password:'...',salt:crypto.getRandomValues(new Uint8Array(16)),parallelism:1,iterations:3,memory:32768,hashLength:32,outputType:'encoded'})))"
-- Apply: psql $DATABASE_URL -f migrations/007_seed_agents.sql

INSERT INTO "users" ("user_slug", "email", "user_code", "user_name", "role", "operator_scopes")
VALUES
  ('ocee-agent', 'ocee@local', 'OC_U_OCEE01', 'OCee Agent', 'agent', 'controller,qauthor'),
  ('discord-bot', 'bot@local', 'OC_U_BOT01', 'Discord Bot', 'agent', 'controller')
ON CONFLICT ("user_code") DO UPDATE SET
  "role" = EXCLUDED."role",
  "operator_scopes" = EXCLUDED."operator_scopes",
  "is_deleted" = false,
  "updated_at" = now();
