# Authentication API

**Tag**: `Auth`

Authentication endpoints for user registration, login, token management, and password recovery.

---

## Table of Contents

- [POST `/auth/signup`](#post-authsignup)
- [POST `/auth/login`](#post-authlogin)
- [POST `/auth/refresh`](#post-authrefresh)
- [POST `/auth/logout`](#post-authlogout)
- [POST `/auth/send-credentials/{user_code}`](#post-authsend-credentialsuser_code)
- [POST `/auth/send-reset/{user_code}`](#post-authsend-resetuser_code)
- [POST `/auth/reset-password`](#post-authreset-password)
- [POST `/auth/request-otp`](#post-authrequest-otp)
- [POST `/auth/verify-otp`](#post-authverify-otp)
- [Token Management](#token-management)

---

## POST `/auth/signup`

Register a new user and receive JWT tokens.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/signup` |
| **Method** | `POST` |
| **Auth** | None (Public) |
| **Content-Type** | `application/json` |

### Request Body

**Schema**: `UserCreate`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_name` | string | ✅ | Full name |
| `user_code` | string | ✅ | Unique ID (must start with `OC_U`) |
| `password` | string | ✅ | Password (min 8 chars recommended) |
| `role` | string | ❌ | Role: `guest`, `player`, `admin` (default: `player`) |
| `email` | string | ❌ | Email for credential delivery |

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

**Status**: `201 Created`

**Schema**: `TokenResponse`

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

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input (e.g., wrong `user_code` format) |
| `400` | Duplicate Error | User already exists |
| `500` | Server Error | Database/server error |

### Email Behavior

If `email` is provided, the backend sends credentials to that address. This is useful for event organizers pre-creating accounts.

**Security Note**: Sending plaintext passwords via email is less secure than sending a reset link. Consider using `/auth/send-reset/{user_code}` instead.

---

## POST `/auth/login`

Authenticate and receive JWT tokens.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/login` |
| **Method** | `POST` |
| **Auth** | None (Public) |
| **Content-Type** | `application/x-www-form-urlencoded` |

### Request Body

**Schema**: `OAuth2PasswordRequestForm`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | ✅ | User code or username |
| `password` | string | ✅ | Password |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=OC_U001&password=securepassword123"
```

### Success Response

**Status**: `200 OK`

**Schema**: `TokenResponse`

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

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Authentication Error | Invalid credentials |
| `400` | Validation Error | Missing required fields |
| `500` | Server Error | Database/server error |

---

## POST `/auth/refresh`

Exchange a refresh token for a new access + refresh token pair. The old refresh token is **immediately revoked** (single-use rotation).

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/refresh` |
| **Method** | `POST` |
| **Auth** | None (uses refresh token in body) |
| **Content-Type** | `application/json` |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | ✅ | Refresh token from login |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."}'
```

### Success Response

**Status**: `200 OK`

Returns a fresh `TokenResponse` with new `access_token` and `refresh_token`.

### Error Responses

| Status | Description |
|--------|-------------|
| `401` | Token not found, revoked, or expired |
| `500` | Server error |

---

## POST `/auth/logout`

Revoke all active refresh tokens for the authenticated user.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/logout` |
| **Method** | `POST` |
| **Auth** | Bearer token required |
| **Content-Type** | `application/json` |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | ✅ | Refresh token to revoke |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."}'
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

## POST `/auth/send-credentials/{user_code}`

Generate a temporary password and email credentials to the user's registered email.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/send-credentials/{user_code}` |
| **Method** | `POST` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_code` | string | User code |

### Success Response

**Status**: `200 OK`

`BaseResponse` indicating email queued.

---

## POST `/auth/send-reset/{user_code}`

Send a password reset link to the user's email.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/send-reset/{user_code}` |
| **Method** | `POST` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_code` | string | User code |

### Success Response

**Status**: `200 OK`

`BaseResponse` indicating reset email sent.

---

## POST `/auth/reset-password`

Reset password using a reset token.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/reset-password` |
| **Method** | `POST` |
| **Auth** | None (Public) |
| **Content-Type** | `application/json` |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | ✅ | Reset token from email |
| `new_password` | string | ✅ | New password |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset-token-from-email",
    "new_password": "newpass123"
  }'
```

### Success Response

**Status**: `200 OK`

`BaseResponse` indicating password reset successful.

---

## POST `/auth/request-otp`

Request an OTP for passwordless login or 2FA.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/request-otp` |
| **Method** | `POST` |
| **Auth** | None (Public) |
| **Content-Type** | `application/json` |

### Request Body

**Option 1** (user_code):
```json
{
  "user_code": "OC_U001",
  "purpose": "login"
}
```

**Option 2** (email):
```json
{
  "email": "user@example.com",
  "purpose": "login"
}
```

### Success Response

**Status**: `200 OK`

`BaseResponse` indicating OTP sent. TTL and rate limits apply.

---

## POST `/auth/verify-otp`

Verify an OTP and receive JWT tokens.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/auth/verify-otp` |
| **Method** | `POST` |
| **Auth** | None (Public) |
| **Content-Type** | `application/json` |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_code` | string | ✅ | User code |
| `purpose` | string | ✅ | Purpose (e.g., "login") |
| `otp` | string | ✅ | OTP code |

### Request Example

```bash
curl -X POST http://localhost:8000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "user_code": "OC_U001",
    "purpose": "login",
    "otp": "123456"
  }'
```

### Success Response

**Status**: `200 OK`

`TokenResponse` (equivalent to successful login).

---

## Token Management

### Using the Access Token

Include in `Authorization` header for all protected endpoints:

```
Authorization: Bearer <access_token>
```

### Token Lifetime

| Token | Lifetime | Storage |
|-------|----------|---------|
| **Access Token** | 30 min (configurable) | Memory/localStorage |
| **Refresh Token** | 7 days (configurable) | localStorage |

### Rotation Strategy

Each `/auth/refresh` call:
1. Revokes the used refresh token
2. Issues a new access + refresh token pair
3. Revoked tokens cannot be reused

### Recommended Frontend Flow

1. **Login** → Store both tokens
2. **On 401** → Call `/auth/refresh` → Retry original request
3. **On logout** → Call `/auth/logout` → Clear both tokens

---

## Error Handling

### Common Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Invalid user_code format | `400` | `user_code must start with 'OC_U'` |
| User already exists | `400` | `User already exists` |
| Incorrect credentials | `400` | `Incorrect password or user not found` |
| Token expired | `401` | `Token has expired` |
| Invalid token | `401` | `Could not validate credentials` |

### Error Response Format

All errors follow the standard envelope:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "data": null
}
```

---

## Related Files

- `backend/app/routes/auth.py` - Route handlers
- `backend/app/core/auth.py` - Business logic
- `backend/app/schemas/user.py` - User schemas
- `backend/app/dependencies/user_auth.py` - JWT validation
