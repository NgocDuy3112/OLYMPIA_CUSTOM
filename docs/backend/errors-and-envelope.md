# Errors & Response Envelope

Standard error handling and response format conventions for the OLYMPIA CUSTOM 3 API.

---

## Table of Contents

- [Standard Response Envelope](#standard-response-envelope)
- [Error Response Format](#error-response-format)
- [HTTP Status Codes](#http-status-codes)
- [Common Error Scenarios](#common-error-scenarios)
- [Client Recommendations](#client-recommendations)

---

## Standard Response Envelope

All API responses follow the `BaseResponse` schema:

```typescript
interface BaseResponse<T = any> {
  status: "success" | "error";
  message: string;
  data?: T | T[] | null;
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"success"` or `"error"` |
| `message` | string | Human-readable description |
| `data` | object/array/null | Response payload (varies by endpoint) |

### Success Response Example

```json
{
  "status": "success",
  "message": "User created successfully",
  "data": {
    "user_code": "OC_U001",
    "user_name": "Nguyen Van A",
    "role": "admin"
  }
}
```

---

## Error Response Format

Error responses follow the same envelope structure:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "data": null
}
```

### Error Response Example

```json
{
  "status": "error",
  "message": "User not found",
  "data": null
}
```

---

## HTTP Status Codes

### Success Codes

| Code | Description | Usage |
|------|-------------|-------|
| `200 OK` | Request successful | GET, PATCH, DELETE |
| `201 Created` | Resource created | POST |
| `204 No Content` | Resource deleted | DELETE (no body) |

### Client Error Codes

| Code | Description | Common Scenarios |
|------|-------------|------------------|
| `400 Bad Request` | Invalid input | Validation errors, duplicates |
| `401 Unauthorized` | Auth required | Missing/invalid token |
| `403 Forbidden` | Insufficient permissions | Wrong role |
| `404 Not Found` | Resource not found | Invalid ID |
| `422 Unprocessable Entity` | Validation error | Pydantic validation |

### Server Error Codes

| Code | Description | Usage |
|------|-------------|-------|
| `500 Internal Server Error` | Server error | Database errors, exceptions |

---

## Common Error Scenarios

### Authentication Errors

#### Missing Token

```http
Status: 401 Unauthorized
```

```json
{
  "status": "error",
  "message": "Not authenticated",
  "data": null
}
```

#### Invalid Token

```http
Status: 401 Unauthorized
```

```json
{
  "status": "error",
  "message": "Could not validate credentials",
  "data": null
}
```

#### Expired Token

```http
Status: 401 Unauthorized
```

```json
{
  "status": "error",
  "message": "Token has expired",
  "data": null
}
```

---

### Authorization Errors

#### Insufficient Role

```http
Status: 403 Forbidden
```

```json
{
  "status": "error",
  "message": "Not enough permissions",
  "data": null
}
```

---

### Validation Errors

#### Invalid User Code Format

```http
Status: 400 Bad Request
```

```json
{
  "status": "error",
  "message": "user_code must start with 'OC_U'",
  "data": null
}
```

#### Duplicate Resource

```http
Status: 400 Bad Request
```

```json
{
  "status": "error",
  "message": "User already exists",
  "data": null
}
```

#### Invalid Input Type

```http
Status: 422 Unprocessable Entity
```

```json
{
  "status": "error",
  "message": "Invalid input",
  "data": null
}
```

---

### Not Found Errors

#### User Not Found

```http
Status: 404 Not Found
```

```json
{
  "status": "error",
  "message": "User not found",
  "data": null
}
```

#### Match Not Found

```http
Status: 404 Not Found
```

```json
{
  "status": "error",
  "message": "Match not found",
  "data": null
}
```

---

### Server Errors

#### Database Error

```http
Status: 500 Internal Server Error
```

```json
{
  "status": "error",
  "message": "Internal Server Error",
  "data": null
}
```

#### External Service Error

```http
Status: 500 Internal Server Error
```

```json
{
  "status": "error",
  "message": "Failed to connect to Google Drive",
  "data": null
}
```

---

## Client Recommendations

### Safe Response Parsing

Always handle the `data` field safely:

```typescript
interface SafeResponse<T> {
  status: 'success' | 'error';
  message: string;
  data?: T | T[] | null;
}

function handleResponse<T>(response: SafeResponse<T>): T | T[] | null {
  if (response.status === 'error') {
    throw new Error(response.message);
  }
  return response.data ?? null;
}
```

### Error Handling Strategy

```typescript
async function apiCall(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
```

### Token Expiration Handling

```typescript
async function refreshToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    window.location.href = '/login';
    return;
  }

  try {
    const response = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${refreshToken}` }
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
    } else {
      window.location.href = '/login';
    }
  } catch (error) {
    window.location.href = '/login';
  }
}
```

### Retry Strategy

```typescript
async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## Implementation Notes

### Known Issues

1. **Inconsistent Data Shapes**: The `data` field shape varies between endpoints (objects, arrays, ORM objects, cached JSONPath arrays)

2. **SQLAlchemy Query Patterns**: Some queries may use Python boolean operators instead of SQLAlchemy bitwise operators

3. **Session Management**: Some endpoints may not call `session.add()` before committing

4. **WebSocket Authentication**: WebSocket endpoint doesn't enforce JWT by default

### Best Practices

1. **Always check `status` field** before processing `data`
2. **Handle null `data`** gracefully
3. **Log error messages** for debugging
4. **Display user-friendly messages** to end users
5. **Implement retry logic** for transient errors

---

## Related Files

- `backend/app/schemas/base.py` - BaseResponse schema
- `backend/app/main.py` - Global exception handlers
- `backend/app/dependencies/user_auth.py` - Authentication errors
