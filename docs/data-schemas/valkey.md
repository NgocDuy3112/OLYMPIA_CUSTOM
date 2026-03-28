# Valkey Data Schema

Detailed Valkey (Redis-compatible) data structures for the Olympia Custom quiz game application.

---

## Table of Contents

- [Overview](#overview)
- [Data Structures](#data-structures)
- [Usage Patterns](#usage-patterns)
- [Integration with PostgreSQL](#integration-with-postgresql)
- [Configuration](#configuration)
- [Operations Reference](#operations-reference)

---

## Overview

**Database**: Valkey 9 (Redis-compatible)  
**Purpose**: Real-time caching, leaderboards, WebSocket pub/sub  
**Persistence**: Optional (RDB/AOF)  
**Eviction Policy**: allkeys-lru (configurable)

### Use Cases

| Use Case | Data Structure | Key Pattern |
|----------|----------------|-------------|
| **Leaderboards** | Sorted Set (ZSET) | `leaderboard:{match_code}` |
| **Answer Cache** | String | `answer:{match}:{user}:{question}` |
| **Pub/Sub** | Channel | `{match_code}` |
| **Session Data** | Hash | `session:{user_code}` |

---

## Data Structures

### Leaderboard Sorted Set

**Key Pattern**: `leaderboard:{match_code}`

**Example**: `leaderboard:OC3_M001`

#### Structure

| Property | Value |
|----------|-------|
| **Type** | Sorted Set (ZSET) |
| **Members** | User codes (e.g., `OC_U001`) |
| **Scores** | Cumulative integer points |

#### Operations

| Operation | Command | Complexity | Description |
|-----------|---------|------------|-------------|
| **Add/Update** | `ZADD key {score} {member} INCR` | O(log N) | Increment score |
| **Get Score** | `ZSCORE key {member}` | O(1) | Get player score |
| **Get All** | `ZREVRANGE key 0 -1 WITHSCORES` | O(log N + M) | Get leaderboard |
| **Get Rank** | `ZREVRANK key {member}` | O(log N) | Get player rank |
| **Count** | `ZCARD key` | O(1) | Count players |
| **Exists** | `EXISTS key` | O(1) | Check if exists |

#### Example

```bash
# Add 100 points to player OC_U001
ZADD leaderboard:OC3_M001 100 "OC_U001" INCR

# Get player's score
ZSCORE leaderboard:OC3_M001 "OC_U001"
# Output: "100"

# Get top 3 players
ZREVRANGE leaderboard:OC3_M001 0 2 WITHSCORES
# Output:
# 1) "OC_U001"
# 2) "250"
# 3) "OC_U002"
# 4) "200"
# 5) "OC_U003"
# 6) "150"

# Get player's rank
ZREVRANK leaderboard:OC3_M001 "OC_U001"
# Output: (integer) 0  (0-based index)
```

#### Lifecycle

- **Created**: When first record is added via `POST /records/`
- **Updated**: On every score change
- **Cleared**: On match completion (manual or automatic)

---

### Answer Cache String

**Key Pattern**: `answer:{match_code}:{user_code}:{question_code}`

**Example**: `answer:OC3_M001:OC_U001:OC3_Q001`

#### Structure

| Property | Value |
|----------|-------|
| **Type** | String |
| **Value** | JSON object with answer details |

#### Example Value

```json
{
  "type": "answer",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "match_code": "OC3_M001",
  "answer_text": "Hanoi",
  "has_buzzed": true,
  "timestamp": 12.490
}
```

#### Operations

| Operation | Command | Description |
|-----------|---------|-------------|
| **Set** | `SET key {json}` | Store answer |
| **Get** | `GET key` | Retrieve answer |
| **Delete** | `DEL key` | Remove answer |
| **Exists** | `EXISTS key` | Check if cached |
| **Expire** | `EXPIRE key {seconds}` | Set TTL |

#### Example

```bash
# Store answer
SET answer:OC3_M001:OC_U001:OC3_Q001 '{"type":"answer","user_code":"OC_U001",...}'

# Retrieve answer
GET answer:OC3_M001:OC_U001:OC3_Q001
# Output: "{\"type\":\"answer\",\"user_code\":\"OC_U001\",...}"

# Set expiration (5 minutes)
EXPIRE answer:OC3_M001:OC_U001:OC3_Q001 300

# Delete answer
DEL answer:OC3_M001:OC_U001:OC3_Q001
```

#### Lifecycle

- **Created**: When answer is submitted via `POST /answers/`
- **Read**: When answer is retrieved via `GET /answers/`
- **Deleted**: When answer is deleted or match ends

---

### Pub/Sub Channels

**Channel Pattern**: `{match_code}`

**Example**: `OC3_M001`

#### Structure

| Property | Value |
|----------|-------|
| **Type** | Channel |
| **Messages** | Raw JSON objects (not wrapped) |

#### Example Message

```json
{
  "type": "answer",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "match_code": "OC3_M001",
  "answer_text": "Hanoi",
  "has_buzzed": false,
  "timestamp": 12.490
}
```

#### Operations

| Operation | Command | Description |
|-----------|---------|-------------|
| **Publish** | `PUBLISH channel {message}` | Send to subscribers |
| **Subscribe** | `SUBSCRIBE channel` | Subscribe to channel |
| **Unsubscribe** | `UNSUBSCRIBE channel` | Unsubscribe |

#### Example

```bash
# Subscribe to match channel (in WebSocket server)
SUBSCRIBE OC3_M001

# Publish message to all subscribers
PUBLISH OC3_M001 '{"type":"answer","user_code":"OC_U001",...}'

# Unsubscribe
UNSUBSCRIBE OC3_M001
```

#### Multi-Instance Sync

For multi-instance deployments, messages include metadata to prevent loops:

```json
{
  "__origin": "instance-1",
  "__payload": {
    "type": "answer",
    "user_code": "OC_U001",
    ...
  }
}
```

---

### Session Hash (Optional)

**Key Pattern**: `session:{user_code}`

**Example**: `session:OC_U001`

#### Structure

| Property | Value |
|----------|-------|
| **Type** | Hash |
| **Fields** | Session metadata |

#### Example Fields

```
HSET session:OC_U001
  user_code "OC_U001"
  user_name "Nguyen Van A"
  role "player"
  match_code "OC3_M001"
  connected_at "2024-01-01T00:00:00Z"
  last_seen "2024-01-01T00:05:00Z"
```

#### Operations

| Operation | Command | Description |
|-----------|---------|-------------|
| **Set Field** | `HSET key {field} {value}` | Set field |
| **Get Field** | `HGET key {field}` | Get field |
| **Get All** | `HGETALL key` | Get all fields |
| **Delete** | `DEL key` | Remove session |
| **Expire** | `EXPIRE key {seconds}` | Set TTL |

---

## Usage Patterns

### Scoring Flow

```
POST /records/
        ↓
1. ZADD leaderboard:{match} {user} {points} INCR (Valkey)
2. INSERT INTO records (PostgreSQL)
3. PUBLISH to {match} channel (Valkey → WebSocket)
```

### Answer Submission Flow

```
POST /answers/
        ↓
1. SET answer:{match}:{user}:{question} (Valkey)
2. PUBLISH answer to {match} channel (Valkey → WebSocket)
3. INSERT INTO answers (PostgreSQL)
```

### Scoreboard Retrieval Flow

```
GET /scoreboard/{match_code}
        ↓
1. Check EXISTS leaderboard:{match} (Valkey)
2. FOR EACH player:
   - ZSCORE leaderboard:{match} {user} (Valkey)
   - SELECT user_name FROM users (PostgreSQL)
3. Return aggregated scoreboard
```

### WebSocket Broadcast Flow

```
Client sends message
        ↓
Server receives via WebSocket
        ↓
PUBLISH to {match_code} channel (Valkey)
        ↓
All subscribers receive message
        ↓
Forward to connected WebSocket clients
```

---

## Integration with PostgreSQL

### Cache-Aside Pattern

```python
async def get_answer(match_code, user_code, question_code):
    # 1. Try cache first
    cache_key = f"answer:{match_code}:{user_code}:{question_code}"
    cached = await valkey.get(cache_key)
    
    if cached:
        return json.loads(cached)
    
    # 2. Cache miss - query database
    answer = await db.execute(
        select(Answer).where(...)
    )
    
    # 3. Populate cache
    if answer:
        await valkey.set(cache_key, json.dumps(answer))
    
    return answer
```

### Write-Through Pattern

```python
async def record_points(match_code, user_code, points):
    # 1. Update cache (leaderboard)
    leaderboard_key = f"leaderboard:{match_code}"
    await valkey.zadd(leaderboard_key, {user_code: points}, incr=True)
    
    # 2. Persist to database
    record = Record(
        match_code=match_code,
        user_code=user_code,
        points=points
    )
    db.add(record)
    await db.commit()
    
    # 3. Broadcast update
    await valkey.publish(
        match_code,
        json.dumps({
            "type": "player_score_updated",
            "user_code": user_code,
            "new_total_score": new_score
        })
    )
```

---

## Configuration

### Connection Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Host** | `localhost` | Valkey server hostname |
| **Port** | `6379` | Valkey server port |
| **Username** | `default` | Authentication username |
| **Password** | - | Authentication password |
| **Database** | `0` | Database number |
| **Timeout** | `5s` | Connection timeout |
| **Retry** | Enabled | Retry on timeout |

### Memory Management

| Parameter | Recommended | Description |
|-----------|-------------|-------------|
| **maxmemory** | `256mb` | Maximum memory usage |
| **maxmemory-policy** | `allkeys-lru` | Eviction policy |
| **Timeout** | `300s` | Idle connection timeout |

### Persistence (Optional)

| Parameter | Recommended | Description |
|-----------|-------------|-------------|
| **RDB** | Enabled | Snapshot persistence |
| **AOF** | Optional | Append-only file |
| **Save Points** | 900s/1, 300s/10, 60s/10000 | RDB save conditions |

---

## Operations Reference

### Leaderboard Operations

```bash
# Add/increment score
ZADD leaderboard:OC3_M001 100 "OC_U001" INCR

# Get score
ZSCORE leaderboard:OC3_M001 "OC_U001"

# Get top N players
ZREVRANGE leaderboard:OC3_M001 0 N-1 WITHSCORES

# Get player rank
ZREVRANK leaderboard:OC3_M001 "OC_U001"

# Get player count
ZCARD leaderboard:OC3_M001

# Delete leaderboard
DEL leaderboard:OC3_M001
```

### Answer Cache Operations

```bash
# Set answer
SET answer:OC3_M001:OC_U001:OC3_Q001 '{"type":"answer",...}'

# Get answer
GET answer:OC3_M001:OC_U001:OC3_Q001

# Set with expiration
SETEX answer:OC3_M001:OC_U001:OC3_Q001 300 '{"type":"answer",...}'

# Delete answer
DEL answer:OC3_M001:OC_U001:OC3_Q001

# Check existence
EXISTS answer:OC3_M001:OC_U001:OC3_Q001
```

### Pub/Sub Operations

```bash
# Subscribe
SUBSCRIBE OC3_M001

# Publish
PUBLISH OC3_M001 '{"type":"answer",...}'

# Unsubscribe
UNSUBSCRIBE OC3_M001

# List channels
PUBSUB CHANNELS *
```

### General Operations

```bash
# Check key existence
EXISTS key

# Get key type
TYPE key

# Set expiration
EXPIRE key seconds

# Get TTL
TTL key

# Delete key
DEL key

# List all keys (debugging)
KEYS *

# Scan keys (production-safe)
SCAN 0 MATCH pattern* COUNT 100
```

---

## Monitoring

### Key Metrics

| Metric | Command | Description |
|--------|---------|-------------|
| **Memory Usage** | `INFO memory` | Memory consumption |
| **Connected Clients** | `INFO clients` | Active connections |
| **Ops/Second** | `INFO stats` | Throughput |
| **Keyspace** | `INFO keyspace` | Key counts by DB |
| **Slow Log** | `SLOWLOG GET` | Slow commands |

### Health Check

```bash
# Ping
PING
# Output: PONG

# Server info
INFO server

# Database size
DBSIZE
```

---

## Related Files

- `backend/app/dependencies/valkey_store.py` - Valkey connection
- `backend/app/utils/ws_connection.py` - WebSocket manager with Valkey pub/sub
