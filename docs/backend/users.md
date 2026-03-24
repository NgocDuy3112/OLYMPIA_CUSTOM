# Users API

**Tag**: `Người dùng`

This document describes the user management endpoints.

---

## Table of Contents

- [GET `/users/`](#get-users)
- [PATCH `/users/{user_code}`](#patch-usersuser_code)
- [DELETE `/users/{user_code}`](#delete-usersuser_code)
- [Request Schemas](#request-schemas)
- [Response Schemas](#response-schemas)

---

## GET `/users/`

Retrieve users by user code or filter by role. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/users/` |
| **Method** | `GET` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_code` | string | ❌ | Filter by specific user code |
| `user_role` | string | ❌ | Filter by role: `guest`, `player`, or `admin` |

### Behavior

1. **If `user_code` is provided**: Returns a single user object (404 if not found)
2. **If only `user_role` is provided**: Returns a list of users with that role
3. **If neither is provided**: Returns all non-deleted users

### Request Examples

#### Get all users

```bash
curl -X GET http://localhost:8000/users/ \
  -H "Authorization: Bearer <token>"
```

#### Get user by code

```bash
curl -X GET "http://localhost:8000/users/?user_code=OC_U001" \
  -H "Authorization: Bearer <token>"
```

#### Get users by role

```bash
curl -X GET "http://localhost:8000/users/?user_role=player" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

**Single User Response**:

```json
{
  "status": "success",
  "message": "User retrieved successfully",
  "data": {
    "user_code": "OC_U001",
    "userPname": "Nguyen Van A",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

**List Users Response**:

```json
{
  "status": "success",
  "message": "Users retrieved successfully",
  "data": [
    {
      "user_code": "OC_U001",
      "userPname": "Nguyen Van A",
      "role": "admin",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    {
      "user_code": "OC_U002",
      "userPname": "Tran Thi B",
      "role": "player",
      "created_at": "2024-01-02T00:00:00Z",
      "updated_at": "2024-01-02T00:00:00Z"
    }
  ]
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid role value |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | User not found (when `user_code` specified) |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## PATCH `/users/{user_code}`

Update an existing user's information. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/users/{user_code}` |
| **Method** | `PATCH` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_code` | string | ✅ | User code to update |

### Request Body

**Schema**: `UserUpdateRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_name` | string | ❌ | New user name |
| `role` | string | ❌ | New role: `guest`, `player`, or `admin` |
| `new_password` | string | ❌ | New password |

### Request Example

```bash
curl -X PATCH http://localhost:8000/users/OC_U001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "Nguyen Van A Updated",
    "role": "player"
  }'
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "User updated successfully",
  "data": {
    "user_code": "OC_U001",
    "user_name": "Nguyen Van A Updated",
    "role": "player",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-03T00:00:00Z"
  }
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | User not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## DELETE `/users/{user_code}`

Delete a user from the system. Accessible only by admin users.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/users/{user_code}` |
| **Method** | `DELETE` |
| **Authentication** | Admin role required |
| **Response Format** | JSON |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_code` | string | ✅ | User code to delete |

### Request Example

```bash
curl -X DELETE http://localhost:8000/users/OC_U001 \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `BaseResponse`

```json
{
  "status": "success",
  "message": "User deleted successfully",
  "data": null
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Not an admin user |
| `404 Not Found` | Not Found Error | User not found |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## Request Schemas

### UserUpdateRequest

```typescript
{
  user_name?: string;
  role?: "guest" | "player" | "admin";
  new_password?: string;
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

### User Object

```typescript
{
  user_code: string;
  userPname: string;
  role: "guest" | "player" | "admin";
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
}
```

- `user_code` (string)

### Request body (`UserUpdateRequest`)

- `user_name` (string, optional)
- `role` (`guest | player | admin`, optional)

### Success response

`BaseResponse` với message mô tả.

### Status codes

- `200` OK
- `400` Dữ liệu không hợp lệ
- `404` Không tìm thấy user
- `500` Internal Server Error

---

## DELETE `/users/{user_code}`

Soft-delete người dùng (đánh dấu `is_deleted`).

### Quyền truy cập

- Chỉ `admin`.

### Path params

- `user_code` (string)

### Success response

`BaseResponse` thông báo đã xóa.

### Status codes

- `200` OK
- `404` Không tìm thấy user
- `500` Internal Server Error

---

## Liên quan

- `backend/app/routes/user.py`
- `backend/app/core/user.py`
- `backend/app/schemas/user.py`
