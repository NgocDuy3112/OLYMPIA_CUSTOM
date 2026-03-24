# Records API

**Tag**: `Bản ghi`

This document describes the score record management endpoints.

---

## Table of Contents

- [POST `/records/`](#post-records)
- [GET `/records/`](#get-records)
- [Request Schemas](#request-schemas)
- [Response Schemas](#response-schemas)
- [Implementation Notes](#implementation-notes)

---

## POST `/records/`

Record points for a user in a match. Accessible by admin and player roles.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/records/` |
| **Method** | `POST` |
| **Authentication** | Admin or Player role required |
| **Response Format** | JSON |

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

**Status Code**: `201 Created`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Record created successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data (e.g., points not multiple of 5) |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not authorized (not admin or player) |
| `404 Not Found` | Not Found Error | User, match, or question not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## GET `/records/`

Retrieve records for a user in a match. Accessible by admin and player roles.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/records/` |
| **Method** | `GET` |
| **Authentication** | Admin or Player role required |
| **Response Format** | JSON |

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

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

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

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Missing required query parameters |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not authorized (not admin or player) |
| `404 Not Found` | Not Found Error | No records found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## Request Schemas

### RecordPostRequest

```typescript
{
  match_code: string;  // Must start with 'OC3_M'
  user_code: string;  // Must start with 'OC_U'
  question_code: string;  // Must start with 'OC3_Q'
  points: number;  // Must be multiple of 5
  is_deleted?: boolean;
}
```

---

## Response Schemas

### BaseResponse

```typescript
{
  status: "success" | "error";
  message: string;
  data?: object | array | null;
}
```

---

## Implementation Notes

### Score Calculation

- Points must be multiples of 5
- Records are cumulative for each user in a match
- The `is_deleted` flag allows soft deletion of records

### Valkey Integration

When a record is created, the system updates the in-memory leaderboard stored in Valkey:

- **Key**: `leaderboard:{match_code}`
- **Data Structure**: Sorted Set (ZSET)
- **Member**: `user_code`
- **Score**: Cumulative score

The `ZADD` command with `INCR=True` is used to increment the user's score in the sorted set.

### Leaderboard Retrieval

The `GET /scoreboard/{match_code}` endpoint reads scores from the Valkey ZSET to build the leaderboard. If no cache exists, players are returned with a score of 0.

### Response (`BaseResponse`)

- `data`: danh sách records (đã được serialize trong core). Each record object contains:
  - `id` (string)
  - `created_at` (ISO timestamp string)
  - `updated_at` (ISO timestamp string | null)
  - `points` (int)
  - `is_deleted` (bool)
  - `player_id` (string)
  - `match_id` (string)
  - `question_id` (string)

### Status codes (get)

- `200`: OK.
- `500`: Internal Server Error.

## File liên quan

- `backend/app/routes/record.py`
- `backend/app/core/record.py`
- `backend/app/schemas/record.py`
