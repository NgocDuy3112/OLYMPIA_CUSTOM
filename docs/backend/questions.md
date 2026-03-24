# Questions API

**Tag**: `Câu hỏi`

This document describes the question management endpoints.

---

## Table of Contents

- [POST `/questions/drive/`](#post-questionsdrive)
- [POST `/questions/excel/`](#post-questionsexcel)
- [POST `/questions/`](#post-questions)
- [DELETE `/questions/{match_code}/{question_code}`](#delete-questionsmatch_codequestion_code)
- [Request Schemas](#request-schemas)
- [Response Schemas](#response-schemas)

---

## POST `/questions/drive/`

Import questions from Google Drive/Google Sheets. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/questions/drive/` |
| **Method** | `POST` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

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

**Status Code**: `201 Created`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Questions imported successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid `match_code` format or duplicate questions |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Match not found |
| `500 Internal Server Error` | Server Error | Database or server error |

### Notes

- Questions are imported from Google Drive/Sheets associated with the match
- Duplicate questions will cause a validation error
- Requires Google Drive and Sheets API credentials configured

---

## POST `/questions/excel/`

Import questions from an Excel file. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/questions/excel/` |
| **Method** | `POST` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ❌ | Match code to associate questions with. If omitted, derived from filename |

### Request Body

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | ✅ | Excel file containing questions |

### Request Example

```bash
curl -X POST "http://localhost:8000/questions/excel/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>" \
  -F "file=@questions.xlsx"
```

### Success Response

**Status Code**: `201 Created`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Questions imported successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid file format or duplicate questions |
| `400 Bad Request` | Match Code Mismatch | Provided `match_code` doesn't match filename |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Match not found |
| `500 Internal Server Error` | Server Error | Database or server error |

### Notes

- Excel filename (without extension) is used as `match_code` if not provided
- If both provided, they must match
- Excel file should follow the expected format with columns: question_code, content, answer, explanation, media_url

---

## POST `/questions/`

Create a question manually. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/questions/` |
| **Method** | `POST` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Request Body

**Schema**: `QuestionPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Match code (must start with `OC3_M`) |
| `question_code` | string | ✅ | Unique question identifier (must start with `OC3_Q`) |
| `content` | string | ✅ | Question content/text |
| `answer` | string | ✅ | Correct answer |
| `explanation` | string | ❌ | Explanation for the answer |
| `media_url` | string | ❌ | Single or comma-separated media URLs (must start with http:// or https://) |

### Request Example

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

### Success Response

**Status Code**: `201 Created`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Question created successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data or duplicate question |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Match not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## DELETE `/questions/{match_code}/{question_code}`

Delete a question from the system. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/questions/{match_code}/{question_code}` |
| **Method** | `DELETE` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

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

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Question deleted successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Question not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## Request Schemas

### QuestionPostRequest

```typescript
{
  match_code: string;  // Must start with 'OC3_M'
  question_code: string;  // Must start with 'OC3_Q'
  content: string;
  answer: string;
  explanation?: string;
  media_url?: string;  // Single URL or comma-separated URLs
}
```

---

## Response Schemas

### BaseResponse

```typescript
{
  status: "success" | "error";
  message: string;
  data?: null;
}
```

## GET `/questions/`

Lấy question theo `match_code` + `question_code`.

### Quyền truy cập (get)

- Bắt buộc role `admin`.

### Query params

- `match_code` (string, bắt buộc).
- `question_code` (string, bắt buộc theo route hiện tại).

### Response (`BaseResponse`)

- `data` object:
  - `question_code`
  - `content`
  - `answer`
  - `explanation`
  - `media_url` (string | null)

### Status codes (get)

- `200`: OK.
- `400`: Không tìm thấy question (theo core).
- `500`: Internal Server Error.

## POST `/questions/excel/`

Upload an Excel (.xlsx) file containing questions for a match. If `match_code` query param is omitted the server will derive the `match_code` from the uploaded file name (filename without extension).

### Auth

- role `admin` required

### Request

- multipart form: `file` (UploadFile)
- optional query param `match_code` (string). If provided it must match the uploaded filename (without extension) when present.

### Behavior

- Server parses the spreadsheet and inserts questions for the specified `match_code`.
- Validation errors return `400`.

### Response

- `201` on success (BaseResponse)

## Ghi chú triển khai

- Core có nhánh hỗ trợ `question_code=None` để trả list, nhưng route hiện tại bắt buộc `question_code`.

## File liên quan

- `backend/app/routes/question.py`
- `backend/app/core/question.py`
- `backend/app/schemas/question.py`
