# Matches API

**Tag**: `Trận đấu`

This document describes the match management endpoints.

---

## Table of Contents

- [POST `/matches/`](#post-matches)
- [GET `/matches/`](#get-matches)
- [PATCH `/matches/{match_code}`](#patch-matchesmatch_code)
- [DELETE `/matches/{match_code}`](#delete-matchesmatch_code)
- [Request Schemas](#request-schemas)
- [Response Schemas](#response-schemas)

---

## POST `/matches/`

Create a new match with optional player assignments. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/matches/` |
| **Method** | `POST` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Request Body

**Schema**: `MatchInfoPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Unique match identifier (must start with `OC3_M`) |
| `match_name` | string | ✅ | Human-readable match name |
| `players` | array | ❌ | List of player assignments (max 4 players) |

**Player Assignment Schema** (`MatchPlayerAssignment`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_code` | string | ✅ | Player's user code (must start with `OC_U`) |
| `position` | integer | ✅ | Player position (1-4) |

### Request Example

```bash
curl -X POST http://localhost:8000/matches/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      {"user_code": "OC_U001", "position": 1},
      {"user_code": "OC_U002", "position": 2},
      {"user_code": "OC_U003", "position": 3},
      {"user_code": "OC_U004", "position": 4}
    ]
  }'
```

### Success Response

**Status Code**: `201 Created`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Match created successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data (e.g., invalid `match_code` format) |
| `400 Bad Request` | Duplicate Error | Match already exists |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## GET `/matches/`

Retrieve match details by match code. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/matches/` |
| **Method** | `GET` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to retrieve |

### Request Example

```bash
curl -X GET "http://localhost:8000/matches/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `MatchRoomResponse` (extends `BaseResponse`)

```json
{
  "status": "success",
  "message": "Match retrieved successfully",
  "data": {
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      {
        "user_code": "OC_U001",
        "user_name": "Nguyen Van A",
        "position": 1
      },
      {
        "user_code": "OC_U002",
        "user_name": "Tran Thi B",
        "position": 2
      },
      {
        "user_code": "OC_U003",
        "user_name": "Le Van C",
        "position": 3
      },
      {
        "user_code": "OC_U004",
        "user_name": "Pham Thi D",
        "position": 4
      }
    ]
  }
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Missing or invalid `match_code` |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Match not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## PATCH `/matches/{match_code}`

Update an existing match. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}` |
| **Method** | `PATCH` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to update |

### Request Body

**Schema**: `MatchUpdateRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_name` | string | ❌ | New match name |
| `players` | array | ❌ | Updated list of player assignments |

### Request Example

```bash
curl -X PATCH http://localhost:8000/matches/OC3_M001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_name": "Vòng loại 1 - Updated",
    "players": [
      {"user_code": "OC_U001", "position": 1},
      {"user_code": "OC_U002", "position": 2}
    ]
  }'
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Match updated successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | Match not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## DELETE `/matches/{match_code}`

Delete a match from the system. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}` |
| **Method** | `DELETE` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to delete |

### Request Example

```bash
curl -X DELETE http://localhost:8000/matches/OC3_M001 \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "Match deleted successfully",
  "data": null
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

## Request Schemas

### MatchInfoPostRequest

```typescript
{
  match_code: string;  // Must start with 'OC3_M'
  match_name: string;
  players?: MatchPlayerAssignment[];
}

interface MatchPlayerAssignment {
  user_code: string;  // Must start with 'OC_U'
  position: number;   // 1-4
}
```

### MatchUpdateRequest

```typescript
{
  match_name?: string;
  players?: MatchPlayerAssignment[];
}
```

---

## Response Schemas

### MatchRoomResponse

```typescript
{
  status: "success" | "error";
  message: string;
  data: {
    match_code: string;
    match_name: string;
    players: MatchPlayerInRoom[];
  } | null;
}

interface MatchPlayerInRoom {
  user_code: string;
  user_name: string;
  position: number;
}
```
  - `players`: array các object `{ user_code, user_name, position }`

### Status codes

- `200` OK
- `404` Không tìm thấy match
- `500` Internal Server Error

---

## GET `/matches/{match_code}/players`

Trả danh sách người chơi của một trận (chỉ players, không kèm tên).

### Quyền truy cập

- Chỉ `admin`.

### Path params

- `match_code` (string)

### Response

`BaseResponse` với `data.players` là mảng players giống phần `GET /matches/`.

### Status codes

- `200` OK
- `404` Match không tồn tại
- `500` Internal Server Error

---

## PATCH `/matches/{match_code}`

Cập nhật tên hoặc cấu trúc phòng (players).

### Quyền truy cập

- Chỉ `admin`.

### Path params

- `match_code` (string)

### Request body (`MatchUpdateRequest`)

- `match_name` (string, không bắt buộc)
- `players` (array `MatchPlayerAssignment`, không bắt buộc) – gửi mới sẽ xóa cấu hình cũ.

### Success response

`BaseResponse` với mô tả thay đổi.

### Status codes

- `200` OK
- `400` Dữ liệu không hợp lệ
- `404` Match không tồn tại
- `500` Internal Server Error

---

## DELETE `/matches/{match_code}`

Soft‑delete một trận (đánh dấu `is_deleted`).

### Quyền truy cập

- Chỉ `admin`.

### Path params

- `match_code` (string)

### Success response

`BaseResponse` với message `soft deleted`.

### Status codes

- `200` OK
- `404` Không tìm thấy match
- `500` Internal Server Error

---

## File liên quan

- `backend/app/routes/match.py`
- `backend/app/core/match.py`
- `backend/app/schemas/match.py`
