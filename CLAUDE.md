# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Olympia Custom 3** — a real-time multiplayer quiz game platform for Vietnamese game shows. React + TypeScript frontend, FastAPI backend, PostgreSQL + Valkey, and two Discord bots (BGM + SFX) for in-room audio.

---

## Commands

### Frontend (`frontend/`)
```bash
npm run dev        # Dev server at :5173 (proxies /api → :8000, /ws → :8000)
npm run build      # tsc + vite build
npm run lint       # ESLint
```

### Backend (`backend/app/`)
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
pytest tests/ -v
```
Dependencies managed with `uv` (see `uv.lock`). No Alembic — tables are auto-created on startup via `Base.metadata.create_all`.

### Deployment (production)
All commands use `podman-compose` with `docker-compose.prod.yaml` and `configs/.env`:
```bash
./scripts/deploy.sh    # podman-compose up -d --build --no-cache
./scripts/rebuild.sh   # down + prune + up
./scripts/shutdown.sh  # down
./scripts/destroy.sh   # down + volumes
```

---

## Architecture

### Communication flow

```
Browser (React SPA)
  ├─ HTTP /api/*  ──────► FastAPI (routes/)
  └─ WebSocket /ws/{match_code}?token=JWT
                           │
                       Valkey pub/sub (channel = match_code)
                           │
                    ┌──────┴───────┐
                  BGM Bot        SFX Bot
               (bgm_bot.py)   (sfx_bot.py)
```

### Frontend roles

Three separate route trees, each with its own WebSocket context provider:
- `/player/*` — `PlayerRoutes.tsx` + `PlayerWebSocketContext`
- `/admin/*` — `AdminRoutes.tsx` + `AdminWebSocketContext`
- `/mc/*` — `MCRoutes.tsx` + `MCWebSocketContext`

Admin stores session in `localStorage`; players use `sessionStorage`.

**Auto-navigation**: Admin broadcasts `{ type: "navigate", path: "/player/kdr" }` via WebSocket → `AutoNavigator` in `PlayerRoutes` routes all player tabs automatically.

**Player presence**: Players send `player_online` on connect, `player_heartbeat` every 15 s, and respond to `request_presence`. Admin detects disconnect after ~25 s silence.

### Game phases (used in routes and bot event maps)

| Code | Round |
|------|-------|
| `kdc` | Khởi Động Chung (group warm-up) |
| `kdr` | Khởi Động Cá Nhân (individual warm-up) |
| `bp` | Bứt Phá (buzzer sprint) |
| `vdc` | Về Đích Chung (group final, 4 questions) |
| `vdr` | Về Đích Cá Nhân (individual final, 3 questions) |
| `gm` | Giải Mã (decode) |
| `vl` | Vòng Loại (qualifier) |

Về Đích rounds have a question-selection sub-step: `/vdc/pick` and `/vdr/pick` precede the main gameplay route.

### Backend

FastAPI entry point: `main.py` — lifespan initialises Valkey and `ConnectionManager`, then calls `create_all` to ensure tables exist.

Registered routers: `auth`, `user`, `match`, `answer`, `question`, `record`, `scoreboard`, `qualifier`, `media`.

WebSocket endpoint (`GET /ws/{match_code}?token=JWT`) authenticates via query param, joins the room, and publishes every incoming message to Valkey so other connected clients and bots receive it. Role-based filtering applies: players are restricted to `_PLAYER_ALLOWED_TYPES`, MC to `_MC_ALLOWED_TYPES`, admin is unrestricted.

API response envelope: `{ status: "success"|"error", message: string, data: any }`.

**Critical**: Backend forwards raw payload objects to WebSocket clients — not wrapped. Frontend reads `msg?.message ?? msg` defensively to handle both.

### Docker services (`docker-compose.prod.yaml`)

| Service | Image | Purpose |
|---------|-------|---------|
| `postgresql` | PostgreSQL 17 | Primary database |
| `valkey` | Valkey 9 | Cache + pub/sub backbone |
| `app` | FastAPI build | Backend API + WebSocket |
| `frontend` | Vite build (nginx) | React SPA static serving |
| `bgm-bot` | Python build | Discord BGM audio bot |
| `sfx-bot` | Python build | Discord SFX audio bot |
| `nginx` | nginx + certbot | Reverse proxy + TLS termination |
| `certbot` | certbot | Let's Encrypt certificate renewal |

All services share `olympia-network`. Persistent volumes: `olympia_postgres_data`, `olympia_valkey_data`, `olympia_certbot_webroot`, `olympia_certbot_certs`.

### Discord bots

Both bots run in Docker containers, subscribe to the Valkey channel `{MATCH_CODE}` (from env), and sync audio files from S3 on startup. Shared support files: `s3_audio.py` (S3 sync), `valkey_listener.py` (pub/sub subscriber), `configs.py` (env-based config).

**BGM bot** (`bgm_bot.py`):
- On `navigate` → play phase intro music (`PHASE_MUSIC_MAP`)
- On `start_the_timer` → find `{phase}_{time_limit}s.*` file in `audios/bgm/` and play it
- Phases `vdc`/`vdr` use prefix `vd` for timer filenames (e.g. `vd_30s.mp3`)
- Stops current track before playing new one

**SFX bot** (`sfx_bot.py`):
- Queue-based (sequential, never overlapping)
- Phase-specific overrides in `PHASE_EVENT_SFX_MAP` take priority over generic `EVENT_SFX_MAP`
- Phase is tracked by watching `navigate` and `round_end` messages
- On `start_the_timer` → sleeps for `time_limit` seconds, then plays `timer_end.*`
- On `veDich_power_activated` → plays `vd_nshv` (star) or `vd_bhmt` (shield); null power = no SFX

### S3 audio files

Bucket structure — always check this before adding a new audio event mapping:

**`audios/bgm/`** (background music, 12 files):
`bp_30s.ogg`, `gm_15s.ogg`, `kd_bat_dau.ogg`, `kd_ket_thuc.ogg`, `kdc_60s.mp3`, `kdr_30s.mp3`, `vcnv_bat_dau.ogg`, `vd_5s.ogg`, `vd_15s.mp3`, `vd_20s.ogg`, `vd_30s.mp3`, `vd_45s.mp3`

**`audios/sfx/`** (sound effects, 14 files):
`bp_dung.mp3`, `bp_hien_tra_loi.ogg`, `gm_bat_dau.ogg`, `gm_chon_goi_y.ogg`, `gm_dung.mp3`, `gm_dung_tu_khoa.mp3`, `gm_hien_tra_loi.ogg`, `kd_bat_dau.ogg`, `kd_dung.mp3`, `kd_hien_tra_loi.ogg`, `kd_sai.ogg`, `vd_dung.ogg`, `vd_hien_tra_loi.ogg`, `vd_sai.ogg`

Bucket cũng chứa media file câu hỏi theo cấu trúc `{MATCH_CODE}/{filename}` (ảnh/video).

S3 sync uses path-style addressing + signature v4. Skips files already present at the same size. Silent no-op when `S3_BUCKET_NAME` is unset (local dev).

---

## Debugging

**Do not read Qualifier files when debugging.** Qualifier (`vl` phase) has its own isolated route, API, and page components (`AQualifierPage.tsx`, `MQualifierPage.tsx`, `PQualifierPage.tsx`, `backend/app/routes/qualifier.py`). Unless the bug is explicitly in the qualifier flow, exclude these files from investigation to avoid noise.

---

## Environment

All services share a single `configs/.env`. Key variables:

```
# Backend + bots
SECRET_KEY, POSTGRES_*, VALKEY_*
S3_ENDPOINT_URL, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
BGM_BOT_TOKEN, SFX_BOT_TOKEN, VOICE_CHANNEL_ID
MATCH_CODE          # Valkey channel bots subscribe to (default: OC3_M_VL)
CORS_ORIGINS        # Comma-separated allowed origins for CORS middleware

# Frontend
VITE_API_URL, VITE_WS_URL
```
