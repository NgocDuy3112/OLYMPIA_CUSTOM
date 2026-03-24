# Valkey Data Schema Documentation

This document describes the Valkey (Redis-compatible) data structures used in the Olympia Custom quiz game application. All keys follow a consistent naming pattern and are used for real-time communication and temporary data storage.

## Data Structures

### Leaderboard Sorted Set

**Key Pattern**: `leaderboard:{match_code}`

**Use Case**: Real-time cumulative scores for a match

**Structure**: 
- **Type**: Sorted Set (ZSET)
- **Members**: User codes (e.g., `OC_U001`)
- **Scores**: Cumulative integer points

**Operations**:
- `ZADD leaderboard:OC3_M001 {user_code: points} INCR=True` - Incrementally adds/updates score
- `ZSCORE leaderboard:OC3_M001 OC_U001` - Retrieves a player's cumulative score
- `EXISTS leaderboard:OC3_M001` - Checks if leaderboard initialized

**Lifecycle**: Persists for the duration of a match; can be flushed on match completion

### Answer Cache String

**Key Pattern**: `answer:{match_code}:{user_code}:{question_code}`

**Use Case**: Temporary storage of player answers for WebSocket broadcast before DB commit

**Structure**:
- **Type**: String
- **Value**: JSON object containing answer details

**Example Value**:
```json
{
  "type": "answer",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "match_code": "OC3_M001",
  "answer_text": "...",
  "has_buzzed": true,
  "timestamp": 2.345
}
```

**Operations**:
- `SET answer:OC3_M001:OC_U001:OC3_Q001 {JSON object}` - Store answer
- Expires after being broadcast/consumed

### Pub/Sub Channels

**Channel Name**: `{match_code}` (e.g., `OC3_M001`)

**Use Case**: Real-time broadcasting to WebSocket clients in a match room

**Structure**:
- **Type**: Channel
- **Messages**: Raw JSON objects (not wrapped in envelope)

**Example Message**:
```json
{
  "type": "answer",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  ...
}
```

**Operations**:
- `PUBLISH OC3_M001 {JSON broadcast message}` - Send message to channel
- ConnectionManager subscribes to channels and forwards messages to connected WebSocket clients

## Usage Patterns

### Scoring Flow
```
Player submits answer → POST /records endpoint
  ↓
1. ZADD points to leaderboard:{match_code} (Valkey)
2. INSERT record into records table (PostgreSQL)
3. PUBLISH notification to {match_code} channel (Valkey) → WebSocket clients
```

### Answer Submission Flow
```
Player submits answer → POST /answers endpoint
  ↓
1. SET answer cache in Valkey
2. PUBLISH answer event to {match_code} channel (WebSocket broadcast)
3. INSERT into answers table (PostgreSQL)
```

### Scoreboard Retrieval Flow
```
Client requests scoreboard → GET /scoreboard/{match_code}
  ↓
1. QUERY match and players from PostgreSQL
2. FOR EACH player: ZSCORE from leaderboard:{match_code}
3. Return aggregated scoreboard
```

## Integration with PostgreSQL

The Valkey data structures complement PostgreSQL by:
- Providing fast real-time score lookups via sorted sets
- Enabling efficient WebSocket broadcasting through pub/sub
- Storing temporary data during processing before persistence
- Reducing database load for frequently accessed data

## Configuration

- Default 5-second timeout
- 30-second health check interval
- Socket keepalive enabled
- Retry on timeout enabled