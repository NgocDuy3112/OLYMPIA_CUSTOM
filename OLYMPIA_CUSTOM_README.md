# Olympia Custom

A real-time multiplayer quiz game platform for running live quiz competitions — think a
customizable, self-hosted version of a televised academic quiz show, with distinct Admin,
Host (MC), and Player roles competing over synchronized, low-latency rounds.

## Demo

Real matches of OLYMPIA CUSTOM 3 are saved at: `https://youtube.com/playlist?list=PLVi47xTZq4O8&si=ZsyYNErGtSvii7D6`

Live at: `https://olympia-custom.io.vn`

## Problem & Approach

Running a live quiz competition needs more than a quiz app — it needs a system where an
admin can control the flow of a match, a host can run the show, and multiple players can
compete with perfectly synchronized state (score updates, buzzer timing, round transitions)
even when a split second determines who answers first.

The approach: a FastAPI backend coordinating game state through PostgreSQL for durable
records and Valkey pub/sub for instant, low-latency broadcasts to every connected client
over WebSocket, with a companion Discord bot layer for music and sound effects during live
matches.

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend | FastAPI (async Python), SQLAlchemy 2.0 | Async-first, low boilerplate for a WebSocket-heavy, I/O-bound workload |
| Database | PostgreSQL | Durable storage for matches, scores, and questions |
| Cache / Pub-Sub | Valkey (Redis-compatible) | Instant leaderboard updates and WebSocket broadcast across all connected clients |
| Media Storage | S3-compatible object storage | Question media, decoupled from the app server |
| Discord Integration | discord.py (3 separate bots) | Background music, sound effects, and connectivity checks during live matches |
| Auth | JWT (HS256) | Role-based access for Admin / Host / Player |
| Deployment | Podman, Nginx (reverse proxy), Certbot (Let's Encrypt) | Self-hosted, rootless containers, free automated SSL |

## Architecture

```
Browser (React SPA — Admin / Host / Player)
  ├─ HTTP /api/*         ──────────────► FastAPI Backend
  └─ WebSocket /ws/{match_code}
                                            │
                                       Valkey pub/sub
                                     (channel = match_code)
                                            │
                                 ┌──────────┼──────────┬────────────┐
                             BGM Bot     SFX Bot     Ping Bot
                          (bgm_bot.py) (sfx_bot.py) (ping_bot.py)
                          Discord voice  Discord voice  Discord voice

FastAPI Backend
  ├─ PostgreSQL   (persistence: matches, scores, questions)
  ├─ Valkey       (cache + leaderboard + pub/sub)
  └─ S3-compatible storage (question media)

Reverse proxy: Nginx + Let's Encrypt (Certbot), self-hosted via Podman
```

## Key Features

- Real-time synchronized match state across Admin, Host, and Player clients (~0.5s latency)
- Role-based access control — each role can only perform actions permitted to it
- Discord-integrated background music and sound effects during live rounds
- Self-hosted deployment with automated HTTPS certificate renewal

## Technical Decisions & Challenges

**1. Separate Discord bots per function (BGM/SFX/Ping) instead of one unified bot**

Initially split into three bots — one for background music, one for sound effects, one for
connectivity checks — to keep responsibilities clear and make debugging easier while building
out the system. After monitoring resource usage in production (`podman stats`), the three
separate processes together consumed ~217MB of RAM, each paying its own overhead for loading
the discord.py runtime and maintaining its own gateway connection to Discord — combined, this
was heavier than the main game logic service (~122MB). This highlighted a trade-off between
early-stage debuggability and runtime resource efficiency. The lesson carried into the next
iteration: consolidate into a single process with separate internal modules (cogs), preserving
code separation without duplicating runtime overhead.

**2. Capacity planning for an 8GB VPS under concurrent matches**

Before hosting a tournament with multiple matches running at once, RAM headroom needed to be
estimated to avoid an out-of-memory crash mid-event. Baseline usage was measured with
`podman stats` under light load (~358MB total across all containers), then projected forward
based on expected growth in concurrent WebSocket connections and Postgres write load when
scaling to three simultaneous matches. Hard memory limits were applied per container, and
Postgres was tuned (`shared_buffers`, `work_mem`) to prevent any single service from consuming
shared resources — rather than upgrading the VPS ahead of having real usage data.

**3. Real-time fairness under WebSocket broadcast**

In a quiz format where being first to buzz in matters, naive polling or delayed broadcast
would break the game. WebSocket updates via Valkey pub/sub keep all clients within ~0.5s of
each other, which was treated as a hard requirement rather than a nice-to-have during design.

## Getting Started

### Prerequisites

| Component | Version |
|---|---|
| Podman | 4.0+ |
| Python | 3.12+ |
| Node.js | 18+ (frontend build) |

### Local setup

```bash
git clone https://github.com/<your-org>/olympia-custom.git
cd olympia-custom

cp configs/.env.example configs/.env
# edit configs/.env with your settings

podman-compose up -d
```

Access:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API docs (Swagger): `http://localhost:8000/docs`

### Create an admin user

```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "Admin User",
    "user_code": "OC_U001",
    "password": "admin123",
    "role": "admin"
  }'
```

## Roadmap

- [ ] Consolidate the three Discord bots into a single process (in progress on the next
      iteration, built with Fastify/Node.js)
- [ ] Support multiple tournaments running concurrently with proper match-state namespacing
- [ ] Migrate backend from FastAPI to Fastify (Node.js/TypeScript)
- [ ] Automated test coverage for match state transitions

## License

[Add license here — e.g. MIT]