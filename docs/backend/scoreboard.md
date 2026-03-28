# Scoreboard API

**Tag**: `Scoreboard`

Leaderboard and scoreboard endpoints with Valkey integration.

---

## Table of Contents

- [GET `/scoreboard/{match_code}`](#get-scoreboardmatch_code)

---

## GET `/scoreboard/{match_code}`

Retrieve the complete leaderboard for a match.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/scoreboard/{match_code}` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code (must start with `OC3_M`) |

### Request Example

```bash
curl -X GET http://localhost:8000/scoreboard/OC3_M001 \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Scoreboard retrieved successfully",
  "data": {
    "scoreboard": [
      {
        "user_code": "OC_U001",
        "user_name": "Nguyen Van A",
        "cummulative_score": 250
      },
      {
        "user_code": "OC_U002",
        "user_name": "Tran Thi B",
        "cummulative_score": 200
      },
      {
        "user_code": "OC_U003",
        "user_name": "Le Van C",
        "cummulative_score": 150
      },
      {
        "user_code": "OC_U004",
        "user_name": "Pham Thi D",
        "cummulative_score": 100
      }
    ]
  }
}
```

### Response Fields

**Scoreboard Object**:

| Field | Type | Description |
|-------|------|-------------|
| `scoreboard` | array | Array of player score objects |

**Player Score Object**:

| Field | Type | Description |
|-------|------|-------------|
| `user_code` | string | Player's unique code |
| `user_name` | string | Player's name |
| `cummulative_score` | integer | Total accumulated score |

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## Implementation Notes

### Caching Strategy

The leaderboard uses **Valkey** (Redis-compatible) for fast, in-memory access.

**Cache Configuration**:

| Property | Value |
|----------|-------|
| **Key Pattern** | `leaderboard:{match_code}` |
| **Data Structure** | Sorted Set (ZSET) |
| **Members** | User codes (e.g., `OC_U001`) |
| **Scores** | Cumulative integer points |

### Operations

| Operation | Command | Complexity |
|-----------|---------|------------|
| **Add/Update** | `ZADD key {user_code} {points} INCR` | O(log N) |
| **Get Score** | `ZSCORE key {user_code}` | O(1) |
| **Get All** | `ZREVRANGE key 0 -1 WITHSCORES` | O(log N + M) |

### Score Updates

When a new record is created via `POST /records/`:

1. Server calls `valkey.zadd()` with `incr=True`
2. User's score is incremented in the sorted set
3. Leaderboard is automatically sorted by score

### Cache Retrieval

When `GET /scoreboard/{match_code}` is called:

1. Server checks if leaderboard exists using `EXISTS`
2. For each player in the match:
   - Read score from Valkey using `ZSCORE`
   - Fetch player name from PostgreSQL
3. Assemble and return the scoreboard

### Fallback Behavior

- If no cache exists, players are returned with `cummulative_score: 0`
- The cache is updated whenever records are created via `POST /records/`

### Performance Benefits

| Benefit | Description |
|---------|-------------|
| **O(1) Score Lookup** | `ZSCORE` provides constant-time score retrieval |
| **O(log N) Updates** | `ZADD ... INCR` efficiently updates scores |
| **Automatic Sorting** | Sorted set maintains order by score |
| **Low Latency** | In-memory operations for fast leaderboard display |

---

## Valkey Integration

### Key Pattern

```
leaderboard:{match_code}
```

**Examples**:
- `leaderboard:OC3_M001`
- `leaderboard:OC3_M002`

### Data Structure

**Type**: Sorted Set (ZSET)

**Members**: User codes (strings)

**Scores**: Cumulative points (integers)

### Example Commands

```bash
# Increment score
ZADD leaderboard:OC3_M001 "OC_U001" 100 INCR

# Get player score
ZSCORE leaderboard:OC3_M001 "OC_U001"

# Get full leaderboard (descending order)
ZREVRANGE leaderboard:OC3_M001 0 -1 WITHSCORES

# Check if leaderboard exists
EXISTS leaderboard:OC3_M001
```

---

## Score Flow

```
Player submits answer
        ↓
POST /records/ (points: 100)
        ↓
┌───────────────────────────────────┐
│ 1. ZADD leaderboard:{match}       │
│    {user_code} 100 INCR (Valkey)  │
│                                   │
│ 2. INSERT INTO records (PostgreSQL)│
│                                   │
│ 3. PUBLISH to {match} channel     │
│    (WebSocket broadcast)          │
└───────────────────────────────────┘
        ↓
GET /scoreboard/{match_code}
        ↓
Returns updated leaderboard
```

---

## Related Files

- `backend/app/routes/scoreboard.py` - Route handlers
- `backend/app/core/scoreboard.py` - Business logic
- `backend/app/dependencies/valkey_store.py` - Valkey connection
