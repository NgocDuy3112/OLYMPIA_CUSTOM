# Data Schema Reference

This document provides a comprehensive reference for the data schemas used in the Olympia Custom quiz game application, covering both PostgreSQL and Valkey components.

## Overview

The application uses a dual-database architecture:
- **PostgreSQL**: For persistent storage of user accounts, matches, questions, answers, and records
- **Valkey**: For real-time communication, temporary caching, and fast score calculations

## PostgreSQL Schema

### Tables

See detailed PostgreSQL schema documentation in [`docs/data-schemas/postgresql.md`](./postgresql.md) for complete table definitions, relationships, and constraints.

### Key Features
- All tables use UUID primary keys for distributed system readiness
- Soft delete pattern with `is_deleted` flag
- Timezone-aware timestamps using UTC
- Specific constraints on identifiers:
  - `user_code` must start with 'OC_U'
  - `match_code` must start with 'OC3_M'
  - `question_code` must start with 'OC3_Q'
  - Points in records must be multiples of 5
- Position in match_player_positions must be between 1 and 4

## Valkey Schema

### Data Structures

See detailed Valkey schema documentation in [`docs/data-schemas/valkey.md`](./valkey.md) for complete data structure definitions and usage patterns.

### Key Features
- Leaderboard sorted sets for real-time score tracking
- Answer cache strings for temporary data storage
- Pub/sub channels for real-time WebSocket communication
- Efficient data structures optimized for high-frequency operations

## Integration Patterns

### Real-time Updates
The system leverages Valkey pub/sub to provide real-time updates to WebSocket clients:
1. When a player submits an answer, it's stored in Valkey
2. The answer is published to the match's channel
3. WebSocket clients receive the update instantly

### Performance Optimization
- Leaderboard data is maintained in Valkey for fast score lookups
- Temporary answer data is cached in Valkey before persistence
- PostgreSQL handles long-term data storage and integrity

### Data Flow

```
Player Action → Valkey Operations → PostgreSQL Operations → WebSocket Broadcast
```

## Naming Conventions

### PostgreSQL
- Table names: lowercase with underscores (e.g., `match_player_positions`)
- Column names: lowercase with underscores (e.g., `match_code`)
- Constraints: descriptive names (e.g., `check_user_code_starts_with_OC_U`)

### Valkey
- Keys: colon-separated with pattern `{type}:{identifier}` (e.g., `leaderboard:OC3_M001`)
- Channels: match codes (e.g., `OC3_M001`)

## Security Considerations

- All sensitive data (passwords, tokens) are properly hashed/encrypted
- JWT tokens are managed through the refresh_tokens table
- Audit logs track all significant actions for security monitoring
- Valkey data is ephemeral and cleared appropriately

## Maintenance Guidelines

### PostgreSQL
- Regular backups of the database
- Index maintenance for frequently queried columns
- Monitoring of soft-delete patterns

### Valkey
- Monitor memory usage of sorted sets and caches
- Regular cleanup of expired keys
- Health checks on the Valkey instance