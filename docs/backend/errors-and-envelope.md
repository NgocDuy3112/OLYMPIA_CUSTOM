# Errors & Response Envelope

This document describes the error handling and response format conventions.

---

## Table of Contents

- [Standard Response Envelope](#standard-response-envelope)
- [Error Response Format](#error-response-format)
- [HTTP Status Codes](#http-status-codes)
- [Common Error Scenarios](#common-error-scenarios)
- [Client Recommendations](#client-recommendations)

---

## Standard Response Envelope

All API responses follow the `BaseResponse` schema defined in `backend/app/schemas/base.py`:

```typescript
{
  status: "success" | "error";
  message: string;
  data?: object | array | null;
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Indicates success (`"success"`) or error (`"error"`) |
| `message` | string | Human-readable message describing the result |
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
| `200 OK` | Request successful | GET, PATCH, DELETE success |
| `201 Created` | Resource created | POST success |
| `204 No Content` | Resource deleted | DELETE success (no response body) |

### Client Error Codes

| Code | Description | Usage |
|------|-------------|-------|
| `400 Bad Request` | Invalid input data | Validation errors, duplicate resources |
| `401 Unauthorized` | Missing or invalid authentication | Missing token, expired token |
| `403 Forbidden` | Insufficient permissions | Wrong role for endpoint |
| `404 Not Found` | Resource not found | Invalid ID, non-existent resource |
| `422 Unprocessable Entity` | Validation error | Pydantic validation failures |

### Server Error Codes

| Code | Description | Usage |
|------|-------------|-------|
| `500 Internal Server Error` | Server error | Database errors, unexpected exceptions |

---

## Common Error Scenarios

### 1. Authentication Errors

#### Missing Token

```
Status: 401 Unauthorized
Response:
{
  "status": "error",
  "message": "Not authenticated",
  "data": null
}
```

#### Invalid Token

```
Status: 401 Unauthorized
Response:
{
  "status": "error",
  "message": "Could not validate credentials",
  "data": null
}
```

#### Expired Token

```
Status: 401 Unauthorized
Response:
{
  "status": "error",
  "message": "Token has expired",
  "data": null
}
```

---

### 2. Authorization Errors

#### Insufficient Role

```
Status: 403 Forbidden
Response:
{
  "status": "error",
  "message": "Not enough permissions",
  "data": null
}
```

---

### 3. Validation Errors

#### Invalid User Code Format

```
Status: 400 Bad Request
Response:
{
  "status": "error",
  "message": "user_code must start with 'OC_U'",
  "data": null
}
```

#### Duplicate Resource

```
Status: 400 Bad Request
Response:
{
  "status": "error",
  "message": "User already exists",
  "data": null
}
```

#### Invalid Input Type

```
Status: 422 Unprocessable Entity
Response:
{
  "status": "error",
  "message": "Invalid input",
  "data": null
}
```

---

### 4. Not Found Errors

#### User Not Found

```
Status: 404 Not Found
Response:
{
  "status": "error",
  "message": "User not found",
  "data": null
}
```

#### Match Not Found

```
Status: 404 Not Found
Response:
{
  "status": "error",
  "message": "Match not found",
  "data": null
}
```

---

### 5. Server Errors

#### Database Error

```
Status: 500 Internal Server Error
Response:
{
  "status": "error",
  "message": "Internal Server Error",
  "data": null
}
```

#### External Service Error

```
Status: 500 Internal Server Error
Response:
{
  "status": "error",
  "message": "Failed to connect to Google Drive",
  "data": null
}
```

---

## Client Recommendations

### 1. Safe Response Parsing

Always handle the `data` field safely as it can be `object`, `array`, or `null`:

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

### 2. Error Handling Strategy

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

### 3. Token Expiration Handling

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

### 4. Retry Strategy

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

### Route-Level Exception Handling

Some endpoints wrap errors in a generic `500` response. This is a known issue that should be addressed in future updates.

### Inconsistent Data Shapes

The `data` field shape varies between endpoints:
- Some return plain objects
- Some return arrays
- Some return ORM objects
- Some return cached JSONPath arrays

Always check the specific endpoint documentation for the expected `data` shape.

### Known Issues

1. **SQLAlchemy Query Patterns**: Some core queries use Python boolean operators (`and`/`or`) instead of SQLAlchemy bitwise operators (`&`/`|`), which may cause unexpected behavior.

2. **Session Management**: Some endpoints don't call `session.add()` before committing, which may cause data not to be persisted.

3. **WebSocket Authentication**: The WebSocket endpoint doesn't enforce JWT authentication by default.

4. **Error Messages**: Some errors may not provide detailed information for security reasons.
