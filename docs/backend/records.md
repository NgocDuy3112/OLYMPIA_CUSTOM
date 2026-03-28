# Records API

**Tag**: `Records`

Score record management endpoints with Valkey leaderboard integration.

---

## Table of Contents

- [POST `/records/`](#post-records)
- [GET `/records/`](#get-records)

---

## POST `/records/`

Record points for a user in a match.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/records/` |
| **Method** | `POST` |
| **Auth** | Admin or Player role required |
| **Content-Type** | `application/json` |

### Request Body

**Schema**: `RecordPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Match code (must start with `OC3_M`) |
| `user_code` | string | ✅ | User's code (must start with `OC_U`) |
| `question_code` | string | ✅ | Question code (must start with `OC3_Q`) |
| `points` | integer | ✅ | Points to record (must be multiple of 5) |
| `is_deleted` | boolean | ❌ | Soft delete flag (default: `false`) |

### Request Example

```bash
curl -X POST http://localhost:8000/records/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "user_code": "OC_U001",
    "question_code": "OC3_Q001",
    "points": 100,
    "is_deleted": false
  }'
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Record created successfully",
  "data": null
}
```

### Valkey Integration

When a record is created, the system updates the in-memory leaderboard:

1. **Key**: `leaderboard:{match_code}`
2. **Data Structure**: Sorted Set (ZSET)
3. **Operation**: `ZADD leaderboard:{match_code} {user_code} {points} INCR`
4. **Result**: User's score is incremented in the sorted set

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input (e.g., points not multiple of 5) |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not authorized (not admin or player) |
| `404` | Not Found Error | User, match, or question not found |
| `500` | Server Error | Database or server error |

---

## GET `/records/`

Retrieve records for a user in a match.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/records/` |
| **Method** | `GET` |
| **Auth** | Admin or Player role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code |
| `user_code` | string | ✅ | User's code |

### Request Example

```bash
curl -X GET "http://localhost:8000/records/?match_code=OC3_M001&user_code=OC_U001" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Records retrieved successfully",
  "data": [
    {
      "match_code": "OC3_M001",
      "user_code": "OC_U001",
      "question_code": "OC3_Q001",
      "points": 100,
      "is_deleted": false,
      "created_at": "2024-01-01T00:00:00Z"
    },
    {
      "match_code": "OC3_M001",
      "user_code": "OC_U001",
      "question_code": "OC3_Q002",
      "points": 50,
      "is_deleted": false,
      "created_at": "2024-01-01T00:01:00Z"
    }
  ]
}
```

### Response Fields

Each record object contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Record UUID |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp (nullable) |
| `points` | integer | Points awarded |
| `is_deleted` | boolean | Soft delete flag |
| `player_id` | string | Player UUID |
| `match_id` | string | Match UUID |
| `question_id` | string | Question UUID |

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Missing required query parameters |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not authorized (not admin or player) |
| `404` | Not Found Error | No records found |
| `500` | Server Error | Database or server error |

---

## Schemas

### RecordPostRequest

```typescript
interface RecordPostRequest {
  match_code: string;   // Must start with 'OC3_M'
  user_code: string;    // Must start with 'OC_U'
  question_code: string; // Must start with 'OC3_Q'
  points: number;       // Must be multiple of 5
  is_deleted?: boolean;
}
```

### Record Object

```typescript
interface Record {
  id: string;
  created_at: string;
  updated_at: string | null;
  points: number;
  is_deleted: boolean;
  player_id: string;
  match_id: string;
  question_id: string;
}
```

---

## Implementation Notes

### Score Calculation

- Points **must** be multiples of 5
- Records are cumulative for each user in a match
- The `is_deleted` flag allows soft deletion of records

### Valkey Leaderboard

**Key Pattern**: `leaderboard:{match_code}`

**Example**: `leaderboard:OC3_M001`

**Operations**:

| Operation | Command | Description |
|-----------|---------|-------------|
| **Add/Update** | `ZADD key {user_code} {points} INCR` | Increment score |
| **Get Score** | `ZSCORE key {user_code}` | Get cumulative score |
| **Get All** | `ZREVRANGE key 0 -1 WITHSCORES` | Get sorted leaderboard |

### Scoreboard Flow

```
POST /records/
  ↓
1. ZADD leaderboard:{match_code} {user_code} {points} INCR (Valkey)
2. INSERT INTO records (PostgreSQL)
3. PUBLISH score update to {match_code} channel (WebSocket)
```

### Leaderboard Retrieval

The `GET /scoreboard/{match_code}` endpoint:
1. Reads scores from Valkey ZSET using `ZSCORE`
2. Fetches player names from PostgreSQL
3. Assembles and returns the scoreboard

If no cache exists, players are returned with `cummulative_score: 0`.

---

## Related Files

- `backend/app/routes/record.py` - Route handlers
- `backend/app/core/record.py` - Business logic
- `backend/app/schemas/record.py` - Record schemas
- `backend/app/models/record.py` - Record model
- `backend/app/dependencies/valkey_store.py` - Valkey connection
