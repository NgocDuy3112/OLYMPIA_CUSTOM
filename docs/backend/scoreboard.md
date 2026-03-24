# Scoreboard API

**Tag**: `Bảng xếp hạng`

This document describes the leaderboard and scoreboard endpoints.

---

## Table of Contents

- [GET `/scoreboard/{match_code}`](#get-scoreboardmatch_code)
- [Response Format](#response-format)
- [Implementation Notes](#implementation-notes)

---

## GET `/scoreboard/{match_code}`

Retrieve the complete leaderboard for a match. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/scoreboard/{match_code}` |
| **Method** | `GET` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

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

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

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

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Match not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## Response Format

### Scoreboard Object

| Field | Type | Description |
|-------|------|-------------|
| `scoreboard` | array | Array of player score objects |

### Player Score Object

| Field | Type | Description |
|-------|------|-------------|
| `user_code` | string | Player's unique code |
| `user_name` | string | Player's name |
| `cummulative_score` | integer | Total accumulated score |

---

## Implementation Notes

### Caching Strategy

The leaderboard uses Valkey (Redis-compatible) for fast, in-memory access:

- **Cache Key**: `leaderboard:{match_code}`
- **Data Structure**: Sorted Set (ZSET)
- **Member**: `user_code`
- **Score**: `cummulative_score`

### Score Updates

When a new record is created via `POST /records/`:

1. The server calls `valkey.zadd()` with `incr=True`
2. This increments the user's score in the sorted set
3. The leaderboard is automatically sorted by score

### Cache Retrieval

When `GET /scoreboard/{match_code}` is called:

1. The server reads scores from the Valkey ZSET using `ZSCORE`
2. Player names are fetched from the database
3. The scoreboard is assembled and returned

### Fallback Behavior

- If no cache exists, players are returned with `cummulative_score: 0`
- The cache is updated whenever records are created

### Performance Benefits

- O(1) score retrieval using `ZSCORE`
- O(log N) score updates using `ZADD ... INCR`
- Automatic sorting by score in the sorted set
- Low latency for leaderboard display

---

## Related Files

- `backend/app/routes/scoreboard.py` - API endpoint
- `backend/app/core/scoreboard.py` - Business logic
- `backend/app/dependencies/valkey_store.py` - Valkey connection
