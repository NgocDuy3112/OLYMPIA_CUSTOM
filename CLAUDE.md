# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OLYMPIA CUSTOM is a full-stack quiz game platform with:
- **Backend**: FastAPI (Python 3.12) + PostgreSQL 17 + Valkey 9 (Redis-compatible)
- **Frontend**: React 19 + TypeScript 5 + Tailwind CSS 4 + Vite 7
- **Real-time**: WebSocket via Valkey pub/sub
- **Infrastructure**: Docker Compose (services: `postgresql`, `valkey`, `app`)

---

## Commands

### Backend

```bash
# Start all services (Docker)
docker-compose up -d --profile development

# View logs
docker-compose logs -f app

# Shell into app container
docker-compose exec app bash

# Run locally (without Docker)
cd backend/app
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm run dev        # Vite dev server (port 5173)
npm run build      # tsc -b && vite build
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Database Migrations (Alembic)

Run inside the `app` container or local venv with `backend/app` as working directory:

```bash
alembic upgrade head                          # Apply all pending migrations
alembic current                               # Check current revision
alembic revision --autogenerate -m "message"  # Generate migration from model changes
alembic downgrade -1                          # Revert one migration
```

Migrations live in `backend/app/alembic/versions/`. The DB URL is loaded dynamically from `configs.py` (not hardcoded in `alembic.ini`).

---

## Architecture

### Monorepo Structure

```
OLYMPIA_CUSTOM/
├── backend/
│   ├── app/          # FastAPI REST API
│   │   ├── alembic/      # DB migrations (env.py + versions/)
│   │   ├── core/         # Business logic layer
│   │   ├── routes/       # FastAPI route handlers
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response models
│   │   ├── dependencies/ # FastAPI dependency injection
│   │   ├── utils/        # Helpers (ws_connection.py, etc.)
│   │   ├── configs.py    # Settings classes (AppSettings, PostgreSQLSettings, ValkeySettings, GCPSettings)
│   │   ├── logger.py     # global_logger singleton
│   │   └── main.py       # Entry point, lifespan, WebSocket
│   └── ocee-bot/     # Discord bot (separate service)
├── frontend/src/
│   ├── pages/
│   │   ├── admin/    # A-prefixed pages
│   │   └── player/   # P-prefixed pages
│   ├── components/
│   │   ├── admin/    # A-prefixed components
│   │   ├── player/   # P-prefixed components
│   │   └── shared/
│   ├── routes/       # AdminRoutes.tsx, PlayerRoutes.tsx
│   ├── contexts/     # WebSocket context providers (admin + player)
│   ├── hooks/        # useWebSocket, useAuthSession, useCountdownTimer, etc.
│   ├── types/        # TypeScript interfaces matching API schemas
│   ├── utils/        # logger.ts (createLogger), helpers
│   └── configs.ts    # API_BASE_URL, WS_BASE_URL
├── configs/
│   ├── .env          # Shared env vars (Docker uses this)
│   └── valkey.conf
├── database/         # Persistent volumes (postgresql, valkey)
├── docs/             # API documentation — source of truth
└── docker-compose.yaml
```

### Backend Layered Architecture

`routes/` → `core/` (business logic) → `models/` (SQLAlchemy ORM)

- All database access is **async** (SQLAlchemy 2.0 + asyncpg)
- Use `global_logger` from `logger.py` for all logging (not `print`)
- Logs written to `logs/backend.log` (daily rotation, 7 days retention)
- `dependencies/` provides: `get_db` (AsyncSession), `get_current_user` (JWT auth), `get_ws_manager` (WebSocket), Valkey pool

### Game Phases

The game has 6 sequential rounds. Each has admin (`/admin/...`) and player (`/player/...`) routes:

| Phase | Vietnamese | Admin route(s) | Player route(s) |
|-------|-----------|----------------|-----------------|
| KhoiDong Chung | Khởi Động (shared) | `/admin/kdc/:matchCode` | `/player/kdc/:matchCode` |
| KhoiDong Rieng | Khởi Động (individual) | `/admin/kdr/:matchCode` | `/player/kdr/:matchCode` |
| ButPha | Bứt Phá | `/admin/bp/:matchCode` | `/player/bp/:matchCode` |
| VeDich Chung | Về Đích (shared) | `/admin/vdc/pick/:matchCode`, `/admin/vdc/:matchCode` | `/player/vdc/:matchCode` |
| VeDich Rieng | Về Đích (individual) | `/admin/vdr/pick/:matchCode`, `/admin/vdr/:matchCode` | `/player/vdr/:matchCode` |
| GiaiMa | Giải Mã | `/admin/gm/:matchCode` | `/player/gm/:matchCode` |

`VeDich` has two sub-types defined in `frontend/src/types/veDich.ts`: `VeDichRound.CHUNG = 4` (4 questions), `VeDichRound.RIENG = 3` (3 questions).

Admin hub: `/admin/game-managing`. Players enter via `/player/access`.

### Frontend Naming Conventions

- **Admin** components/pages: `A` prefix (e.g., `AControlButton`, `AGameManagingPage`)
- **Player** components/pages: `P` prefix (e.g., `PAnswerBox`, `PKhoiDongChungPage`)
- **Shared** components: no prefix

### WebSocket

- Endpoint: `GET /ws/{match_code}`
- Valkey pub/sub powers room-based broadcasts via `ConnectionManager` in `utils/ws_connection.py`
- Protocol defined in `docs/api/websocket.md`

**Key message types**: `player_online`, `player_heartbeat` (every 15 s from player), `request_presence` (admin polls players), `navigate` (`{ type: "navigate", path: "...", user_code?: "..." }` — admin pushes route changes to players)

**Frontend**: `contexts/PlayerWebSocketContext.tsx` and `contexts/AdminWebSocketContext.tsx` wrap `hooks/useWebSocket.ts`. The hook auto-reconnects every 3 s and exposes `{ isConnected, lastMessage, sendMessage }`.

### Authentication

- JWT with roles: `guest`, `player`, `admin`
- `dependencies/user_auth.py` → `Depends(get_current_user)` and `require_roles([...])`
- Token payload: `user_name`, `user_code`, `role`
- **Admin**: token stored in `localStorage` key `jwtToken_admin`
- **Player**: token stored in `sessionStorage` key `jwtToken_player`

### Data Conventions

- IDs are **UUIDs**, not integers
- Entity code prefixes: users → `OC_U%`, matches → `OC3_M%`
- All major entities have `is_deleted: bool` (soft delete) + `created_at`/`updated_at` (UTC-aware)
- Match player positions: 1–4 (enforced by DB constraint)
- Record points must be **multiples of 5** (DB constraint)

---

## Key Rules

### API Documentation is Source of Truth

Before implementing or modifying any endpoint interaction, **read the corresponding file in `docs/api/`**. Do not guess endpoint paths, request shapes, or error codes.

- `docs/api/README.md` — full endpoint map
- `docs/api/errors-and-envelope.md` — standard `BaseResponse` wrapper (`schemas/base.py`: `status: Literal["success","error"]`, `message`, `data`)
- Endpoint-specific files: `auth.md`, `users.md`, `matches.md`, `questions.md`, `answers.md`, `records.md`, `websocket.md`

Frontend TypeScript interfaces in `src/types/` must exactly match the API docs.

### Backend Code Style

- Python 3.12+, follow Google Python Style Guide
- SQLAlchemy 2.0 async: use `select()` + `await db.execute()`, never sync-style queries
- `session.add()` is **not** awaitable
- Use `User | None` union syntax (not `Optional[User]`)
- Always `await` coroutines; missing `await` is the most common async bug
- Log with `exc_info=True` when catching exceptions

### Frontend Code Style

- React 19, TypeScript 5, Tailwind CSS v4 utility-first
- Path alias `@` maps to `src/`
- Use `createLogger(namespace)` from `@/utils/logger.ts` for scoped frontend logging

---

## Environment Variables

Docker reads from `configs/.env`. Key variables:

```
SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
POSTGRES_DB_USER, POSTGRES_DB_PASSWORD, POSTGRES_DB_HOST, POSTGRES_DB_PORT, POSTGRES_DB_NAME
VALKEY_USER, VALKEY_PASSWORD, VALKEY_HOST, VALKEY_PORT
SERVICE_ACCOUNT_FILE=credentials.json  # Required for GCP/Google Drive integration
```

For local development, create `backend/app/.env` with the same variables (use `localhost` for hosts).
