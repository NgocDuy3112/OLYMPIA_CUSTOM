# Users API

**Tag**: `Users`

User management endpoints for listing, updating, and deleting users.

---

## Table of Contents

- [GET `/users/`](#get-users)
- [PATCH `/users/{user_code}`](#patch-usersuser_code)
- [DELETE `/users/{user_code}`](#delete-usersuser_code)

---

## GET `/users/`

Retrieve users by user code or filter by role.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/users/` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_code` | string | ❌ | Filter by specific user code |
| `user_role` | string | ❌ | Filter by role: `guest`, `player`, `admin` |

### Behavior

| Scenario | Result |
|----------|--------|
| `user_code` provided | Returns single user object (404 if not found) |
| Only `user_role` provided | Returns list of users with that role |
| Neither provided | Returns all non-deleted users |

### Request Examples

#### Get All Users

```bash
curl -X GET http://localhost:8000/users/ \
  -H "Authorization: Bearer <token>"
```

#### Get User by Code

```bash
curl -X GET "http://localhost:8000/users/?user_code=OC_U001" \
  -H "Authorization: Bearer <token>"
```

#### Get Users by Role

```bash
curl -X GET "http://localhost:8000/users/?user_role=player" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

**Schema**: `BaseResponse`

#### Single User Response

```json
{
  "status": "success",
  "message": "User retrieved successfully",
  "data": {
    "user_code": "OC_U001",
    "user_name": "Nguyen Van A",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

#### List Users Response

```json
{
  "status": "success",
  "message": "Users retrieved successfully",
  "data": [
    {
      "user_code": "OC_U001",
      "user_name": "Nguyen Van A",
      "role": "admin",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    {
      "user_code": "OC_U002",
      "user_name": "Tran Thi B",
      "role": "player",
      "created_at": "2024-01-02T00:00:00Z",
      "updated_at": "2024-01-02T00:00:00Z"
    }
  ]
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid role value |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | User not found (when `user_code` specified) |
| `500` | Server Error | Database or server error |

---

## PATCH `/users/{user_code}`

Update an existing user's information.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/users/{user_code}` |
| **Method** | `PATCH` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_code` | string | ✅ | User code to update |

### Request Body

**Schema**: `UserUpdateRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_name` | string | ❌ | New user name |
| `role` | string | ❌ | New role: `guest`, `player`, `admin` |
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

**Status**: `200 OK`

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

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input data |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | User not found |
| `500` | Server Error | Database or server error |

---

## DELETE `/users/{user_code}`

Soft-delete a user (sets `is_deleted = true`).

### Request

| Property | Value |
|----------|-------|
| **URL** | `/users/{user_code}` |
| **Method** | `DELETE` |
| **Auth** | Admin role required |

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

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "User deleted successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | User not found |
| `500` | Server Error | Database or server error |

---

## Schemas

### UserUpdateRequest

```typescript
interface UserUpdateRequest {
  user_name?: string;
  role?: "guest" | "player" | "admin";
  new_password?: string;
}
```

### User Object

```typescript
interface User {
  user_code: string;
  user_name: string;
  role: "guest" | "player" | "admin";
  created_at: string;  // ISO 8601 datetime
  updated_at: string;  // ISO 8601 datetime
}
```

### BaseResponse

```typescript
interface BaseResponse<T = any> {
  status: "success" | "error";
  message: string;
  data?: T | T[] | null;
}
```

---

## Related Files

- `backend/app/routes/user.py` - Route handlers
- `backend/app/core/user.py` - Business logic
- `backend/app/schemas/user.py` - User schemas
- `backend/app/models/user.py` - User model
