# OLYMPIA CUSTOM
This is a repository of the Olympia Custom's web app, use for Olympia Custom quiz gameshow based on "Đường lên đỉnh Olympia" contest, with adjustments in the gameplay mechanism.

Currently, this app is currently in progress for v2.0; a completely new UI, backend stacks for easier integrations with AI agents. Also, this is the version that have minimal AI-assisted coding.


## Techstacks that I used
| Name | Github's URL |
| ------ | ---------------------------|
| fastify | https://github.com/fastify/fastify |
| fastfiy-postgres | https://github.com/fastify/fastify-postgres |
| fastify-jwt | https://github.com/fastify/fastify-jwt |
| fastify/rate-limit | https://github.com/fastify/fastify-rate-limit |
| drizzle-orm | https://github.com/drizzle-team/drizzle-orm |
| argon2 | https://github.com/ranisalt/node-argon2 |
| otplib | https://github.com/yeojz/otplib |

## Run with Podman

The stack runs in containers — **postgres + backend** — while the frontend runs on the
host through Vite (compose has no frontend service).

```bash
# first run only: config
cp configs.example/.env.example configs/.env
#   fill in POSTGRES_PASSWORD / POSTGRES_DB / SEED_ADMIN_PASSWORD,
#   generate the two secrets:  openssl rand -hex 32
#   (do NOT set PORT — the container owns :3000 and compose maps it)

podman compose up -d               # postgres :5432 + backend :3000 (migrations run on start)

# frontend, in host terminals:
cd frontend && npm run dev:gameplay    # gameplay  → http://localhost:5175
cd frontend && npm run dev             # portal    → http://localhost:5173
```

Day-to-day:

```bash
podman compose build backend       # rebuild after changing backend/src (no volume mount —
podman compose up -d backend       #   the image IS the code; recreate to pick it up)
podman compose logs -f backend     # follow the backend
podman compose down                # stop the stack (the data volume survives)
```

Notes:

- Config lives in `configs/.env` (start from `configs.example`); containers read it via
  `env_file`. The Vite dev proxy targets `http://localhost:3000` — if another process ever
  holds that port, point it elsewhere with `API_PROXY_TARGET`.
- `docker compose` works identically if you prefer Docker.
- Dev sign-in for the gameplay app without Google OIDC:
  `cd backend && npx tsx --env-file=../configs/.env scripts/mint-gameplay-session.ts`
  (prints a session cookie + the URL to open). Google sign-in activates once
  `GOOGLE_OIDC_ISSUER / _CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI` are set — the local
  redirect URI is `http://localhost:5175/gameplay/auth/google/callback`.
- Seed the first admin: `cd backend && npm run seed:admin`.
