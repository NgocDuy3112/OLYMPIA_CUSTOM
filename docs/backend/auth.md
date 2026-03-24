# Authentication API

**Tag**: `Uỷ Quyền`

This document describes the authentication endpoints for user registration, login, token refresh, and logout.

---

## Table of Contents

- [POST `/auth/signup`](#post-authsignup)
- [POST `/auth/login`](#post-authlogin)
- [POST `/auth/refresh`](#post-authrefresh)
- [POST `/auth/logout`](#post-authlogout)
- [Token Management](#token-management)
- [Error Handling](#error-handling)

---

## POST `/auth/signup`

Register a new user and receive a JWT access token.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/auth/signup` |
| **Method** | `POST` |
| **Authentication** | None (Public) |
| **Response Format** | JSON |

### Request Body

**Content-Type**: `application/json`

**Schema**: `UserCreate`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_name` | string | ✅ | Full name of the user |
| `user_code` | string | ✅ | Unique user identifier (must start with `OC_U`) |
| `password` | string | ✅ | User password (min 8 characters recommended) |
| `role` | string | ❌ | User role: `guest`, `player`, or `admin` (default: `player`) |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "Nguyen Van A",
    "user_code": "OC_U001",
    "password": "securepassword123",
    "role": "admin"
  }'
```

### Success Response

**Status Code**: `201 Created`

**Schema**: `TokenResponse`

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | JWT access token |
| `refresh_token` | string | Opaque refresh token for renewing access tokens |
| `token_type` | string | Token type (always `bearer`) |
| `role` | string | User role |
| `user_code` | string \| null | User code |
| `user_name` | string \| null | User name |

**Response Example**:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
  "token_type": "bearer",
  "role": "admin",
  "user_code": "OC_U001",
  "user_name": "Nguyen Van A"
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data (e.g., invalid `user_code` format) |
| `400 Bad Request` | Duplicate Error | User already exists |
| `500 Internal Server Error` | Server Error | Database or server error |


---

## POST `/auth/login`

Authenticate a user and receive a JWT access token.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/auth/login` |
| **Method** | `POST` |
| **Authentication** | None (Public) |
| **Response Format** | JSON |

### Request Body

**Content-Type**: `application/x-www-form-urlencoded`

**Schema**: `OAuth2PasswordRequestForm`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | ✅ | User code or username |
| `password` | string | ✅ | User password |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=OC_U001&password=securepassword123"
```

### Success Response

**Status Code**: `200 OK`

**Schema**: `TokenResponse`

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | JWT access token |
| `token_type` | string | Token type (always `bearer`) |
| `role` | string | User role |
| `user_code` | string \| null | User code |
| `user_name` | string \| null | User name |

**Response Example**:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
  "token_type": "bearer",
  "role": "admin",
  "user_code": "OC_U001",
  "user_name": "Nguyen Van A"
}
```

### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Authentication Error | Invalid credentials |
| `400 Bad Request` | Validation Error | Missing required fields |
| `500 Internal Server Error` | Server Error | Database or server error |

---

## POST `/auth/refresh`

Exchange a valid refresh token for a new access + refresh token pair.
The old refresh token is **immediately revoked** (single-use rotation).

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/auth/refresh` |
| **Method** | `POST` |
| **Authentication** | None (uses refresh token in body) |
| **Response Format** | JSON |

### Request Body

**Content-Type**: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | ✅ | The refresh token received at login |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."}'
```

### Success Response

**Status Code**: `200 OK`

Returns a fresh `TokenResponse` with a new `access_token` and `refresh_token`.

### Error Responses

| Status Code | Description |
|-------------|-------------|
| `401 Unauthorized` | Token not found, revoked, or expired |
| `500 Internal Server Error` | Server error |

---

## POST `/auth/logout`

Revoke all active refresh tokens for the authenticated user.
Clients should also discard the access token locally.

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `/auth/logout` |
| **Method** | `POST` |
| **Authentication** | Bearer `access_token` required |
| **Response Format** | JSON |

### Request Body

**Content-Type**: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | ✅ | The refresh token to revoke |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."}'
```

### Success Response

**Status Code**: `200 OK`

```json
{"status": "success", "message": "Logged out successfully"}
```

---

## Token Management

### Using the Access Token

Include the access token in the `Authorization` header for all protected endpoints:

```
Authorization: Bearer <access_token>
```

### Token Expiration & Rotation

| Token | Lifetime | Storage recommendation |
|-------|----------|------------------------|
| `access_token` | `ACCESS_TOKEN_EXPIRE_MINUTES` (env, default 30 min) | Memory / localStorage |
| `refresh_token` | `REFRESH_TOKEN_EXPIRE_DAYS` (env, default 7 days) | localStorage |

**Rotation strategy**: Each call to `/auth/refresh` revokes the used refresh token
and issues a brand new pair. If an already-revoked token is presented, access is denied.

### Recommended Frontend Flow

1. Login → store both `access_token` and `refresh_token`.
2. On any `401` response → call `/auth/refresh` → retry original request.
3. On logout → call `/auth/logout` → clear both tokens locally.

---

## Error Handling

### Common Error Scenarios

1. **Invalid User Code Format**
   ```
   Status: 400 Bad Request
   Message: user_code must start with 'OC_U'
   ```

2. **User Already Exists**
   ```
   Status: 400 Bad Request
   Message: User already exists
   ```

3. **Incorrect Credentials**
   ```
   Status: 400 Bad Request
   Message: Incorrect password or user not found
   ```

4. **Token Expired**
   ```
   Status: 401 Unauthorized
   Message: Token has expired
   ```

5. **Invalid Token**
   ```
   Status: 401 Unauthorized
   Message: Could not validate credentials
   ```

### Error Response Format

All errors follow the standard response envelope:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "data": null
}
```

### Success response

Giống với `signup` (`TokenResponse`).

### Status codes

- `200`: OK.
- `400`: Sai thông tin đăng nhập.
- `500`: Internal Server Error.

## File liên quan

- `backend/app/routes/auth.py`
- `backend/app/core/auth.py`
- `backend/app/schemas/user.py`
- `backend/app/dependencies/user_auth.py`
