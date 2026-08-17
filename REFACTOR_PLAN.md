# REFACTOR PLAN — Olympia Custom v4

> **Phiên bản hiện tại**: v3 (FastAPI Python + React SPA + Discord Python bots)
> **Mục tiêu**: v4 (Fastify TypeScript + React SPA + 1 Discord bot TS + AI Agent-ready)

---

## 0. Tóm tắt thay đổi

| Hạng mục | Hiện tại (v3) | Mục tiêu (v4) |
|---|---|---|
| Backend framework | FastAPI (Python) | **Fastify (TypeScript)** |
| ORM / DB driver | SQLAlchemy async + asyncpg | **Drizzle ORM + `@electric-sql/pglite` hoặc `postgres.js`** |
| Auth | JWT + email/password, guest token | **Google OAuth 2.0 + Valkey session** (bỏ guest, bỏ password) |
| Discord bots | 3 bot Python (BGM, SFX, Ping) | **1 bot TypeScript duy nhất** (notification + audio) |
| AI Agent | Chưa có | **FastAPI Python service** (container riêng, giao tiếp qua HTTP/gRPC) |
| Frontend roles | Admin, MC, Player, Guest (4 route trees) | **Admin, MC, Player, Spectator** (4 route trees, UI đồng bộ) |
| Monorepo tool | Không có | **Turborepo** hoặc **pnpm workspaces** |

---

## 1. Cấu trúc thư mục mới (monorepo)

```
olympia-v4/
├── apps/
│   ├── web/                    # React SPA (Vite + TypeScript)
│   ├── api/                    # Fastify backend (TypeScript)
│   ├── discord-bot/            # Discord bot (TypeScript, discord.js)
│   └── ai-agent/               # FastAPI Python service (tương lai)
├── engine/                       # Game engine — pure logic, per tournament
│   ├── base/                   # Shared: state, scoring, validation, lifecycle
│   ├── interface.ts            # TournamentEngine contract
│   ├── transport/              # Adapter: WS ↔ engine
│   ├── oc3/                    # OC3 — backward compatible
│   ├── oc4/                    # OC4 — new version
│   └── ochcmc/                  # OHCMC — separate format
├── packages/
│   ├── shared/                 # Types, constants, utils shared giữa các app
│   │   ├── src/
│   │   │   ├── types/          # Match, User, Question, WebSocket messages...
│   │   │   ├── constants/      # Game phases, role enums, routes...
│   │   │   └── utils/          # Date, validation, scoring logic...
│   │   └── package.json
│   └── db/                     # Drizzle schema + migrations
│       ├── src/
│       │   ├── schema/         # Drizzle table definitions
│       │   ├── migrations/
│       │   └── index.ts
│       └── package.json
├── docker/
│   ├── api.Dockerfile
│   ├── bot.Dockerfile
│   ├── ai-agent.Dockerfile
│   └── nginx.conf
├── docker-compose.yaml
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── package.json
```

---

## 2. Backend — Fastify TypeScript

### 2.1 Technology stack

| Concern | Package | Lý do |
|---|---|---|
| HTTP framework | `fastify` | Nhanh hơn Express, native JSON schema validation, plugin system |
| WebSocket | `@fastify/websocket` | Tích hợp sẵn, hỗ trợ full-duplex |
| ORM | `drizzle-orm` | TypeScript-first, type-safe, nhẹ, hỗ trợ Postgres native |
| DB driver | `postgres` (postgres.js) | Non-blocking, hỗ trợ `RETURNING`, prepared statements |
| Auth | `@fastify/oauth2` | Google OAuth flow (Valkey session, không JWT) |
| Session store | `ioredis` (shared với PubSub) | Session data lưu trong Valkey, cookie chỉ chứa session ID |
| Validation | `zod` + `@fastify/type-provider-zod` | Zod schema → Fastify request/response validation |
| Config | `@t3-oss/env-nextjs` hoặc `envalid` | Type-safe env vars |
| State + PubSub | `ioredis` | Valkey-compatible — unified state store + pub/sub backbone |
| S3 | `@aws-sdk/client-s3` | Upload/download media files |
| Logger | `pino` (built-in Fastify) | Structured JSON logging |
| Testing | `vitest` + `@fastify/helmet` | Unit + integration tests |

### 2.2 Cấu trúc `apps/api/`

```
apps/api/
├── src/
│   ├── index.ts                    # Fastify server entry
│   ├── app.ts                      # createApp() — plugin registration
│   ├── config/
│   │   └── env.ts                  # Zod-validated env schema
│   ├── db/
│   │   ├── index.ts                # Drizzle client singleton
│   │   └── migrations/             # Drizzle-kit generated
│   ├── plugins/
│   │   ├── auth.ts                 # Google OAuth + Valkey session + anonymous spectator
│   │   ├── cors.ts                 # CORS config
│   │   ├── websocket.ts            # @fastify/websocket setup
│   │   ├── valkey.ts               # Valkey connection plugin
│   │   └── s3.ts                   # S3 client plugin
│   ├── state/                      # Unified Valkey state (1 key = 1 match)
│   │   ├── match-state.ts          # Single access point cho snapshot
│   │   ├── locks.ts                # Application-level lock (buzzer + power)
│   │   └── id-cache.ts             # ID resolution cache
│   ├── engine/                     # Engine integration (import từ engine/ package)
│   │   ├── index.ts                # getEngine() — tournament format → engine
│   │   └── action-handler.ts        # WS message → engine.handleAction() → broadcast
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.schema.ts      # Zod schemas for request/response
│   │   ├── user/
│   │   │   ├── user.routes.ts
│   │   │   ├── user.service.ts
│   │   │   └── user.schema.ts
│   │   ├── match/
│   │   │   ├── match.routes.ts
│   │   │   ├── match.service.ts
│   │   │   └── match.schema.ts
│   │   ├── question/
│   │   ├── answer/
│   │   ├── record/
│   │   ├── scoreboard/
│   │   ├── media/
│   │   ├── qualifier/
│   │   └── ws/
│   │       ├── ws.gateway.ts       # WebSocket connection handler
│   │       ├── ws.handler.ts       # Message routing + Valkey pub/sub
│   │       └── ws.types.ts
│   ├── guards/
│   │   ├── require-role.ts         # Fastify preHandler hook
│   │   └── require-auth.ts
│   └── utils/
│       ├── errors.ts               # AppError class + fastify error handler
│       └── logger.ts
├── drizzle.config.ts
├── tsconfig.json
├── package.json
└── vitest.config.ts
```

### 2.3 Google OAuth flow

```
┌─────────┐         ┌──────────┐         ┌───────────┐
│ Browser  │────────►│  Fastify  │────────►│  Google    │
│ (React)  │◄────────│  /auth/   │◄────────│  OAuth2    │
└─────────┘         │  google   │         └───────────┘
                    │  callback │
                    └──────────┘
```

**Flow chi tiết:**

1. **Frontend** redirect user đến `GET /api/auth/google` → Fastify redirect sang Google Authorization URL
2. Google authenticate user → redirect về `GET /api/auth/google/callback?code=...`
3. Fastify đổi code lấy tokens → fetch user info (email, name, picture)
4. Tìm hoặc tạo user trong DB (upsert by email)
5. Fastify tạo session ID (random 32 bytes) → `SET session:{sid} {data} EX 86400` trong Valkey
6. Set httpOnly cookie `sid={token}`, redirect về frontend
7. Frontend check auth state via `GET /api/auth/me` (cookie automatically sent)

**Valkey session data:**

```typescript
// Key: session:abc123def456...
// Value: {
//   userId: "uuid",
//   userCode: "OC_U_001",
//   role: "player",
//   email: "user@gmail.com",
//   matchCode: "OC3_M_VL",  // current match (if any)
//   createdAt: 1723000000,
//   lastSeen: 1723000100
// }
// TTL: 86400s (24h) — extend on heartbeat
```

**Session lifecycle:**
- **Login**: `SET session:{sid} {data} EX 86400` + set cookie
- **Request**: `GET session:{sid}` → fast lookup → attach to request context
- **Heartbeat**: `EXPIRE session:{sid} 86400` (player heartbeat mỗi 15s)
- **Logout**: `DEL session:{sid}` + clear cookie
- **Admin force logout**: `DEL session:{targetSid}` — instant, không cần blocklist
- **Disconnect detection**: Session exists nhưng WebSocket closed → player offline

**Changes cần làm:**
- Bỏ `POST /auth/guest-token`
- Bỏ `POST /auth/signup` (manual registration) — thay bằng Google OAuth auto-provision
- Bỏ `POST /auth/login` (password-based) — thay bằng Google OAuth
- Bỏ `POST /auth/reset-password` và `POST /auth/change-password`
- XÓA `RefreshToken` table (không cần — Valkey session tự expire)
- Giữ `POST /auth/send-credentials` và `POST /auth/send-reset` (admin invite flow cho player/MC)
- Thêm `GET /auth/google`, `GET /auth/google/callback`, `GET /auth/me`, `POST /auth/logout`

### 2.4 WebSocket architecture

Giữ nguyên mô hình hiện tại nhưng rewrite bằng TypeScript:

```typescript
// apps/api/src/modules/ws/ws.gateway.ts
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'

interface WsConnection {
  ws: WebSocket
  matchCode: string
  userId: string
  role: 'admin' | 'mc' | 'player'
  userCode: string
  sid: string  // session ID — để sync session lastSeen
}

// Global connection registry (in-memory, replicated via Valkey pub/sub)
const connections = new Map<string, Set<WsConnection>>()

export async function wsGateway(app: FastifyInstance) {
  app.get('/ws/:matchCode', { websocket: true }, (socket, request) => {
    // 1. Extract session ID from cookie (Upgrade request carries cookies)
    //    OR query param ?sid=... for WebSocket clients that can't set cookies
    // 2. Lookup session in Valkey: GET session:{sid}
    // 3. If session invalid → close(4001, 'Unauthorized')
    // 4. Register connection in global Map
    // 5. Subscribe to Valkey channel = matchCode
    // 6. On message: validate type → publish to Valkey
    // 7. On close: unregister, cleanup
    // 8. Heartbeat: EXPIRE session:{sid} 86400 on each WS message
  })
}
```

### 2.5 Validation middleware pattern

```typescript
// apps/api/src/modules/match/match.schema.ts
import { z } from 'zod'

export const createMatchSchema = {
  body: z.object({
    matchName: z.string().min(1).max(100),
  }),
  response: z.object({
    status: z.literal('success'),
    message: z.string(),
    data: z.object({
      matchCode: z.string(),
      matchName: z.string(),
    }),
  }),
}

// apps/api/src/modules/match/match.routes.ts
import type { FastifyInstance } from 'fastify'
import { createMatchSchema } from './match.schema'
import { createMatch } from './match.service'

export async function matchRoutes(app: FastifyInstance) {
  app.post('/matches', {
    schema: createMatchSchema,
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const result = await createMatch(request.body)
    return reply.code(201).send(result)
  })
}
```

### 2.6 Unified Valkey state — 1 key = 1 match

**Triết lý**: Mọi real-time state của 1 match lưu trong 1 hash duy nhất. Không còn key rải rác.

#### v3 vs v4

**v3** (10+ keys rải rác):
```
snapshot:OC3_M_VL          # Hash — MỌI THỨ
vd:turn:OC3_M_VL           # String
vd:powers:OC3_M_VL         # Hash
vd:power_lock:OC3_M_VL:u1  # Lock key
buzzer_lock:OC3_M_VL:q1    # Lock key
buzzer_winner:OC3_M_VL     # Hash
gm:player_state:OC3_M_VL:u1
gm:admin_state:OC3_M_VL
gm:hints:OC3_M_VL
id:match:OC3_M_VL
id:user:OC_U_001
id:question:OC3_Q_001
session:abc123...
```

**v4** (2 keys):
```
snapshot:OC3_M_VL          # Hash — MỌI THỨ gộp vào đây
session:abc123...          # Auth session (riêng, TTL khác)
```

#### Schema `snapshot:{match_code}` (TTL 3h) — 16 fields

```typescript
interface RoundSnapshot {
  // ── Core round state ──
  current_question:   Json   // Question đang hiển thị
  timer:              Json   // Timer state
  video:              Json   // Media control
  answers:            Json   // Answers hiện tại

  // ── Giải Mã (MERGE từ keyword_info + keyword_clues_locked + keyword_answers + keyword_answer) ──
  keyword_state:      Json   // { info, locked, submissions, answer }

  // ── VeDich (MERGE từ vdc_meta + vdc_question_states + vd_selected_chung) ──
  vdc_state:          Json   // { meta, questionStates, selected }
  vdr_state:          Json   // { meta, questionStates, selected }
  vd_turn_player:     string | null
  vd_powers:          Json   // { user_code: "star"|"shield" }

  // ── Qualifier (MERGE từ qualifier_round + qualifier_round_result) ──
  qualifier_state:    Json   // { round, result }

  // ── Buzzer (MERGE từ buzzer_winner + buzzer_lock) ──
  buzzer_winners:     Json   // { question_code: winner_user_code }
  buzzer_locks:       Json   // { question_code: { token, expiresAt } }

  // ── Giải Mã admin/player state ──
  gm_admin_state:     Json
  gm_hints:           Json   // { clue_index: { text, media, targets } }
  gm_player_states:   Json   // { user_code: { keyword, clues_opened } }

  // ── ID cache (MERGE từ id:*) ──
  id_cache:           Json   // { match: uuid, users: {}, questions: {} }
}
```

#### Checkpoint table — PostgreSQL backup

Valkey là ephemeral store — crash = mất data. Checkpoint định kỳ xuống PostgreSQL để recover.

```typescript
// packages/db/src/schema/checkpoint.ts
import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

export const matchCheckpoints = pgTable('match_checkpoints', {
  id:        uuid('id').defaultRandom().primaryKey(),
  matchCode: varchar('match_code', { length: 50 }).notNull(),
  checkpoint: jsonb('checkpoint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_checkpoint_match_time').on(t.matchCode, t.createdAt.desc()),
])
```

#### Checkpoint schedule

```
Mỗi 30s:  Save snapshot → INSERT INTO match_checkpoints (match_code, checkpoint)
           Giữ 10 checkpoints gần nhất / match → DELETE older
On crash:  LATEST checkpoint → restore vào Valkey
```

#### Recovery flow

```
1. Fastify detect Valkey timeout → DEGRADED mode
2. Broadcast: { type: "valkey_degraded" } → frontend show banner
3. Valkey reconnects:
   a. SELECT checkpoint ORDER BY created_at DESC LIMIT 1
   b. Restore snapshot fields vào Valkey
   c. Broadcast: { type: "valkey_restored" }
4. Valkey永久 mất (server crash):
   a. Admin click "Force Restart" → POST /api/match/:code/restart
   b. Clear snapshot + reset match_status = "setup" trong DB
   c. All clients redirect về waiting room
```

#### Lock pattern trên JSON field

```typescript
// apps/api/src/state/locks.ts

interface LockEntry {
  token: string
  expiresAt: number  // unix ms
}

async function acquireLock(
  valkey: Valkey,
  matchCode: string,
  lockField: 'buzzer_locks' | 'vd_power_locks',
  lockKey: string,
  ttlMs: number,
): Promise<string | null> {
  const key = `snapshot:${matchCode}`
  const locks: Record<string, LockEntry> =
    JSON.parse(await valkey.hget(key, lockField) ?? '{}')

  if (locks[lockKey]?.expiresAt > Date.now()) return null  // held

  const token = crypto.randomUUID()
  locks[lockKey] = { token, expiresAt: Date.now() + ttlMs }
  await valkey.hset(key, lockField, JSON.stringify(locks))
  return token
}

async function releaseLock(
  valkey: Valkey, matchCode: string,
  lockField: string, lockKey: string, token: string,
): Promise<boolean> {
  const key = `snapshot:${matchCode}`
  const locks = JSON.parse(await valkey.hget(key, lockField) ?? '{}')
  if (locks[lockKey]?.token !== token) return false
  delete locks[lockKey]
  await valkey.hset(key, lockField, JSON.stringify(locks))
  return true
}
```

> **Lưu ý**: An toàn trên single Fastify instance (single event loop). Nếu scale ra多 instances → quay lại独立 lock keys.

#### Single access point

```typescript
// apps/api/src/state/match-state.ts
export const matchState = {
  // Round
  getQuestion, setQuestion, getTimer, setTimer,
  getAnswers, setAnswers, clearAnswers,
  // VeDich
  getTurnPlayer, setTurnPlayer, clearTurnPlayer,
  getUsedPowers, setUsedPower,
  // Buzzer
  getBuzzerWinners, setBuzzerWinner, clearBuzzerWinners,
  acquireBuzzerLock, releaseBuzzerLock,
  // Giải Mã
  getGmAdminState, setGmAdminField,
  getGmHints, setGmHint, clearGmHint,
  getGmPlayerStates, setGmPlayerSubmission,
  // ID cache
  resolveId, cacheId,
  // Checkpoint + recovery
  checkpoint,      // save snapshot → PostgreSQL
  restore,         // load latest checkpoint → Valkey
  // Lifecycle
  clearSnapshot,   // on round_start
  replaySnapshot,  // for reconnect
}
```

### 2.7 Game engine — per tournament

Mỗi tournament là 1 engine độc lập — pure game logic, không biết WebSocket hay DB. Không giả định mọi tournament dùng cùng phase hoặc cùng số vòng: OC3/OC4 dùng nhóm phase riêng; OHCMC có lifecycle, state, action và scoring riêng.

#### Tournaments

| ID | Tên | Ghi chú |
|---|---|---|
| `oc3` | Olympia Custom 3 | Giữ rules cũ, backward compatible, lưu data cũ |
| `oc4` | Olympia Custom 4 | Rules mới, development chính |
| `ochcmc` | OHCMC | Tournament format riêng, gameplay và lifecycle hoàn toàn khác OC3/OC4 |

#### Cấu trúc

```
engine/
├── base/                    # Shared utilities
│   ├── state.ts             # GameState, snapshot ops
│   ├── scoring.ts           # Point calculations
│   ├── validation.ts        # Answer normalization
│   └── lifecycle.ts         # Phase transitions
├── interface.ts             # TournamentEngine contract
├── transport/
│   ├── action-parser.ts     # WS message → PlayerAction (adapter)
│   ├── broadcast-builder.ts # BroadcastPayload → WS message (adapter)
│   └── registry.ts          # format string → engine (adapter)
├── oc3/                     # OC3 — backward compatible
│   ├── index.ts
│   ├── phases/
│   │   ├── kdc.ts, kdr.ts, bp.ts, vdc.ts, vdr.ts, gm.ts, vl.ts
│   └── config.ts
├── oc4/                     # OC4 — new version
│   ├── index.ts
│   ├── phases/
│   └── config.ts
└── ochcmc/                   # OHCMC — separate format
    ├── index.ts
    ├── phases/
    └── config.ts
```

#### Interface

```typescript
// engine/interface.ts
export interface TournamentEngine {
  readonly id: string
  readonly name: string
  readonly phases: readonly string[]

  initMatch(matchCode: string): Promise<GameState>
  startPhase(matchCode: string, phase: Phase): Promise<PhaseStartResult>
  endPhase(matchCode: string, phase: Phase): Promise<PhaseEndResult>

  handleAction(state: GameState, action: PlayerAction): Promise<{
    state: GameState
    broadcasts: BroadcastPayload[]
  }>

  canBuzz?(state: GameState, userCode: string): boolean
  canSubmit?(state: GameState, userCode: string): boolean
  canUsePower?(state: GameState, userCode: string): boolean
  canAdvance?(state: GameState): boolean

  calculateScore(action: PlayerAction, state: GameState): ScoreDelta
  getSnapshotForReconnect(state: GameState, userCode: string): ReplayPayload[]
}
```

#### Transport — adapter layer

```typescript
// action-parser.ts — WS message → typed PlayerAction
// broadcast-builder.ts — BroadcastPayload → WS message  
// registry.ts — format string → engine instance

const engines = new Map<string, TournamentEngine>([
  ['oc3', new OC3Engine()],
  ['oc4', new OC4Engine()],
  ['ochcmc', new OHCMCEngine()],
])
```

#### DB — matches table thêm field

```typescript
tournamentFormat: varchar('tournament_format', { length: 50 })
  .notNull()
  .default('oc3')  // backward compatible với data cũ
```

#### OC3 — backward compatible

- Giữ nguyên rules hiện tại
- `tournament_format = 'oc3'` cho tất cả matches cũ
- Frontend cũ vẫn hoạt động với OC3 engine
- Data migration: không cần — matches cũ đã có trong DB

#### OC4 — new version

- KDR: mỗi câu chỉ có **một lần trả lời**; đúng +10, sai 0 điểm; không có lần trả lời thứ hai.
- Giải mã: mở gợi ý **không được cộng điểm**; đoán đúng từ khóa được 80 điểm cơ bản, giảm 5 điểm cho mỗi gợi ý đã mở.
- Tách riêng, không affect OC3.
- Frontend OC4 pages riêng hoặc shared pages với config.

#### OHCMC — separate format

- Tournament format riêng cho OHCMC
- Có thể có phases khác (không phải kdc/kdr/bp/vdc/vdr/gm/vl)
- Engine独立, implement TournamentEngine interface

---

## 3. Database — Drizzle ORM

### 3.1 Schema mapping

| Python (SQLAlchemy) | TypeScript (Drizzle) |
|---|---|
| `User` | `users` table — bỏ `hashed_password`, thêm `google_id`, `avatar_url` |
| `RefreshToken` | **XÓA** (Valkey session tự expire, không cần refresh token) |
| `PasswordResetToken` | **XÓA** (không cần password reset) |
| `Match` | `matches` table — giữ nguyên |
| `Question` | `questions` table — giữ nguyên |
| `Answer` | `answers` table — giữ nguyên |
| `Record` | `records` table — giữ nguyên |
| `QualifierRecord` | `qualifier_records` table — giữ nguyên |
| `QualifierAdvancement` | `qualifier_advancements` table — giữ nguyên |
| `RefreshToken` | **XÓA** (Valkey session tự expire) |
| `PasswordResetToken` | **XÓA** (không cần password reset) |
| `AuditLog` | `audit_logs` table — giữ nguyên |
| `MatchCheckpoint` | **MỚI** — `match_checkpoints` table (Valkey backup) |

### 3.2 Drizzle schema example

```typescript
// packages/db/src/schema/user.ts
import { pgTable, uuid, varchar, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('roleenum', ['player', 'mc', 'admin'])
// Guest ĐÃ BỎ

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleId: varchar('google_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  userCode: varchar('user_code', { length: 50 }).notNull().unique(),
  userName: varchar('user_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  role: roleEnum('role').notNull().default('player'),
  isDeleted: boolean('is_deleted').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})
```

### 3.3 Migration strategy

#### Schema comparison (v3 → v4)

| Table | v3 (SQLAlchemy) | v4 (Drizzle) | Action |
|---|---|---|---|
| `users` | id, user_code, user_name, hashed_password, email, role (含 guest), is_deleted, created_at, updated_at | id, google_id, user_code, user_name, email, avatar_url, role (不含 guest), is_deleted, created_at, updated_at | **ALTER** |
| `matches` | id, match_code, match_name, match_status, created_by, is_deleted, created_at, updated_at | + tournament_format, + video_url | **ALTER** |
| `questions` | id, question_code, content, answer, media_url, explanation, options, is_used, is_deleted, match_id | giữ nguyên | **KEEP** |
| `answers` | id, answer_text, has_buzzed, timestamp, is_deleted, player_id, match_id, question_id | giữ nguyên | **KEEP** |
| `records` | id, points, is_deleted, player_id, match_id, question_id, round_number, question_code | giữ nguyên | **KEEP** |
| `qualifier_records` | id, points, response_time, is_correct, round_number, chosen_option, is_deleted, player_id, match_id, question_id | giữ nguyên | **KEEP** |
| `qualifier_advancements` | id, player_id, match_id, round_number, status, is_deleted, created_at, updated_at | giữ nguyên | **KEEP** |
| `audit_logs` | id, action_type, actor_code, match_code, target_code, details, created_at | giữ nguyên | **KEEP** |
| `refresh_tokens` | id, token, user_id, expires_at, is_revoked, created_at | — | **DROP** |
| `password_reset_tokens` | id, token, created_at, expires_at, used, user_id | — | **DROP** |
| `match_checkpoints` | — | id, match_code, checkpoint (JSONB), created_at | **ADD** |
| `match_player_positions` | match_id, player_id, position | giữ nguyên | **KEEP** |

#### Migration steps

```
Phase 1: Pre-migration (trước khi deploy v4)
─────────────────────────────────────────────
1. Backup database hoàn toàn
   pg_dump > backup_$(date +%Y%m%d).sql

2. Chạy SQL migration script trên production
   (xem migration script bên dưới)

3. Verify: tất cả rows giữ nguyên, columns mới có default values

Phase 2: Deploy v4
────────────────────
4. Deploy Fastify backend (Drizzle)
   - Drizzle schema map với DB đã migration
   - drizzle-kit generate → verify migration files khớp

5. Verify: API hoạt động, data không mất

Phase 3: Cleanup (sau khi confirm v4 stable)
─────────────────────────────────────────────
6. DROP refresh_tokens, password_reset_tokens
   (chỉ khi confirm không ai cần nữa)
```

#### SQL migration script (chạy trước deploy)

```sql
-- ============================================================
-- OC3 → OC4 Database Migration
-- Chạy TRƯỚC khi deploy v4 backend
-- ============================================================

BEGIN;

-- 1. Users table: add columns, modify role enum
-- ──────────────────────────────────────────────

-- Add new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

-- Rename column (if needed)
-- ALTER TABLE users RENAME COLUMN hashed_password TO _deprecated_password;
-- Không drop ngay — phòng trường hợp rollback

-- Update role enum: thêm giá trị mới nếu cần
-- PostgreSQL enum không thể remove value, nhưng có thể thêm
-- guest vẫn giữ trong enum để existing data không corrupt
-- chỉ frontend/backend bỏ qua guest role

-- 2. Matches table: add tournament_format
-- ────────────────────────────────────────

ALTER TABLE matches ADD COLUMN IF NOT EXISTS tournament_format VARCHAR(50) NOT NULL DEFAULT 'oc3';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);  -- Optional, admin paste sau khi OBS stream

-- Existing matches automatically get 'oc3' — backward compatible

-- 3. Create match_checkpoints table
-- ──────────────────────────────────

CREATE TABLE IF NOT EXISTS match_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code VARCHAR(50) NOT NULL,
  checkpoint JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_match_time 
  ON match_checkpoints (match_code, created_at DESC);

-- 4. Cleanup (OPTIONAL — only after v4 stable)
-- ────────────────────────────────────────────
-- DROP TABLE IF EXISTS refresh_tokens;
-- DROP TABLE IF EXISTS password_reset_tokens;
-- ALTER TABLE users DROP COLUMN IF EXISTS _deprecated_password;

COMMIT;
```

#### Rollback script

```sql
BEGIN;

-- Remove new columns
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE matches DROP COLUMN IF EXISTS tournament_format;
ALTER TABLE matches DROP COLUMN IF EXISTS video_url;
DROP TABLE IF EXISTS match_checkpoints;

-- Rename back
-- ALTER TABLE users RENAME COLUMN _deprecated_password TO hashed_password;

COMMIT;
```

#### Data migration: Python script (export) → TypeScript script (import)

Nếu cần migrate data format (ví dụ: JSON fields trong questions), dùng script:

```
scripts/
├── migrate-v3-to-v4.ts          # Main migration runner
├── migrate-users.ts             # Users: hashed_password → google_id
├── migrate-matches.ts           # Matches: add tournament_format
├── migrate-snapshot.ts          # Valkey: snapshot format update
└── verify-migration.ts          # Verify tất cả data integrity
```

#### Zero-downtime strategy

```
1. RUN migration script trên production DB (thêm columns, không drop)
2. DEPLOY v4 backend — Drizzle schema khớp với DB mới
3. VERIFY: test API, check data
4. CLEANUP: drop old tables/columns (sau 1 tuần stable)
```

---

## 4. Discord Bot — TypeScript (discord.js)

### 4.1 Consolidation: 3 bots → 1 bot

| Bot hiện tại | Responsibility | Trong v4 |
|---|---|---|
| `bgm_bot.py` | Play BGM theo phase | → **discord-bot** (voice channel management) |
| `sfx_bot.py` | Play SFX theo event | → **discord-bot** (queue-based SFX playback) |
| `ping_bot.py` | Ping/health check | → **LOẠI BỎ** (dùng `/health` endpoint) |

### 4.2 Cấu trúc `apps/discord-bot/`

```
apps/discord-bot/
├── src/
│   ├── index.ts                    # Bot entry: login, register events
│   ├── config/
│   │   └── env.ts                  # BOT_TOKEN, VOICE_CHANNEL_ID, VALKEY_*
│   ├── commands/
│   │   └── ping.ts                 # /ping command (health check)
│   ├── audio/
│   │   ├── player.ts               # AudioPlayer wrapper (createPlayer, play, stop)
│   │   ├── queue.ts                # SFX sequential queue
│   │   └── s3-sync.ts             # Download audio files from S3
│   ├── events/
│   │   ├── valkey-listener.ts      # Subscribe to Valkey pub/sub
│   │   ├── navigate.ts             # Phase intro music
│   │   ├── timer.ts                # Timer BGM + countdown SFX
│   │   └── game-events.ts          # buzer, answer, veDich powers...
│   ├── mappings/
│   │   ├── phase-music.ts          # PHASE_MUSIC_MAP (from bgm_bot)
│   │   ├── event-sfx.ts            # EVENT_SFX_MAP (from sfx_bot)
│   │   └── phase-sfx.ts            # PHASE_EVENT_SFX_MAP (from sfx_bot)
│   └── utils/
│       ├── logger.ts
│       └── sleep.ts
├── tsconfig.json
├── package.json
└── Dockerfile
```

### 4.3 Key implementation notes

- **Audio playback**: discord.js v14+ `@discordjs/voice` — same pattern as Python `discord.py`
- **SFX queue**: Dùng `p-queue` hoặc custom queue để đảm bảo SFX phát tuần tự, không overlap
- **Valkey subscription**: `ioredis` subscribe channel `{MATCH_CODE}` — cùng logic với `valkey_listener.py`
- **S3 sync**: `@aws-sdk/client-s3` — sync audio files khi bot startup
- **Env vars**: Giữ nguyên `BGM_BOT_TOKEN`, `VOICE_CHANNEL_ID`, `S3_*`, `VALKEY_*`
- **Bỏ** `SFX_BOT_TOKEN` (chỉ cần 1 token cho 1 bot)

### 4.4 Audio file structure (giữ nguyên)

```
s3://bucket/audios/
├── bgm/
│   ├── bp_30s.ogg, gm_15s.ogg, kd_bat_dau.ogg, kd_ket_thuc.ogg,
│   ├── kdc_60s.mp3, kdr_30s.mp3, vcnv_bat_dau.ogg,
│   └── vd_5s.ogg, vd_15s.mp3, vd_20s.ogg, vd_30s.mp3, vd_45s.mp3
└── sfx/
    ├── bp_dung.mp3, bp_hien_tra_loi.ogg,
    ├── gm_bat_dau.ogg, gm_chon_goi_y.ogg, gm_dung.mp3, gm_dung_tu_khoa.mp3,
    │   gm_hien_tra_loi.ogg,
    ├── kd_bat_dau.ogg, kd_dung.mp3, kd_hien_tra_loi.ogg, kd_sai.ogg,
    └── vd_dung.ogg, vd_hien_tra_loi.ogg, vd_sai.ogg
```

---

## 5. AI Agent — FastAPI Python Service (tương lai)

### 5.1 Vị trí trong kiến trúc

```
┌──────────┐   HTTP (batch)   ┌──────────┐
│  Fastify  │─────────────────►│  FastAPI  │
│  (API)    │◄─────────────────│  (AI)     │
└──────────┘                   └──────────┘
     │       ▲                       │
     │       │ pub/sub (real-time)   │
     ▼       │                       ▼
┌─────────────────────────────────────────┐
│               Valkey                     │
│  channel:{matchCode}                     │
│  Fastify ──publish──► AI (game events)   │
│  AI ──publish──► Fastify (suggestions)   │
└─────────────────────────────────────────┘
```

### 5.2 Communication pattern

| Action | Method | Direction |
|---|---|---|
| Generate questions | HTTP POST | Fastify → AI |
| Analyze match results | HTTP GET | Fastify → AI |
| Save questions to DB | HTTP POST | AI → Fastify |
| **Real-time assist** | **Valkey pub/sub** | **双向** |
| Score prediction | Pub/sub | AI → Fastify |
| Next question suggestion | Pub/sub | AI → Fastify |
| Phase recommendation | Pub/sub | AI → Fastify |

### 5.3 Real-time assist flow

```
1. Game event: Player buzz → correct
2. Fastify publish → Valkey channel:{matchCode}
3. AI agent nhận → phân tích real-time
4. AI publish suggestion → Valkey channel:{matchCode}
5. Fastify nhận → broadcast tới MC overlay
6. MC thấy suggestion: "Player A đang lead, suggest skip câu tiếp"
```

```python
# apps/ai-agent/app/services/realtime_assistant.py

async def subscribe_game_events(match_code: str):
    pubsub = valkey.pubsub()
    await pubsub.subscribe(f"events:{match_code}")
    
    async for message in pubsub.listen():
        event = json.loads(message["data"])
        suggestion = await analyze_and_suggest(event)
        
        if suggestion:
            await valkey.publish(
                f"events:{match_code}",
                json.dumps({
                    "type": "ai_suggestion",
                    "category": suggestion.category,
                    "message": suggestion.message,
                    "target": "mc",
                })
            )
```

### 5.4 Cấu trúc `apps/ai-agent/`

```
apps/ai-agent/
├── app/
│   ├── main.py                 # FastAPI entry + Valkey subscriber
│   ├── config.py               # Env-based settings
│   ├── routes/
│   │   ├── generate.py         # POST /generate — generate questions
│   │   └── analyze.py          # POST /analyze — analyze game performance
│   ├── services/
│   │   ├── llm_client.py       # Abstraction for multiple LLM providers
│   │   ├── prompt_templates.py
│   │   ├── question_gen.py
│   │   └── realtime_assistant.py  # Valkey pub/sub subscriber + suggestion engine
│   ├── models/
│   │   └── schemas.py          # Pydantic models
│   └── utils/
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## 6. Frontend — Loại Guest, Đồng bộ UI

### 6.1 Loại bỏ Guest role

**Files cần xóa:**

```
frontend/src/routes/GuestRoutes.tsx
frontend/src/contexts/GuestWebSocketContext.tsx
frontend/src/pages/guest/GBasePageLayout.tsx
frontend/src/pages/guest/GButPhaPage.tsx
frontend/src/pages/guest/GGameAccessPage.tsx
frontend/src/pages/guest/GGiaiMaPage.tsx
frontend/src/pages/guest/GKhoiDongChungPage.tsx
frontend/src/pages/guest/GKhoiDongRiengPage.tsx
frontend/src/pages/guest/GQualifierPage.tsx
frontend/src/pages/guest/GVeDichChungPage.tsx
frontend/src/pages/guest/GVeDichPickPage.tsx
frontend/src/pages/guest/GVeDichRiengPage.tsx
frontend/src/pages/guest/GWaitingPage.tsx
```

**Files cần sửa:**

- `App.tsx`: Xóa `<Route path="/guest/*">` và `GuestRoutes` import
- `App.tsx`: Xóa `/player/signup` route (chỉ giữ `/admin/signup` nếu cần, hoặc chuyển sang Google OAuth)
- Backend `RoleEnum`: Bỏ giá trị `guest`

### 6.2 Google Authentication UI

```
frontend/src/pages/auth/
├── LoginPage.tsx              # Button "Sign in with Google" (bỏ form password)
├── AuthCallbackPage.tsx       # NEW — handle /auth/google/callback redirect
├── BaseAuthLayout.tsx         # Simplify (chỉ hiển thị Google button)
├── ResetPasswordPage.tsx      # XÓA
└── SignupPage.tsx             # XÓA (hoặc giữ cho admin invite flow)
```

**Login page mockup:**

```
┌──────────────────────────────────┐
│                                  │
│     🏆 Olympia Custom 3         │
│                                  │
│     ┌──────────────────────┐     │
│     │  Sign in with Google  │     │
│     └──────────────────────┘     │
│                                  │
│     (hoặc admin login riêng)     │
│                                  │
└──────────────────────────────────┘
```

**Thay đổi auth flow:**
- Bỏ `localStorage.getItem("jwtToken_admin")` / `sessionStorage.getItem("jwtToken_player")` pattern
- Cookie chỉ chứa `sid` (session ID) → httpOnly, secure, SameSite=Lax
- `GET /api/auth/me` đọc cookie → lookup Valkey → trả về user info
- Bỏ `ProtectedPlayerRoute` check localStorage → dùng `<AuthGuard />` component gọi `/api/auth/me`
- **Ưu điểm**: Admin có thể force-logout player bằng cách xóa session key trong Valkey

### 6.3 Đồng bộ UI structure Player/MC theo Admin

**Mục tiêu**: Player và MC pages có cùng base layout pattern với Admin.

**Admin base layout hiện tại (`ABasePageLayout.tsx`)**:
- Header bar với match info
- Navigation tabs theo phase
- Content area
- Footer/status bar

**Changes:**

#### 6.3.1 Refactor thành shared layout components

```
frontend/src/components/
├── layouts/
│   ├── BaseGameLayout.tsx         # NEW — shared layout wrapper
│   ├── HeaderBar.tsx              # NEW — match code, round name, connection status
│   ├── PhaseNavigation.tsx        # NEW — tab navigation between phases
│   ├── FooterStatus.tsx           # NEW — player count, timer, connection indicator
│   └── ConnectionBadge.tsx        # NEW — WebSocket connection status indicator
├── game/
│   ├── QuestionCard.tsx           # Shared question display
│   ├── AnswerInput.tsx            # Shared answer input (text, buzzer, MCQ)
│   ├── TimerDisplay.tsx           # Shared countdown timer
│   ├── ScoreBoard.tsx             # Shared scoreboard
│   └── ...
└── ...
```

#### 6.3.2 New page structure (per role)

```
frontend/src/pages/
├── shared/                         # Shared page components
│   ├── KhoiDongChung/
│   │   ├── KhoiDongChungView.tsx   # Core view logic
│   │   └── KhoiDongChung.tsx       # Composite page
│   ├── ButPha/
│   ├── VeDichChung/
│   ├── VeDichRieng/
│   ├── GiaiMa/
│   ├── Qualifier/
│   └── Waiting/
├── admin/                          # Admin-specific wrappers
│   ├── AdminKhoiDongChungPage.tsx  # Wraps shared + admin controls
│   ├── AdminButPhaPage.tsx
│   └── ...
├── mc/                             # MC-specific wrappers
│   ├── MCKhoiDongChungPage.tsx     # Wraps shared + MC controls
│   ├── MCButPhaPage.tsx
│   └── ...
└── player/                         # Player-specific wrappers
    ├── PlayerKhoiDongChungPage.tsx # Wraps shared + player controls
    ├── PlayerButPhaPage.tsx
    └── ...
```

#### 6.3.3 Layout comparison

| Component | Admin | MC | Player (mới) |
|---|---|---|---|
| HeaderBar | Match code, phase, controls | Match code, phase | Match code, phase |
| PhaseNavigation | ✅ Full control | ✅ Read-only tabs | ✅ Read-only tabs |
| Question display | Full question + answer + media | Question + media (hidden answer) | Question + media (hidden answer) |
| Answer input | N/A (reads answers) | N/A | ✅ Text/buzzer/MCQ |
| Player controls | Approve/reject answers | Reveal answers, skip | Submit answer |
| Timer controls | Start/stop/reset | View only | View only |
| Scoreboard | ✅ All players | ✅ All players | ✅ Self + top players |
| FooterStatus | Player count, connection | Player count, connection | Self connection status |

#### 6.3.4 WebSocket contexts — refactor

**Hiện tại**: 3 contexts riêng biệt (`AdminWebSocketContext`, `PlayerWebSocketContext`, `MCWebSocketContext`) với code gần như trùng lặp.

**Mục tiêu**: 1 `GameWebSocketContext` duy nhất, role-based behavior thông qua config.

```typescript
// frontend/src/contexts/GameWebSocketContext.tsx
interface GameWebSocketConfig {
  role: 'admin' | 'mc' | 'player'
  token: string
  matchCode: string
  // Role-specific behavior
  onNavigate?: (path: string) => void
  requestPresence?: boolean
  heartbeatInterval?: number  // Player: 15s, Admin: 30s
}

export function GameWebSocketProvider({ config, children }: { config: GameWebSocketConfig; children: ReactNode }) {
  // Single WebSocket implementation
  // Role-based message filtering
  // Unified connection management
}
```

### 6.4 Route restructuring

```typescript
// frontend/src/App.tsx (v4)
<Routes>
  <Route path="/" element={<Navigate to="/login" replace />} />
  <Route path="/login" element={<LoginPage />} />
  <Route path="/auth/google/callback" element={<AuthCallbackPage />} />

  {/* Protected routes — cookie-based auth */}
  <Route element={<AuthGuard />}>
    <Route path="/admin/*" element={<AdminRoutes />} />
    <Route path="/mc/*" element={<MCRoutes />} />
    <Route path="/player/*" element={<PlayerRoutes />} />
  </Route>

  {/* Spectator — public hoặc anonymous session */}
  <Route path="/spectator/*" element={<SpectatorRoutes />} />
</Routes>
```

**Guest routes**: XÓA hoàn toàn. Spectator thay thế.

### 6.5 Spectator mode

Spectator = Guest đã upgrade — xem realtime + replay match. Trải nghiệm giống **xem game show**: video stream + scoreboard + kết quả.

#### Live view layout

```
┌─────────────────────────────────────────────────┐
│  VIDEO / LIVE STREAM                            │
│  ┌───────────────────────────────────────────┐  │
│  │          [YouTube / Facebook embed]       │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────┬────────────────────┐  │
│  │  SCOREBOARD          │  ROUND INFO        │  │
│  │  🥇 Player A  250   │  Phase: Bứt Phá    │  │
│  │  🥈 Player B  200   │  Q: OC3_Q_BP_003  │  │
│  │  🥉 Player C  150   │  ⏱️ 12s            │  │
│  │  4️⃣ Player D  100   │                    │  │
│  ├──────────────────────┴────────────────────┤  │
│  │  LATEST ACTION                            │  │
│  │  Player A buzz → ✓ Correct +50           │  │
│  │  Player C buzz → ✗ Wrong -5              │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

#### Video sources

| Source | Embed method | Ghi chú |
|---|---|---| 
| **YouTube Live** | YouTube IFrame API | Primary (OBS → YouTube Live) |
| **Không có video** | — | Chỉ hiện scoreboard + action feed |

#### Video URL flow

```
1. Admin tạo match (KHÔNG cần video URL)
2. Match created → waiting room
3. Admin bật OBS → stream lên YouTube Live
4. Admin copy YouTube live URL → paste vào match settings
5. Spectator xem: video + scoreboard real-time
```

**Video URL là optional, edit sau khi tạo match:**
```
PUT /api/matches/:code
→ { videoUrl: "https://youtube.com/watch?v=ABC123" }
```

**Admin UI:** Match settings panel có nút "Add Stream URL" → paste link YouTube → save

#### YouTube integration (OBS → YouTube Live)

```typescript
// VideoEmbed.tsx — Simple YouTube embed

interface VideoEmbedProps {
  videoUrl: string | null  // https://youtube.com/watch?v=ABC123
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match?.[1] ?? null
}

export function VideoEmbed({ videoUrl }: VideoEmbedProps) {
  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null

  if (!videoId) {
    return (
      <div className="aspect-video bg-gray-900 flex items-center justify-center">
        <span className="text-gray-500">Không có video stream</span>
      </div>
    )
  }

  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
      className="w-full aspect-video"
      allow="autoplay; encrypted-media"
      allowFullScreen
    />
  )
}
```

#### Frontend structure

```
frontend/src/pages/spectator/
├── SMatchListPage.tsx          # Chọn match (live + history)
├── SLiveMatchPage.tsx          # Live view
│   ├── VideoEmbed.tsx          # YouTube / Facebook player
│   ├── LiveScoreboard.tsx      # Real-time scores (animated)
│   ├── ActionFeed.tsx          # Latest actions stream
│   └── RoundInfo.tsx           # Current phase + timer
├── SReplayMatchPage.tsx        # Replay view
│   ├── VideoReplay.tsx         # Video player + timestamp sync
│   ├── PhaseTimeline.tsx       # Step through phases
│   └── ScoreTimeline.tsx       # Score progression chart
└── SMatchHistoryPage.tsx       # Past matches + video links
```

#### Scoreboard animation

- Number counter animation (0 → 250 trong 0.5s)
- Buzz highlight effect (player glow khi buzz)
- Answer reveal: green flash (correct) / red flash (wrong)

#### Spectator flow

```
1. Spectator vào /spectator → xem danh sách matches
2. Click match đang live → /spectator/live/:matchCode
   - Join WebSocket room (role: "spectator")
   - Video embed (YouTube/Facebook hoặc ẩn nếu không có)
   - Live scoreboard + action feed (real-time từ WebSocket)
   - Auto-navigate theo admin (giống player)
3. Click match đã kết thúc → /spectator/replay/:matchCode
   - Video replay (YouTube/Facebook embed)
   - Step through phases bằng timeline controls
   - Score progression chart
```

#### Backend

- Spectator角色 trong WebSocket — read-only
- `SPECTATOR_ALLOWED_TYPES`: navigate, buzzer_winner, answer_result, player_score_updated, round_start/end, send_question, timer_update, match_state
- API endpoints:
  - `GET /api/matches/:code/stream-info` — video URL, type, match status
  - `GET /api/matches/:code/history` — match results + video URLs
- Spectator không cần auth (public) hoặc anonymous session
- `matches` table: `video_url` field lưu YouTube/Facebook URL

### 6.6 Match history

```
GET /api/matches                  # List matches (with status, date)
GET /api/matches/:code            # Match detail (scores, participants)
GET /api/matches/:code/history    # Full history (phase-by-phase results)
GET /api/matches/:code/video      # Video URLs (if recorded)
```

**DB — matches table đã có đủ data** (scores trong `records` table, participants trong `match_player_positions`).

**Video:**
- YouTube Live / Facebook Live URL
- Lưu trong `matches.video_url` field
- Frontend embed bằng YouTube iframe / Facebook video plugin
- Khi match kết thúc, video auto-switch sang replay

### 6.7 Responsive design — Mobile + Tablet

**Target devices:**

| Device | Users | Orientation |
|---|---|---|
| **Mobile (< 768px)** | Spectator xem kết quả | Portrait |
| **Tablet (768px - 1024px)** | Player, MC, Admin (iPad) | Landscape |
| **Desktop (> 1024px)** | Admin dashboard | Any |

**Mobile (spectator):**
- Responsive layout — auto-stack columns
- Match list: cards, swipe để xem nhanh
- Scoreboard: vertical layout, large numbers
- Không cần interactions phức tạp — chỉ xem

**Tablet (iPad — player/MC/admin):**
- Landscape mode optimized
- Touch targets lớn (nút buzzer > 48px, answer input宽敞)
- Bottom navigation bar (thumb-friendly)
- Scoreboard always visible
- MC: swipe gestures để chuyển câu (optional)

**CSS strategy:**
```css
/* Tailwind responsive breakpoints */
/* Mobile-first approach */

/* Spectator mobile */
@media (max-width: 767px) { /* ... */ }

/* Tablet (iPad) */
@media (min-width: 768px) and (max-width: 1024px) { /* ... */ }

/* Desktop */
@media (min-width: 1025px) { /* ... */ }
```

### 6.8 OBS Overlay — Browser Source

Overlay = web page.render game data lên OBS stream. MC trên máy local dùng OBS Browser Source trỏ vào URL VPS.

#### Architecture

```
┌─────────────────────────┐          ┌──────────┐
│  MC's LOCAL MACHINE     │          │   VPS    │
│                         │          │          │
│  ┌──────┐  ┌─────────┐  │   WS     │ Fastify  │
│  │ OBS  │──│ Browser │───────────►│ API      │
│  │      │  │ Source  │  │          │          │
│  └──────┘  └─────────┘  │          │          │
│       │                 │          │          │
│  ┌──────┐              │          │          │
│  │Admin │──────────────┼──────────►│ WebSocket│
│  │Panel │   HTTP/WS    │          │          │
│  └──────┘              │          │          │
└─────────────────────────┘          └──────────┘
```

#### Overlay URLs

```
https://{DOMAIN}/overlay/{matchCode}?type=scoreboard
https://{DOMAIN}/overlay/{matchCode}?type=timer
https://{DOMAIN}/overlay/{matchCode}?type=player-bar
https://{DOMAIN}/overlay/{matchCode}?type=question
https://{DOMAIN}/overlay/{matchCode}?type=all
```

#### Overlay types

| Type | Hiển thị | OBS Size | Ghi chú |
|---|---|---|---|
| `scoreboard` | Bảng điểm real-time | 300x400 | Top-right corner |
| `timer` | Đồng hồ đếm ngược lớn | 200x200 | Center hoặc top |
| `player-bar` | Tên thí sinh + trạng thái | 800x60 | Bottom bar |
| `question` | Câu hỏi hiện tại | 600x200 | Center |
| `all` | Tổng hợp tất cả | 400x600 | Full overlay |

#### Design requirements

- **Background: transparent** — không có background, chỉ text + elements
- **Font lớn, rõ** — đọc được trên stream (minimum 24px)
- **Color contrast** — trắng/đổ trên nền tối, hoặc có text shadow
- **Animation mượt** — score counter animation, timer smooth countdown
- **Không che video** — compact layout, positioned ở corners
- **Responsive** — tự adjust theo OBS Browser Source size

#### Frontend structure

```
frontend/src/pages/overlay/
├── OverlayScoreboard.tsx    # Bảng điểm real-time
├── OverlayTimer.tsx         # Đồng hồ đếm ngược
├── OverlayPlayerBar.tsx     # Player bar (tên + trạng thái)
├── OverlayQuestion.tsx      # Question display
└── OverlayAll.tsx           # Tổng hợp
```

#### Shared QuestionCard — DRY原则

QuestionCard là component duy nhất dùng cho admin, player, MC, và overlay:

```typescript
// components/game/QuestionCard.tsx

interface QuestionCardProps {
  question: QuestionData
  mode: 'admin' | 'player' | 'mc' | 'overlay'
  showAnswer?: boolean
  media?: MediaData
}

export function QuestionCard({ question, mode, showAnswer, media }: QuestionCardProps) {
  return (
    <div className={cn(
      'rounded-xl',
      mode === 'overlay' && 'bg-transparent text-white text-shadow',
      mode !== 'overlay' && 'bg-white shadow-lg',
    )}>
      <p className={cn(
        mode === 'overlay' ? 'text-3xl font-bold' : 'text-lg',
      )}>
        {question.content}
      </p>

      {media && <QuestionMedia media={media} mode={mode} />}

      {showAnswer && mode !== 'overlay' && (
        <div className="text-green-600 font-bold mt-4">{question.answer}</div>
      )}

      {question.options && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          {question.options.map((opt, i) => (
            <div key={i} className={cn(
              'p-3 rounded-lg',
              mode === 'overlay' ? 'bg-white/20 text-white' : 'bg-gray-100',
            )}>{opt}</div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Mode comparison:**

| Mode | Background | Font | Answer visible | Used by |
|---|---|---|---|---|
| `admin` | white + shadow | text-lg | ✅ | Admin pages |
| `player` | white + shadow | text-lg | ❌ (hidden) | Player pages |
| `mc` | white + shadow | text-lg | ✅ | MC pages |
| `overlay` | transparent | text-3xl bold | ❌ | OBS Browser Source |

#### Overlay pages — reuse shared components

```typescript
// pages/overlay/OverlayQuestion.tsx
export function OverlayQuestion() {
  const { matchCode } = useParams()
  const { lastMessage } = useOverlayWebSocket(matchCode)
  const [question, setQuestion] = useState<QuestionData | null>(null)

  useEffect(() => {
    if (lastMessage?.type === 'send_question') setQuestion(lastMessage.question)
    if (lastMessage?.type === 'clear_question') setQuestion(null)
  }, [lastMessage])

  if (!question) return null  // transparent khi không có câu hỏi

  return (
    <div className="bg-transparent p-8">
      <QuestionCard question={question} mode="overlay" media={question.media} />
    </div>
  )
}

// pages/overlay/OverlayScoreboard.tsx
export function OverlayScoreboard() {
  const { lastMessage } = useOverlayWebSocket(useParams().matchCode)
  const [scores, setScores] = useState<PlayerScore[]>([])

  useEffect(() => {
    if (lastMessage?.type === 'player_score_updated') setScores(lastMessage.scoreboard)
  }, [lastMessage])

  return (
    <div className="bg-transparent p-4 font-bold text-white text-shadow">
      {scores.map((p, i) => (
        <div key={p.userCode} className="flex justify-between text-2xl">
          <span>{RANK_ICONS[i]} {p.userName}</span>
          <span className="tabular-nums">{p.score}</span>
        </div>
      ))}
    </div>
  )
}
```

#### OBS Browser Source setup

```
1. OBS → Sources → Browser Source
2. URL: https://olympia-custom.io.vn/overlay/OC3_M_VL?type=scoreboard
3. Width: 300, Height: 400
4. ✅ Shutdown source when not visible
5. ✅ Refresh browser when scene becomes active
6. Position: top-right corner của scene
```

#### Admin panel — overlay URLs

```typescript
// Admin match settings panel
// Hiển thị overlay URLs để MC copy vào OBS

const overlayUrls = {
  scoreboard: `${BASE_URL}/overlay/${matchCode}?type=scoreboard`,
  timer:      `${BASE_URL}/overlay/${matchCode}?type=timer`,
  playerBar:  `${BASE_URL}/overlay/${matchCode}?type=player-bar`,
  question:   `${BASE_URL}/overlay/${matchCode}?type=question`,
}

// MC click copy → paste vào OBS Browser Source
```

#### MC workflow

```
1. MC mở admin panel trên VPS (browser)
2. MC mở OBS trên máy local
3. MC thêm Browser Sources (scoreboard, timer, player-bar)
4. MC điều khiển game qua admin panel
5. Overlay tự update qua WebSocket → hiện trên stream
6. OBS ghi hình/video → YouTube Live
7. Spectator xem trên website
```

---

## 7. Docker Compose mới

```yaml
services:
  # ── Database ──
  postgresql:
    image: postgres:17.5-bullseye
    # ... (giữ nguyên)

  # ── Cache + PubSub ──
  valkey:
    image: valkey/valkey:9-alpine
    # ... (giữ nguyên)

  # ── Fastify API (TypeScript) ──
  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    # Replaces: app (FastAPI Python)
    depends_on: [postgresql, valkey]

  # ── React Frontend ──
  frontend:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
    depends_on: [api]

  # ── Discord Bot (TypeScript) — SINGLE BOT ──
  discord-bot:
    build:
      context: .
      dockerfile: docker/bot.Dockerfile
    # Replaces: bgm-bot + sfx-bot + ping-bot (3 containers → 1)
    depends_on: [valkey]

  # ── AI Agent (FastAPI Python) — FUTURE ──
  # ai-agent:
  #   build:
  #     context: .
  #     dockerfile: docker/ai-agent.Dockerfile
  #   depends_on: [api]

  # ── Reverse Proxy ──
  nginx:
    image: nginx:1.27-alpine
    # ... (giữ nguyên)

  # ── TLS ──
  certbot:
    image: certbot/certbot:latest
    # ... (giữ nguyên)
```

**Services removed:**
- `bgm-bot` (Python) → merged into `discord-bot`
- `sfx-bot` (Python) → merged into `discord-bot`
- `ping-bot` (Python) → removed entirely

---

## 8. Monitoring — Prometheus + Grafana

### 8.1 Architecture

```
┌──────────┐    scrape    ┌───────────┐    query    ┌─────────┐
│ Fastify  │─────────────►│ Prometheus│◄────────────│ Grafana │
│ (metrics)│              │           │             │         │
└──────────┘              └───────────┘             └─────────┘
      │                         ▲
      │                         │ scrape
      ▼                         ▼
┌──────────┐              ┌──────────┐
│ Valkey   │              │ Postgres │
└──────────┘              └──────────┘
```

### 8.2 Docker services

```yaml
# docker-compose.yaml — thêm vào

prometheus:
  container_name: olympia-prometheus
  image: prom/prometheus:latest
  volumes:
    - ./configs/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus
  ports:
    - "9090:9090"
  networks:
    - olympia-network

grafana:
  container_name: olympia-grafana
  image: grafana/grafana:latest
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
  volumes:
    - grafana_data:/var/lib/grafana
    - ./deploy/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    - ./deploy/grafana/datasources:/etc/grafana/provisioning/datasources:ro
  ports:
    - "3001:3000"
  networks:
    - olympia-network
```

### 8.3 Prometheus config

```yaml
# configs/prometheus.yml

scrape_configs:
  - job_name: 'fastify-api'
    static_configs:
      - targets: ['app:8000']
    metrics_path: '/metrics'

  - job_name: 'valkey'
    static_configs:
      - targets: ['valkey:6379']
    # Use redis_exporter hoặc valkey exporter

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### 8.4 Fastify metrics — `@fastify/prometheus`

```typescript
// plugins/prometheus.ts
import FastifyPrometheus from '@fastify/prometheus'

export async function registerPrometheus(app: FastifyInstance) {
  await app.register(FastifyPrometheus, {
    endpoint: '/metrics',
    prefix: 'olympia_',
    labels: { service: 'api' },
    excludeMetrics: [],
  })
}
```

### 8.5 Custom game metrics

```typescript
// metrics/game-metrics.ts
import { Registry, Counter, Gauge, Histogram } from 'prom-client'

const register = new Registry()

// ── API metrics (tự động từ @fastify/prometheus) ──
// http_requests_total, http_request_duration_seconds

// ── WebSocket metrics ──
export const wsConnections = new Gauge({
  name: 'olympia_ws_connections',
  help: 'Active WebSocket connections',
  labelNames: ['role'],
  registers: [register],
})

export const wsMessagesTotal = new Counter({
  name: 'olympia_ws_messages_total',
  help: 'Total WebSocket messages',
  labelNames: ['type', 'role'],
  registers: [register],
})

// ── Game metrics ──
export const activeMatches = new Gauge({
  name: 'olympia_active_matches',
  help: 'Currently active matches',
  registers: [register],
})

export const activePlayers = new Gauge({
  name: 'olympia_active_players',
  help: 'Currently connected players',
  registers: [register],
})

export const phaseTransitions = new Counter({
  name: 'olympia_phase_transitions_total',
  help: 'Phase transitions',
  labelNames: ['from', 'to', 'tournament'],
  registers: [register],
})

export const buzzAttempts = new Counter({
  name: 'olympia_buzz_attempts_total',
  help: 'Buzzer attempts',
  labelNames: ['correct'],
  registers: [register],
})

export const roundDuration = new Histogram({
  name: 'olympia_round_duration_seconds',
  help: 'Round duration in seconds',
  labelNames: ['phase', 'tournament'],
  buckets: [30, 60, 120, 300, 600],
  registers: [register],
})

// ── Valkey metrics ──
export const valkeyOperationDuration = new Histogram({
  name: 'olympia_valkey_operation_duration_seconds',
  help: 'Valkey operation duration',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [register],
})
```

### 8.6 Grafana dashboards

```
deploy/grafana/
├── dashboards/
│   ├── olympia-overview.json      # Tổng quan: requests, errors, latency
│   ├── olympia-websocket.json     # WebSocket: connections, messages
│   ├── olympia-game.json          # Game: matches, players, phases, buzz
│   └── olympia-infra.json         # Infra: Valkey, PostgreSQL, memory
└── datasources/
    └── prometheus.yml
```

#### Dashboard panels

**Overview dashboard:**
- Request rate (req/s)
- Error rate (4xx, 5xx)
- Response time (p50, p95, p99)
- Uptime

**WebSocket dashboard:**
- Active connections by role (admin, mc, player, spectator)
- Messages per second
- Connection duration
- Disconnect rate

**Game dashboard:**
- Active matches
- Active players
- Phase transitions per hour
- Buzz accuracy (correct/total)
- Average round duration

**Infra dashboard:**
- Valkey memory usage
- Valkey hit rate
- PostgreSQL connections
- PostgreSQL query duration
- CPU/memory usage

### 8.7 Alerts

```yaml
# configs/alerts.yml

rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "High error rate on API"

  - alert: WebSocketFlood
    expr: rate(olympia_ws_messages_total[1m]) > 1000
    for: 1m
    labels:
      severity: warning
    annotations:
      summary: "WebSocket message flood detected"

  - alert: ValkeyDown
    expr: up{job="valkey"} == 0
    for: 30s
    labels:
      severity: critical
    annotations:
      summary: "Valkey is down"

  - alert: HighLatency
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "API p95 latency > 1s"
```

---

## 9. Deployment plan (phases)

### Phase 0: Preparation + Migration script (2-3 ngày)
- [ ] Backup database hoàn toàn (`pg_dump`)
- [x] Set up monorepo structure (pnpm workspaces + Turborepo)
- [x] Initialize `packages/shared` and `packages/db` — `packages/db` ✅, `packages/shared` được tích hợp vào `@olympia/db`
- [x] Write Drizzle schema (map với v3 DB)
- [x] Write SQL migration script (thêm columns, tạo tables mới)
- [x] Write rollback script
- [ ] Test migration trên staging DB
- [ ] Verify: rows giữ nguyên, columns mới có default values

### Phase 1: Backend rewrite (5-7 ngày)
- [x] Fastify server + plugins (CORS, WebSocket, Valkey, S3)
- [x] Auth module (Google OAuth + Valkey session)
- [x] CRUD modules (user, match, question, answer, record, scoreboard)
- [x] WebSocket gateway (Valkey pub/sub)
- [x] Unified Valkey state (`snapshot:{matchCode}`)
- [x] Game engine — OC3 + OC4 (OC4 có scoring rules riêng cho KDR và Giải mã)
- [x] Media module (S3 upload/download)
- [ ] ~~Qualifier module~~ — bỏ, thêm sau
- [ ] OBS overlay endpoints
- [ ] Unit + integration tests

### Phase 2: Discord bot (1-2 ngày, parallel với Phase 1)
- [x] discord.js bot setup + login
- [x] Notification bot (ping, health check, match status updates)
- [x] Valkey listener (subscribe to match events for notifications)
- [ ] ~~BGM logic~~ — bỏ
- [ ] ~~SFX logic~~ — bỏ
- [ ] ~~S3 audio sync~~ — bỏ
- [ ] ~~Voice connection~~ — bỏ
- [ ] ~~Test all audio playback scenarios~~ — bỏ

### Phase 3: Frontend refactor (5-7 ngày)
- [ ] Google OAuth login flow
- [ ] Cookie-based auth (remove localStorage JWT)
- [ ] Delete Guest routes + pages
- [ ] Shared layout components (BaseGameLayout, HeaderBar, PhaseNavigation...)
- [ ] Unified WebSocket context (3 → 1)
- [ ] Shared QuestionCard (admin/player/mc/overlay modes)
- [ ] Rewrite Admin pages
- [ ] Rewrite MC pages
- [ ] Rewrite Player pages
- [ ] Spectator mode (live + replay + match history)
- [ ] OBS overlay (dynamic, configurable)
- [ ] Responsive design (mobile spectator + tablet player/MC/Admin)
- [ ] Test auto-navigation across all roles

### Phase 4: Migration + Deployment (2-3 ngày)
- [ ] Run SQL migration trên production DB
- [ ] Verify: tất cả data intact, columns mới hoạt động
- [ ] Deploy v4 backend (Fastify + Drizzle)
- [ ] Deploy v4 frontend
- [ ] Deploy v4 Discord bot
- [ ] Deploy Monitoring (Prometheus + Grafana)
- [ ] Smoke test all game phases
- [ ] Monitor 24-48h
- [ ] Cleanup: DROP refresh_tokens, password_reset_tokens (sau 1 tuần stable)

### Phase 5: AI Agent (future, 3-5 ngày)
- [ ] Set up FastAPI Python service
- [ ] Implement question generation endpoint
- [ ] Implement game analysis endpoint
- [ ] Implement real-time assist (Valkey pub/sub)
- [ ] Integration with Fastify API

---

## 10. Key decisions to make

| Decision | Options | Recommendation |
|---|---|---|
| Monorepo tool | Turborepo / Nx / pnpm workspaces only | **Turborepo** — lightweight, good caching |
| DB migration | Drizzle Kit push / raw SQL / custom script | **Drizzle Kit migrate** — version controlled |
| Auth storage | JWT cookies / Valkey session + cookie | **Valkey session** — easier revocation, richer session data |
| Valkey client | ioredis / node-redis | **ioredis** — better cluster support, Valkey-compatible |
| Discord audio | @discordjs/voice / play-dl | **@discordjs/voice** — official, maintained |
| Frontend router | React Router v7 / TanStack Router | **React Router v7** — minimal migration |
| Testing | Vitest / Jest | **Vitest** — native ESM, faster |

---

## 11. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WebSocket behavior differs Fastify vs FastAPI | High | Port WebSocket handler carefully, test with multiple clients |
| Google OAuth redirect URI mismatch in prod | Medium | Set up both staging + prod redirect URIs upfront |
| Audio playback latency differences (Python → TS) | Medium | Benchmark discord.js voice vs discord.py, adjust buffer sizes |
| Database migration data loss | High | Write migration script with rollback, test on staging first |
| Cookie-based auth + CORS complexity | Medium | Use `SameSite=Lax`, test cross-origin flow carefully |
| Valkey session single point of failure | High | Valkey persistence (RDB/AOF) + fallback to "please re-login" on connection loss |
| Session size limits | Low | Session object ~200 bytes, well within Valkey 512MB default |
| Drizzle ORM missing features vs SQLAlchemy | Low | Drizzle covers all OC3 use cases; raw SQL escape hatch available |
| Enum migration (roleenum guest value) | Low | Keep guest in DB enum, only remove from frontend/backend logic |
| OC3 backward compatibility | Medium | OC3 engine handles old matches, tournament_format default = 'oc3' |

---

## 12. Timeline estimate

| Phase | Duration | Dependencies |
|---|---|---|
| Phase 0: Preparation + Migration script | 2-3 ngày | — | 🟢 75% done (chưa test staging) |
| Phase 1: Backend rewrite | 5-7 ngày | Phase 0 | 🟡 80% done (chưa có overlay, tests) |
| Phase 2: Discord bot | 1-2 ngày | Phase 0 (parallel with Phase 1) | 🟢 Done |
| Phase 3: Frontend refactor | 5-7 ngày | Phase 1 |
| Phase 4: Migration + Deployment | 2-3 ngày | Phase 1, 2, 3 |
| Phase 5: AI Agent | 3-5 ngày | Phase 1 (future) |
| **Total** | **~18-26 ngày** | |

---

*Bản plan này sẽ được cập nhật khi có quyết định cụ thể.*
