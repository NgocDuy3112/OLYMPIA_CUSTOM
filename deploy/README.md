# olympia-custom — the three hosts

One backend, three frontends, three hostnames. Each host serves its own bundle
and **path-proxies** the API prefixes it needs, so every browser request is
same-origin: no CORS, host-only cookies, same-origin WebSockets.

| Host | Serves | Proxies | Session cookie |
|---|---|---|---|
| `portal.aoc.olympia-custom.io.vn` | the console / admin bundle (MC deck, show screen, tournaments, questions, operators, MCP keys) | `/portal/*`, `/spectate/*` | `portal_session` — **host-only** |
| `gameplay.aoc.olympia-custom.io.vn` | the player bundle (join, schedule, standings, player deck, camera) | `/gameplay/*` | `gameplay_session` — **host-only** |
| `aoc.olympia-custom.io.vn` | the audience — "Khán giả cùng leo núi": the live read + (later) public tournament pages | `/spectate/*`, `/public/*` | **none** |

## Why not an `api.` host

A single `api.aoc…` would force `Domain=.aoc…` cookies (weaker isolation),
`SameSite=None; Secure` for every fetch, and a CORS allowlist per host. The apps
already speak absolute prefixes (`/portal/…`, `/gameplay/…`, `/spectate/…`) —
that is exactly what a per-host prefix proxy expects, so nothing in the code
changes. The one place CORS still matters is a **dev** server or a deliberate
split-origin preview: `CORS_ORIGINS` in the backend (`src/app.ts`) exists for
that, defaults to the known hosts, and is never needed in production.

Two properties fall out of this shape, and both are worth keeping:

- **A player cannot carry a portal session.** The two cookies live on different
  hosts and neither is set with a `Domain` — an XSS on the player deck cannot
  reach the admin API, it cannot even present the cookie.
- **The audience host cannot reach the staff API.** `/portal/*` and
  `/gameplay/*` are not proxied there at all.

## What each host needs from the environment

| Variable | Where | Why |
|---|---|---|
| `ACME_EMAIL` | proxy | Let's Encrypt account |
| `BACKEND_UPSTREAM` | proxy | default `backend:3000` (compose network) |
| `PORTAL_APP` / `GAMEPLAY_APP` / `AUDIENCE_APP` | proxy | static containers, default `portal:80` etc. |
| `GOOGLE_OIDC_REDIRECT_URI` | backend (per deploy) | must be a URI on **the host whose cookie it sets** — e.g. `https://gameplay.aoc.olympia-custom.io.vn/gameplay/auth/google/callback`. Register the same URI in the Google console. |
| `CORS_ORIGINS` | backend (optional) | only for non-same-origin clients (dev/preview) |

Cookies are `httpOnly`, `SameSite=Lax`, `Secure` in production, and **no
`Domain`** — that is the isolation above. `SameSite=Lax` stays correct because
every navigation is same-site (the user is on `gameplay.aoc…` and every request
it makes is to `gameplay.aoc…`).

## Running it

```bash
# production shape (postgres + backend + 3 static hosts + one proxy)
podman compose -f docker-compose.prod.yaml up -d --build

# local development is unchanged: three Vite servers with prefix proxies
cd frontend && npm run dev          # portal   → :5173
cd frontend && npm run dev:gameplay # gameplay → :5175
```

Local subdomains are deliberately **not** wired: `*.localhost` would buy nothing
(the Vite proxies already emulate the per-host prefix routing) and would
complicate the OAuth callback. Production is where the split is exercised.

## TLS

One certificate per hostname, HTTP challenge — three explicit names. A wildcard
(`*.aoc.olympia-custom.io.vn`) would need a DNS-challenge provider plugin **and**
would still not cover the apex `aoc.olympia-custom.io.vn`; if you want a single
cert anyway, add a DNS provider block to `deploy/Caddyfile` and list the three
names under one site block with `tls { dns <provider> }`.

## Still missing (the next slice)

- **`apps/audience`** — its own small bundle. Today the audience host serves the
  portal bundle, whose only public route is `/spectate/:tournament/:match`.
- **`/public/*`** — public reads of a tournament (schedule, standings, groups,
  match summary). The handlers exist under `/portal/*` with staff guards; they
  need read-only twins with the same rate limit as `/spectate/*`.
