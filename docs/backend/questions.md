# Questions API

**Tag**: `Questions`

Question management endpoints for importing, creating, retrieving, and deleting questions.

---

## Table of Contents

- [POST `/questions/drive/`](#post-questionsdrive)
- [POST `/questions/excel/`](#post-questionsexcel)
- [POST `/questions/excel/qualifier/`](#post-questionsexcelqualifier)
- [POST `/questions/`](#post-questions)
- [GET `/questions/`](#get-questions)
- [PATCH `/questions/{match_code}/{question_code}`](#patch-questionsmatch_codequestion_code)
- [DELETE `/questions/{match_code}/{question_code}`](#delete-questionsmatch_codequestion_code)

---

## POST `/questions/drive/`

Import questions from Google Drive/Google Sheets.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/drive/` |
| **Method** | `POST` |
| **Auth** | Admin role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to associate questions with |

### Request Example

```bash
curl -X POST "http://localhost:8000/questions/drive/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Questions imported successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid `match_code` or duplicate questions |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or Google API error |

### Notes

- Questions are imported from Google Drive/Sheets associated with the match
- Duplicate questions cause a validation error
- Requires Google Drive and Sheets API credentials configured

---

## POST `/questions/excel/`

Import questions from an Excel file.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/excel/` |
| **Method** | `POST` |
| **Auth** | Admin role required |
| **Content-Type** | `multipart/form-data` |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ❌ | Match code. If omitted, derived from filename |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | ✅ | Excel file (.xlsx) containing questions |

### Request Example

```bash
curl -X POST "http://localhost:8000/questions/excel/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>" \
  -F "file=@questions.xlsx"
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Questions imported successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid file format or duplicate questions |
| `400` | Match Code Mismatch | `match_code` doesn't match filename |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or file processing error |

### Notes

- Excel filename (without extension) is used as `match_code` if not provided
- If both provided, they must match
- Excel file should follow the expected format with columns: `question_code`, `content`, `answer`, `explanation`, `media_url`

---

## POST `/questions/excel/qualifier/`

Import qualifier questions from an Excel file.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/excel/qualifier/` |
| **Method** | `POST` |
| **Auth** | Admin role required |
| **Content-Type** | `multipart/form-data` |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ❌ | Match code. If omitted, derived from filename |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | ✅ | Excel file (.xlsx) containing qualifier questions |

### Request Example

```bash
curl -X POST "http://localhost:8000/questions/excel/qualifier/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>" \
  -F "file=@qualifier_questions.xlsx"
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Qualifier questions imported successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid file format or duplicate questions |
| `400` | Match Code Mismatch | `match_code` doesn't match filename |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or file processing error |

### Notes

- Imports questions specifically for the Qualifier (Vòng Loại) round
- Questions should include `options` field with 6 answer choices
- Excel file should follow the expected format with columns: `question_code`, `content`, `answer`, `explanation`, `media_url`, `options`

---

## POST `/questions/`

Create a question manually.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/` |
| **Method** | `POST` |
| **Auth** | Admin role required |
| **Content-Type** | `application/json` |

### Request Body

**Schema**: `QuestionPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Match code (must start with `OC3_M`) |
| `question_code` | string | ✅ | Question ID (must start with `OC3_Q`) |
| `content` | string | ✅ | Question text |
| `answer` | string | ✅ | Correct answer |
| `explanation` | string | ❌ | Explanation for the answer |
| `media_url` | string | ❌ | Single or comma-separated media URLs (must start with `http://` or `https://`) |
| `options` | array\|string | ❌ | (Qualifier only) Six answer options. Can be JSON array or JSON-encoded string |

### Request Example

#### Basic Question

```bash
curl -X POST http://localhost:8000/questions/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "question_code": "OC3_Q001",
    "content": "What is the capital of Vietnam?",
    "answer": "Hanoi",
    "explanation": "Hanoi is the capital city of Vietnam",
    "media_url": "https://example.com/image.jpg"
  }'
```

#### Question with Options (Preferred - Native Array)

```bash
curl -X POST http://localhost:8000/questions/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "question_code": "OC3_Q_VL_1_01",
    "content": "Thủ đô của Việt Nam là gì?",
    "answer": "A",
    "options": ["Hà Nội", "TP. Hồ Chí Minh", "Huế", "Đà Nẵng", "Cần Thơ", "Vũng Tàu"]
  }'
```

#### Question with Options (Backward Compatible - JSON String)

```bash
curl -X POST http://localhost:8000/questions/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "question_code": "OC3_Q_VL_1_01",
    "content": "Thủ đô của Việt Nam là gì?",
    "answer": "A",
    "options": "[\"Hà Nội\", \"TP. Hồ Chí Minh\", \"Huế\", \"Đà Nẵng\", \"Cần Thơ\", \"Vũng Tàu\"]"
  }'
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Question created successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input or duplicate question |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## GET `/questions/`

Retrieve a question by match code and question code.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code |
| `question_code` | string | ✅ | Question code |

### Request Example

```bash
curl -X GET "http://localhost:8000/questions/?match_code=OC3_M001&question_code=OC3_Q001" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Question retrieved successfully",
  "data": {
    "question_code": "OC3_Q001",
    "content": "What is the capital of Vietnam?",
    "answer": "Hanoi",
    "explanation": "Hanoi is the capital city of Vietnam",
    "media_url": "https://example.com/image.jpg"
  }
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Question not found |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `500` | Server Error | Database or server error |

---

## PATCH `/questions/{match_code}/{question_code}`

Update an existing question.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/{match_code}/{question_code}` |
| **Method** | `PATCH` |
| **Auth** | Admin role required |
| **Content-Type** | `application/json` |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code |
| `question_code` | string | ✅ | Question code |

### Request Body

**Schema**: `QuestionUpdateRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | ❌ | Question text |
| `answer` | string | ❌ | Correct answer |
| `explanation` | string | ❌ | Explanation for the answer |
| `media_url` | string | ❌ | Media URL(s) |
| `options` | array\|string | ❌ | Six answer options (Qualifier only) |

### Request Example

```bash
curl -X PATCH http://localhost:8000/questions/OC3_M001/OC3_Q001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What is the capital of Vietnam? (Updated)",
    "answer": "Hanoi",
    "explanation": "Hanoi is the capital city of Vietnam"
  }'
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Question updated successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input data |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Question not found |
| `500` | Server Error | Database or server error |

---

## DELETE `/questions/{match_code}/{question_code}`

Delete a question from the system.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/questions/{match_code}/{question_code}` |
| **Method** | `DELETE` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code |
| `question_code` | string | ✅ | Question code |

### Request Example

```bash
curl -X DELETE http://localhost:8000/questions/OC3_M001/OC3_Q001 \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Question deleted successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Question not found |
| `500` | Server Error | Database or server error |

---

## Schemas

### QuestionPostRequest

```typescript
interface QuestionPostRequest {
  match_code: string;      // Must start with 'OC3_M'
  question_code: string;   // Must start with 'OC3_Q'
  content: string;
  answer: string;
  explanation?: string;
  media_url?: string;      // Single URL or comma-separated URLs
  options?: string[] | string;  // Six answer options (Qualifier only)
}
```

### QuestionUpdateRequest

```typescript
interface QuestionUpdateRequest {
  content?: string;
  answer?: string;
  explanation?: string;
  media_url?: string;
  options?: string[] | string;  // Six answer options (Qualifier only)
}
```

### Question Object

```typescript
interface Question {
  question_code: string;
  content: string;
  answer: string;
  explanation?: string;
  media_url?: string;
  options?: string[];
}
```

---

## Related Files

- `backend/app/routes/question.py` - Route handlers
- `backend/app/core/question.py` - Business logic
- `backend/app/schemas/question.py` - Question schemas
- `backend/app/models/question.py` - Question model
