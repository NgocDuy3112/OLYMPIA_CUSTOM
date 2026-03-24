# Answers API

**Tag**: `Câu trả lời`

This document describes the answer submission and retrieval endpoints.

---

## Table of Contents

- [POST `/answers/`](#post-answers)
- [GET `/answers/`](#get-answers)
- [DELETE `/answers/{match_code}/{user_code}/{question_code}`](#delete-answers)
- [Request Schemas](#request-schemas)
- [Response Schemas](#response-schemas)

---

## POST `/answers/`

Submit an answer for a player in a match. Accessible by admin and player roles.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/answers/` |
| **Method** | `POST` |
| **Authentication** | Admin or Player role required |
| **Response Format** | JSON |

### Request Body

**Schema**: `AnswerPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Match code (must start with `OC3_M`) |
| `user_code` | string | ✅ | Player's user code (must start with `OC_U`) |
| `question_code` | string | ✅ | Question code (must start with `OC3_Q`) |
| `answer_text` | string | ✅ | The answer text |
| `has_buzzed` | boolean | ✅ | Whether the player buzzed in |
| `timestamp` | float | ✅ | Elapsed seconds when answer was submitted (max 3 decimal places) |

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

**Status Code**: `201 Created`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Successfully created answer for question_code=OC3_Q001 in match_code=OC3_M001 from user_code=OC_U001.",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid field format or integrity constraint violation |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not authorized (not admin or player) |
| `404 Not Found` | Not Found Error | Match, user, or question not found in DB |
| `500 Internal Server Error` | Server Error | Unexpected database or server error |

---

## GET `/answers/`

Retrieve the most recent answer for a given player and question. Accessible only by admin users.

Answers are first looked up in the Valkey cache (written on POST). On a cache miss the query falls back to PostgreSQL, returning the most recently submitted non-deleted answer.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/answers/` |
| **Method** | `GET` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

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

### Success Response

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

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

> **Note**: `data` is always a plain object (never an array). Cache hits return the object stored at POST time; DB hits return the same shape derived from the answer row.

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | No answer found for the given parameters |
| `500 Internal Server Error` | Server Error | Unexpected database or server error |

---

## DELETE `/answers/{match_code}/{user_code}/{question_code}`

Soft-delete an answer (sets `is_deleted = true`). Admin only.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/answers/{match_code}/{user_code}/{question_code}` |
| **Method** | `DELETE` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `match_code` | string | Match code |
| `user_code` | string | Player's user code |
| `question_code` | string | Question code |

### Success Response

**Status Code**: `200 OK`

```json
{
  "status": "success",
  "message": "...",
  "data": null
}
```

### Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | Invalid data |
| `404 Not Found` | Answer not found |
| `500 Internal Server Error` | Unexpected error |

---

## Request Schemas

### AnswerPostRequest

```typescript
{
  match_code: string;    // Must start with 'OC3_M'
  user_code: string;     // Must start with 'OC_U'
  question_code: string; // Must start with 'OC3_Q'
  answer_text: string;
  has_buzzed: boolean;
  timestamp: number;     // Elapsed seconds, stored as Numeric(6,3)
}
```

---

## Response Schemas

### BaseResponse

```typescript
{
  status: "success" | "error";
  message: string;
  data?: object | null;
}
```

---

## Related Files

- `backend/app/routes/answer.py`
- `backend/app/core/answer.py`
- `backend/app/schemas/answer.py`
