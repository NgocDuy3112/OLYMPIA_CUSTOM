# PostgreSQL Data Schema

Detailed PostgreSQL database schema for the Olympia Custom quiz game application.

---

## Table of Contents

- [Overview](#overview)
- [Tables](#tables)
- [Relationships](#relationships)
- [Constraints](#constraints)
- [Indexes](#indexes)

---

## Overview

**Database**: PostgreSQL 17  
**ORM**: SQLAlchemy 2.0 (Async)  
**Primary Key Strategy**: UUID  
**Delete Strategy**: Soft delete (`is_deleted` flag)  
**Timestamp Strategy**: UTC with timezone awareness

---

## Tables

### users

Stores all user accounts in the system.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | User identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |
| `user_code` | VARCHAR | UNIQUE, NOT NULL | User code (starts with `OC_U`) |
| `user_name` | VARCHAR(100) | NOT NULL | Display name |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `hashed_password` | VARCHAR(255) | NOT NULL | Hashed password |
| `role` | ENUM | DEFAULT 'player' | Role: `guest`, `player`, `admin` |
| `email` | VARCHAR | NULLABLE | Email address (optional) |

**Indexes**:
- `idx_users_user_code` on `user_code`
- `idx_users_role` on `role` (partial: `WHERE is_deleted = false`)

---

### matches

Stores quiz match information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Match identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |
| `match_code` | VARCHAR | UNIQUE, NOT NULL | Match code (starts with `OC3_M`) |
| `match_name` | VARCHAR(100) | NOT NULL | Match name |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |

**Indexes**:
- `idx_matches_match_code` on `match_code`

---

### match_player_positions

Maps players to positions in a match.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Mapping identifier |
| `match_id` | UUID | FOREIGN KEY → matches(id) CASCADE DELETE | Match reference |
| `player_id` | UUID | FOREIGN KEY → users(id) | Player reference |
| `position` | INTEGER | CHECK (1-4) | Position (1-4) |

**Indexes**:
- `idx_mpp_match_id` on `match_id`
- `idx_mpp_player_id` on `player_id`

**Constraints**:
- `CHECK (position >= 1 AND position <= 4)`
- Unique constraint on `(match_id, position)`
- Unique constraint on `(match_id, player_id)`

---

### questions

Stores quiz questions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Question identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |
| `question_code` | VARCHAR(25) | UNIQUE, NOT NULL | Question code (starts with `OC3_Q`) |
| `content` | TEXT | NOT NULL | Question text |
| `answer` | TEXT | NOT NULL | Correct answer |
| `media_url` | TEXT | NULLABLE | Media URL(s) |
| `explanation` | TEXT | NULLABLE | Answer explanation |
| `is_used` | BOOLEAN | DEFAULT FALSE | Usage flag |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `match_id` | UUID | FOREIGN KEY → matches(id) | Match reference |
| `options` | JSONB | NULLABLE | Multiple choice options (Qualifier) |

**Indexes**:
- `idx_questions_question_code` on `question_code`
- `idx_questions_match_id` on `match_id`

---

### answers

Stores player responses to questions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Answer identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Submission timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |
| `answer_text` | TEXT | NULLABLE | Answer text |
| `has_buzzed` | BOOLEAN | DEFAULT FALSE | Buzz flag |
| `timestamp` | NUMERIC(6,3) | NULLABLE | Response time (seconds) |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `player_id` | UUID | FOREIGN KEY → users(id) | Player reference |
| `match_id` | UUID | FOREIGN KEY → matches(id) | Match reference |
| `question_id` | UUID | FOREIGN KEY → questions(id) | Question reference |

**Indexes**:
- `idx_answers_player_id` on `player_id`
- `idx_answers_match_id` on `match_id`
- `idx_answers_question_id` on `question_id`
- `idx_answers_player_match_question` on `(player_id, match_id, question_id)`

---

### records

Stores scoring records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Record identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |
| `points` | INTEGER | CHECK (multiple of 5) | Points awarded |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `player_id` | UUID | FOREIGN KEY → users(id) | Player reference |
| `match_id` | UUID | FOREIGN KEY → matches(id) | Match reference |
| `question_id` | UUID | FOREIGN KEY → questions(id) | Question reference |

**Indexes**:
- `idx_records_player_id` on `player_id`
- `idx_records_match_id` on `match_id`
- `idx_records_question_id` on `question_id`
- `idx_records_player_match` on `(player_id, match_id)`

**Constraints**:
- `CHECK (points % 5 = 0)`

---

### refresh_tokens

Manages JWT refresh tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Token identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `token` | TEXT | UNIQUE, NOT NULL | Hashed refresh token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Expiration timestamp |
| `is_revoked` | BOOLEAN | DEFAULT FALSE | Revocation flag |
| `user_id` | UUID | FOREIGN KEY → users(id) CASCADE DELETE | User reference |

**Indexes**:
- `idx_refresh_tokens_token` on `token`
- `idx_refresh_tokens_user_id` on `user_id`
- `idx_refresh_tokens_expires_at` on `expires_at` (for cleanup)

---

### audit_logs

Immutable audit trail of key actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Log identifier |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Action timestamp |
| `action_type` | ENUM | NOT NULL | Action type |
| `actor_code` | VARCHAR | NOT NULL | Actor's user code |
| `match_code` | VARCHAR | NULLABLE | Related match code |
| `target_code` | VARCHAR | NULLABLE | Target object code |
| `details` | JSONB | NOT NULL | Action details |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |

**Indexes**:
- `idx_audit_logs_actor_code` on `actor_code`
- `idx_audit_logs_match_code` on `match_code`
- `idx_audit_logs_created_at` on `created_at`

---

## Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                        Entity Relationship                   │
└─────────────────────────────────────────────────────────────┘

users ──┐
        │
        ├── match_player_positions ──→ matches
        │                                  │
        ├── answers ───────────────────────┤
        │                                  │
        ├── records ───────────────────────┤
        │                                  │
        └── refresh_tokens                 │
                                           │
matches ──→ questions ──→ answers ─────────┘
              │              │
              └──────────────┴──→ records

audit_logs (references all entities via codes)
```

### Relationship Details

| Relationship | Type | Constraint |
|--------------|------|------------|
| `users` → `match_player_positions` | 1:N | CASCADE DELETE |
| `matches` → `match_player_positions` | 1:N | CASCADE DELETE |
| `matches` → `questions` | 1:N | CASCADE DELETE |
| `questions` → `answers` | 1:N | CASCADE DELETE |
| `users` → `answers` | 1:N | CASCADE DELETE |
| `matches` → `answers` | 1:N | CASCADE DELETE |
| `users` → `records` | 1:N | CASCADE DELETE |
| `matches` → `records` | 1:N | CASCADE DELETE |
| `questions` → `records` | 1:N | CASCADE DELETE |
| `users` → `refresh_tokens` | 1:N | CASCADE DELETE |

---

## Constraints

### Check Constraints

| Table | Constraint | Description |
|-------|------------|-------------|
| `match_player_positions` | `position >= 1 AND position <= 4` | Valid positions |
| `records` | `points % 5 = 0` | Points must be multiple of 5 |

### Unique Constraints

| Table | Columns | Description |
|-------|---------|-------------|
| `users` | `user_code` | Unique user identifier |
| `matches` | `match_code` | Unique match identifier |
| `questions` | `question_code` | Unique question identifier |
| `refresh_tokens` | `token` | Unique refresh token |
| `match_player_positions` | `(match_id, position)` | One player per position |
| `match_player_positions` | `(match_id, player_id)` | Player once per match |

---

## Indexes

### Primary Indexes

All tables have automatic indexes on primary keys.

### Secondary Indexes

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| `users` | `idx_users_user_code` | `user_code` | Fast user lookup |
| `matches` | `idx_matches_match_code` | `match_code` | Fast match lookup |
| `questions` | `idx_questions_match_id` | `match_id` | Questions by match |
| `answers` | `idx_answers_player_match_question` | `(player_id, match_id, question_id)` | Answer lookup |
| `records` | `idx_records_player_match` | `(player_id, match_id)` | Records by player/match |
| `audit_logs` | `idx_audit_logs_created_at` | `created_at` | Time-based queries |

---

## Related Files

- `backend/app/models/` - SQLAlchemy ORM models
- `database/migrations/` - Alembic migration scripts
