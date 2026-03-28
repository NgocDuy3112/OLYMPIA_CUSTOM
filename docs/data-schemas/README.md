# Data Schema Reference

Comprehensive reference for PostgreSQL and Valkey data schemas used in the Olympia Custom quiz game application.

---

## Table of Contents

- [Overview](#overview)
- [PostgreSQL Schema](#postgresql-schema)
- [Valkey Schema](#valkey-schema)
- [Integration Patterns](#integration-patterns)
- [Naming Conventions](#naming-conventions)
- [Security Considerations](#security-considerations)
- [Maintenance Guidelines](#maintenance-guidelines)

---

## Overview

The application uses a **dual-database architecture**:

| Database | Purpose | Technology |
|----------|---------|------------|
| **PostgreSQL** | Persistent storage | Users, matches, questions, answers, records |
| **Valkey** | Real-time operations | Caching, leaderboards, WebSocket pub/sub |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Application Layer                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌──────────────────────┐     │
│  │  PostgreSQL  │         │       Valkey         │     │
│  │  (Persistent)│         │   (In-Memory Cache)  │     │
│  │              │         │                      │     │
│  │ • Users      │         │ • Leaderboards       │     │
│  │ • Matches    │◄───────►│ • Answer Cache       │     │
│  │ • Questions  │  Sync   │ • Pub/Sub Channels   │     │
│  │ • Answers    │         │ • Session Data       │     │
│  │ • Records    │         │                      │     │
│  └──────────────┘         └──────────────────────┘     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## PostgreSQL Schema

### Tables Overview

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `users` | User accounts | `user_code` unique, starts with `OC_U` |
| `matches` | Quiz matches | `match_code` unique, starts with `OC3_M` |
| `match_player_positions` | Player assignments | Position 1-4 |
| `questions` | Quiz questions | `question_code` unique, starts with `OC3_Q` |
| `answers` | Player responses | Foreign keys to user, match, question |
| `records` | Score records | Points must be multiple of 5 |
| `refresh_tokens` | JWT refresh tokens | Unique token, expiration |
| `audit_logs` | Action audit trail | Immutable (append-only) |

### Detailed Schema

See [`docs/data-schemas/postgresql.md`](./postgresql.md) for complete table definitions.

### Key Features

- **UUID Primary Keys**: All tables use UUID for distributed system readiness
- **Soft Delete Pattern**: `is_deleted` flag instead of hard deletes
- **Timezone-Aware Timestamps**: All timestamps use UTC
- **Referential Integrity**: Foreign keys with CASCADE where appropriate
- **Check Constraints**: Validation at database level

### Identifier Constraints

| Field | Pattern | Example |
|-------|---------|---------|
| `user_code` | `OC_U*` | `OC_U001` |
| `match_code` | `OC3_M*` | `OC3_M001` |
| `question_code` | `OC3_Q*` | `OC3_Q001` |

---

## Valkey Schema

### Data Structures Overview

| Structure | Key Pattern | Type | Purpose |
|-----------|-------------|------|---------|
| **Leaderboard** | `leaderboard:{match_code}` | Sorted Set (ZSET) | Real-time scores |
| **Answer Cache** | `answer:{match}:{user}:{question}` | String | Temporary answer storage |
| **Pub/Sub Channels** | `{match_code}` | Channel | WebSocket broadcasting |

### Detailed Schema

See [`docs/data-schemas/valkey.md`](./valkey.md) for complete data structure definitions.

### Key Features

- **In-Memory Performance**: Sub-millisecond operations
- **Automatic Expiration**: TTL on cache keys
- **Atomic Operations**: INCR, ZADD with atomic guarantees
- **Pub/Sub Messaging**: Real-time event broadcasting

---

## Integration Patterns

### Real-Time Updates

```
Player submits answer
        ↓
┌───────────────────────────────────┐
│ 1. SET answer cache (Valkey)      │
│ 2. PUBLISH to channel (Valkey)    │
│ 3. INSERT to PostgreSQL           │
└───────────────────────────────────┘
        ↓
WebSocket clients receive update
```

### Score Updates

```
POST /records/ (points: 100)
        ↓
┌───────────────────────────────────┐
│ 1. ZADD leaderboard (Valkey)      │
│    INCR user score                │
│                                   │
│ 2. INSERT record (PostgreSQL)     │
│                                   │
│ 3. PUBLISH score update           │
└───────────────────────────────────┘
        ↓
GET /scoreboard reads from Valkey
```

### Leaderboard Retrieval

```
GET /scoreboard/{match_code}
        ↓
┌───────────────────────────────────┐
│ 1. ZSCORE for each player (Valkey)│
│ 2. JOIN with users (PostgreSQL)   │
│ 3. Assemble response              │
└───────────────────────────────────┘
```

### Data Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────►│  Valkey  │────►│   API    │────►│PostgreSQL│
│  Request │     │  Cache   │     │  Layer   │     │   DB     │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                                   │
                      └───────────◄───────────────────────┘
                           Read-Through Cache
```

---

## Naming Conventions

### PostgreSQL

| Element | Convention | Example |
|---------|------------|---------|
| **Table Names** | lowercase, underscores | `match_player_positions` |
| **Column Names** | lowercase, underscores | `user_code` |
| **Primary Keys** | `id` | `id` |
| **Foreign Keys** | `{table}_id` | `match_id` |
| **Constraints** | descriptive names | `check_user_code_starts_with_OC_U` |
| **Indexes** | `idx_{table}_{column}` | `idx_users_user_code` |

### Valkey

| Element | Convention | Example |
|---------|------------|---------|
| **Keys** | `{type}:{identifier}` | `leaderboard:OC3_M001` |
| **Channels** | `{match_code}` | `OC3_M001` |
| **Members** | User codes | `OC_U001` |

---

## Security Considerations

### PostgreSQL

| Aspect | Implementation |
|--------|----------------|
| **Passwords** | Hashed with bcrypt/argon2 |
| **JWT Tokens** | Stored hashed in `refresh_tokens` |
| **Audit Logs** | Immutable trail of all actions |
| **Soft Deletes** | Preserve data history |
| **Access Control** | Role-based permissions |

### Valkey

| Aspect | Implementation |
|--------|----------------|
| **Ephemeral Data** | Cache cleared on match completion |
| **No Sensitive Data** | Only non-sensitive operational data |
| **Memory Limits** | Configured maxmemory policy |
| **Access Control** | ACL-based access control |

---

## Maintenance Guidelines

### PostgreSQL

| Task | Frequency | Description |
|------|-----------|-------------|
| **Backups** | Daily | Full database backup with point-in-time recovery |
| **Vacuum** | Weekly | Reclaim storage, update statistics |
| **Index Maintenance** | Monthly | Rebuild fragmented indexes |
| **Audit Log Cleanup** | Quarterly | Archive old logs (if needed) |
| **Soft Delete Review** | Quarterly | Review and purge old deleted records |

### Valkey

| Task | Frequency | Description |
|------|-----------|-------------|
| **Memory Monitoring** | Continuous | Monitor sorted set and cache memory usage |
| **Key Expiration** | Automatic | TTL-based cleanup of expired keys |
| **Health Checks** | Continuous | Monitor Valkey instance health |
| **Persistence** | As needed | RDB/AOF snapshots for critical data |
| **Cluster Monitoring** | Continuous | If using cluster mode |

### Performance Optimization

| Database | Optimization |
|----------|--------------|
| **PostgreSQL** | Index frequently queried columns (`user_code`, `match_code`) |
| **Valkey** | Use appropriate data structures (ZSET for leaderboards) |
| **Both** | Monitor query patterns and optimize hot paths |

---

## Related Documentation

- [PostgreSQL Schema](./postgresql.md) - Detailed table definitions
- [Valkey Schema](./valkey.md) - Data structure definitions
- [Backend API](../backend/README.md) - API endpoints
- [WebSocket API](../backend/websocket.md) - Real-time communication
