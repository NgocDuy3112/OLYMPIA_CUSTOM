# Answers API

**Tag**: `Answers`

Answer submission and retrieval endpoints with Valkey caching.

---

## Table of Contents

- [POST `/answers/`](#post-answers)
- [GET `/answers/`](#get-answers)
- [DELETE `/answers/{match_code}/{user_code}/{question_code}`](#delete-answersmatch_codeuser_codequestion_code)

---

## POST `/answers/`

Submit an answer for a player in a match.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/answers/` |
| **Method** | `POST` |
| **Auth** | Admin or Player role required |
| **Content-Type** | `application/json` |

### Request Body

**Schema**: `AnswerPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Match code (must start with `OC3_M`) |
| `user_code` | string | ✅ | Player's user code (must start with `OC_U`) |
| `question_code` | string | ✅ | Question code (must start with `OC3_Q`) |
| `answer_text` | string | ✅ | The answer text |
| `has_buzzed` | boolean | ✅ | Whether the player buzzed in |
| `timestamp` | number | ✅ | Elapsed seconds when submitted (max 3 decimal places) |

### Request Example

```bash
curl -X POST http://localhost:8000/answers/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "user_code": "OC_U001",
    "question_code": "OC3_Q001",
    "answer_text": "Hanoi",
    "has_buzzed": false,
    "timestamp": 12.490
  }'
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Successfully created answer for question_code=OC3_Q001 in match_code=OC3_M001 from user_code=OC_U001.",
  "data": null
}
```

### Caching Behavior

1. **Write to Valkey**: Answer is cached at key `answer:{match_code}:{user_code}:{question_code}`
2. **Broadcast**: Answer event is published to WebSocket channel `{match_code}`
3. **Persist to PostgreSQL**: Answer is inserted into the `answers` table

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid field format or integrity constraint |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not authorized (not admin or player) |
| `404` | Not Found Error | Match, user, or question not found |
| `500` | Server Error | Database or server error |

---

## GET `/answers/`

Retrieve the most recent answer for a given player and question.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/answers/` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code |
| `user_code` | string | ✅ | Player's user code |
| `question_code` | string | ✅ | Question code |

### Request Example

```bash
curl -X GET "http://localhost:8000/answers/?match_code=OC3_M001&user_code=OC_U001&question_code=OC3_Q001" \
  -H "Authorization: Bearer <token>"
```

### Caching Strategy

Answers are retrieved using a cache-aside pattern:

1. **Check Valkey**: Look up `answer:{match_code}:{user_code}:{question_code}`
2. **Cache Hit**: Return cached answer immediately
3. **Cache Miss**: Query PostgreSQL for most recent non-deleted answer

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Fetched answer for question_code=OC3_Q001 in match_code=OC3_M001 from user_code=OC_U001.",
  "data": {
    "match_code": "OC3_M001",
    "user_code": "OC_U001",
    "question_code": "OC3_Q001",
    "answer_text": "Hanoi",
    "has_buzzed": false,
    "timestamp": 12.490
  }
}
```

**Note**: `data` is always a plain object (never an array).

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | No answer found |
| `500` | Server Error | Database or server error |

---

## DELETE `/answers/{match_code}/{user_code}/{question_code}`

Soft-delete an answer (sets `is_deleted = true`).

### Request

| Property | Value |
|----------|-------|
| **URL** | `/answers/{match_code}/{user_code}/{question_code}` |
| **Method** | `DELETE` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `match_code` | string | Match code |
| `user_code` | string | Player's user code |
| `question_code` | string | Question code |

### Request Example

```bash
curl -X DELETE http://localhost:8000/answers/OC3_M001/OC_U001/OC3_Q001 \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Answer deleted successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid data |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Answer not found |
| `500` | Server Error | Database or server error |

---

## Schemas

### AnswerPostRequest

```typescript
interface AnswerPostRequest {
  match_code: string;    // Must start with 'OC3_M'
  user_code: string;     // Must start with 'OC_U'
  question_code: string; // Must start with 'OC3_Q'
  answer_text: string;
  has_buzzed: boolean;
  timestamp: number;     // Elapsed seconds, stored as Numeric(6,3)
}
```

### Answer Object

```typescript
interface Answer {
  match_code: string;
  user_code: string;
  question_code: string;
  answer_text: string;
  has_buzzed: boolean;
  timestamp: number;
}
```

---

## Implementation Notes

### Valkey Cache Key Pattern

```
answer:{match_code}:{user_code}:{question_code}
```

**Example**: `answer:OC3_M001:OC_U001:OC3_Q001`

### Cache Lifecycle

1. **POST**: Creates/updates cache entry
2. **GET**: Reads from cache (falls back to PostgreSQL)
3. **DELETE**: Removes cache entry and soft-deletes DB record

### WebSocket Broadcast

When an answer is submitted via POST:
1. Answer is cached in Valkey
2. Event is published to channel `{match_code}`
3. All connected WebSocket clients receive the answer event

**Message Format**:
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

---

## Related Files

- `backend/app/routes/answer.py` - Route handlers
- `backend/app/core/answer.py` - Business logic
- `backend/app/schemas/answer.py` - Answer schemas
- `backend/app/models/answer.py` - Answer model
