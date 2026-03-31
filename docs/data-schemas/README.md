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
| `password_reset_tokens` | Password reset tokens | Unique token, expiration |
| `qualifier_advancement` | Qualifier round advancements | Tracks advanced players |
| `qualifier_records` | Qualifier-specific records | Qualifier round scores |

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

## Database Migrations

### Alembic Setup

The project uses Alembic for PostgreSQL schema migrations.

**Directory Structure**:
```
backend/app/
├── alembic/
│   ├── versions/          # Migration scripts
│   ├── env.py             # Alembic environment config
│   └── script.py.mako     # Migration template
└── alembic.ini            # Alembic configuration
```

### Creating Migrations

**Auto-generate from models**:
```bash
cd backend/app
alembic revision --autogenerate -m "Add new_column to users table"
```

**Manual migration**:
```bash
alembic revision -m "Create matches table"
```

**Edit the generated file** in `alembic/versions/`:
```python
"""Create matches table

Revision ID: abc123
Revises: def456
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'matches',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('match_code', sa.String(), nullable=False),
        sa.Column('match_name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('match_code')
    )
    op.create_index('idx_matches_match_code', 'matches', ['match_code'])

def downgrade():
    op.drop_index('idx_matches_match_code', table_name='matches')
    op.drop_table('matches')
```

### Running Migrations

**Check current version**:
```bash
alembic current
```

**Apply all migrations**:
```bash
alembic upgrade head
```

**Upgrade to specific version**:
```bash
alembic upgrade abc123
```

**Downgrade one version**:
```bash
alembic downgrade -1
```

**Downgrade to specific version**:
```bash
alembic downgrade def456
```

### Migration Best Practices

1. **Always test migrations** on a staging database first
2. **Write reversible migrations** (implement `downgrade()`)
3. **Keep migrations immutable** - never edit applied migrations
4. **Add indexes concurrently** (PostgreSQL 12+):
```python
op.create_index('idx_name', 'table', ['column'], postgresql_concurrently=True)
```

---

## Backup Strategies

### PostgreSQL Backups

#### Full Backup with pg_dump

```bash
# Backup to file
pg_dump -h localhost -U oc3_user -d oc3_db -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).dump

# Backup to compressed file
pg_dump -h localhost -U oc3_user -d oc3_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Restore**:
```bash
# From custom format
pg_restore -h localhost -U oc3_user -d oc3_db -v backup.dump

# From SQL file
gunzip -c backup.sql.gz | psql -h localhost -U oc3_user -d oc3_db
```

#### Automated Backup Script

```bash
#!/bin/bash
# backup_postgresql.sh

BACKUP_DIR="/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup
pg_dump -h localhost -U oc3_user -d oc3_db -F c -b -v -f $BACKUP_DIR/backup_$DATE.dump

# Compress old backups
find $BACKUP_DIR -name "*.dump" -mtime +1 -exec gzip {} \;

# Delete old backups
find $BACKUP_DIR -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete
```

**Cron job** (daily at 2 AM):
```cron
0 2 * * * /path/to/backup_postgresql.sh
```

### Valkey Backups

#### RDB Snapshots

Enable in `valkey.conf`:
```conf
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
```

**Manual snapshot**:
```bash
valkey-cli BGSAVE
```

#### AOF (Append-Only File)

```conf
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
```

### Disaster Recovery Plan

**Recovery Time Objective (RTO)**: < 4 hours
**Recovery Point Objective (RPO)**: < 1 hour

**Recovery Steps**:
1. Assess damage and identify last good backup
2. Provision new database server
3. Restore from backup
4. Apply WAL/AOF logs
5. Update connection strings
6. Verify data integrity
7. Resume normal operations

---

## Related Documentation

- [PostgreSQL Schema](./postgresql.md) - Detailed table definitions
- [Valkey Schema](./valkey.md) - Data structure definitions
- [Backend API](../backend/README.md) - API endpoints
- [WebSocket API](../backend/websocket.md) - Real-time communication
