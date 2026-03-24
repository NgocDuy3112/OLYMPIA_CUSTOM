# PostgreSQL Data Schema Documentation

This document describes the PostgreSQL database schema for the Olympia Custom quiz game application. All tables use UUID primary keys and follow a consistent naming convention.

## Table Structure

### Users Table

The `users` table stores information about all users in the system.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL, INDEXED | Unique identifier for the user |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the user was created |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW(), ON UPDATE NOW() | Timestamp when the user was last updated |
| `user_code` | VARCHAR | UNIQUE, NOT NULL, INDEXED | Unique user identifier (starts with 'OC_U') |
| `user_name` | VARCHAR(100) | NOT NULL | User's display name |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `hashed_password` | VARCHAR(255) | NOT NULL | Hashed password for authentication |
| `role` | ENUM | DEFAULT 'player' | User role (guest, player, admin) |

### Matches Table

The `matches` table stores information about quiz matches.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL, INDEXED | Unique identifier for the match |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the match was created |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW(), ON UPDATE NOW() | Timestamp when the match was last updated |
| `match_code` | VARCHAR | UNIQUE, INDEXED | Unique match identifier (starts with 'OC3_M') |
| `match_name` | VARCHAR(100) | UNIQUE | Name of the match |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |

### MatchPlayerPosition Table

The `match_player_positions` table maps players to specific positions in a match.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier for the mapping |
| `match_id` | UUID | FOREIGN KEY REFERENCES matches(id) CASCADE DELETE | ID of the match |
| `player_id` | UUID | FOREIGN KEY REFERENCES users(id) | ID of the player |
| `position` | INTEGER | CHECK(position >= 1 AND position <= 4) | Position in the match (1-4) |

### Questions Table

The `questions` table stores quiz questions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL, INDEXED | Unique identifier for the question |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the question was created |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW(), ON UPDATE NOW() | Timestamp when the question was last updated |
| `question_code` | VARCHAR(25) | UNIQUE | Unique question identifier (starts with 'OC3_Q') |
| `content` | TEXT | NOT NULL | Question text |
| `answer` | TEXT | NOT NULL | Correct answer |
| `media_url` | TEXT | NULLABLE | Media URL(s) for the question |
| `explanation` | TEXT | NULLABLE | Explanation for the answer |
| `is_used` | BOOLEAN | DEFAULT FALSE | Flag indicating if question was used |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `match_id` | UUID | FOREIGN KEY REFERENCES matches(id) INDEXED | ID of the match the question belongs to |

### Answers Table

The `answers` table stores player responses to questions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL, INDEXED | Unique identifier for the answer |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the answer was submitted |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW(), ON UPDATE NOW() | Timestamp when the answer was last updated |
| `answer_text` | TEXT | NULLABLE | Player's answer text |
| `has_buzzed` | BOOLEAN | NULLABLE, DEFAULT FALSE | Flag indicating if player buzzed in |
| `timestamp` | NUMERIC(6,3) | NULLABLE | Response time in seconds |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `player_id` | UUID | FOREIGN KEY REFERENCES users(id) INDEXED | ID of the player who answered |
| `match_id` | UUID | FOREIGN KEY REFERENCES matches(id) INDEXED | ID of the match |
| `question_id` | UUID | FOREIGN KEY REFERENCES questions(id) INDEXED | ID of the question |

### Records Table

The `records` table stores scoring records for matches.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL, INDEXED | Unique identifier for the record |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the record was created |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW(), ON UPDATE NOW() | Timestamp when the record was last updated |
| `points` | INTEGER | CHECK(points % 5 = 0) | Points awarded (must be multiple of 5) |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| `player_id` | UUID | FOREIGN KEY REFERENCES users(id) INDEXED | ID of the player |
| `match_id` | UUID | FOREIGN KEY REFERENCES matches(id) INDEXED | ID of the match |
| `question_id` | UUID | FOREIGN KEY REFERENCES questions(id) INDEXED | ID of the question |

### RefreshTokens Table

The `refresh_tokens` table manages JWT refresh tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Unique identifier for the token |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the token was created |
| `token` | TEXT | UNIQUE, INDEXED | The refresh token |
| `expires_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Expiration timestamp |
| `is_revoked` | BOOLEAN | DEFAULT FALSE | Flag indicating if token was revoked |
| `user_id` | UUID | FOREIGN KEY REFERENCES users(id) CASCADE DELETE | ID of the user |

### AuditLogs Table

The `audit_logs` table maintains an immutable audit trail of key actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, UNIQUE, NOT NULL | Unique identifier for the log entry |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | Timestamp when the action occurred |
| `action_type` | ENUM | NOT NULL | Type of action performed |
| `actor_code` | VARCHAR | INDEXED | User code of the actor |
| `match_code` | VARCHAR | INDEXED | Match code related to the action |
| `target_code` | VARCHAR | INDEXED | Code of the target object |
| `details` | JSON | NOT NULL | JSON serialized context details |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft delete flag |

## Relationships

```
User ←──┐
        │
        ├── MatchPlayerPosition ──→ Match ──→ Questions
        │                                        ↓
        └── Answers ───────────────────────────────┘
        │
        └── Records (Scoring) ──────────────────────┘
        │
        └── RefreshTokens
        
Match ──→ Questions ──→ Answers
              │              ↓
              └──────────── Records

AuditLog (Immutable trail of all key actions)
```

## Constraints and Validation

- All tables use soft deletes with `is_deleted` flag
- UUID primary keys for distributed system readiness
- Timezone-aware timestamps using UTC
- Specific constraints on identifiers:
  - `user_code` must start with 'OC_U'
  - `match_code` must start with 'OC3_M'
  - `question_code` must start with 'OC3_Q'
  - Points in records must be multiples of 5
- Position in match_player_positions must be between 1 and 4