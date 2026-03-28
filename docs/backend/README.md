# OLYMPIA CUSTOM 3 — Backend API Documentation

Comprehensive API documentation for the OLYMPIA CUSTOM 3 quiz game backend, built with FastAPI.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Response Format](#response-format)
- [API Endpoints](#api-endpoints)
- [WebSocket](#websocket)
- [Developer Resources](#developer-resources)

---

## Overview

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Framework** | FastAPI | Latest (Python 3.12+) |
| **Database** | PostgreSQL | 17 |
| **ORM** | SQLAlchemy | 2.0 (Async) |
| **Cache** | Valkey | 9 (Redis-compatible) |
| **Authentication** | JWT | HS256 |
| **File Import** | Google Drive, Excel | - |

### Base URLs

| Environment | URL |
|-------------|-----|
| **Development** | `http://localhost:8000` |
| **Production** | Configured via environment variables |

### API Documentation

FastAPI auto-generates interactive API docs:

| Documentation | URL |
|---------------|-----|
| **Swagger UI** | `http://localhost:8000/docs` |
| **ReDoc** | `http://localhost:8000/redoc` |
| **OpenAPI JSON** | `http://localhost:8000/openapi.json` |

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy"
}
```

### Project Structure

```
backend/app/
├── main.py              # FastAPI app entry point, WebSocket
├── configs.py           # Configuration management
├── logger.py            # Logging utilities
├── core/                # Business logic layer
│   ├── auth.py          # Authentication logic
│   ├── user.py          # User management
│   ├── match.py         # Match management
│   ├── question.py      # Question management
│   ├── answer.py        # Answer handling
│   ├── record.py        # Score records
│   └── scoreboard.py    # Scoreboard calculation
├── models/              # SQLAlchemy ORM models
│   ├── user.py          # User model
│   ├── match.py         # Match model
│   ├── question.py      # Question model
│   ├── answer.py        # Answer model
│   └── record.py        # Record model
├── schemas/             # Pydantic models
│   ├── base.py          # BaseResponse schema
│   ├── user.py          # User schemas
│   ├── match.py         # Match schemas
│   ├── question.py      # Question schemas
│   ├── answer.py        # Answer schemas
│   ├── record.py        # Record schemas
│   └── scoreboard.py    # Scoreboard schemas
├── routes/              # API routers
│   ├── auth.py          # /auth endpoints
│   ├── user.py          # /users endpoints
│   ├── match.py         # /matches endpoints
│   ├── question.py      # /questions endpoints
│   ├── answer.py        # /answers endpoints
│   ├── record.py        # /records endpoints
│   └── scoreboard.py    # /scoreboard endpoints
├── dependencies/        # Dependency injection
│   ├── postgresql_db.py # Database session
│   ├── user_auth.py     # JWT authentication
│   ├── valkey_store.py  # Valkey connection
│   ├── ws_manager.py    # WebSocket manager
│   └── gcp_services.py  # Google Cloud services
└── utils/               # Helper functions
    ├── ws_connection.py # WebSocket connection manager
    └── gcp_helpers.py   # Google Cloud helpers
```

---

## Authentication

### JWT Token Format

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Token Claims

```json
{
  "sub": "user_code",
  "role": "guest|player|admin",
  "exp": timestamp
}
```

### Token Acquisition

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/signup` | POST | Public | Register new user |
| `/auth/login` | POST | Public | Authenticate and get token |
| `/auth/refresh` | POST | Public | Refresh access token |
| `/auth/logout` | POST | Bearer | Revoke refresh tokens |

### Token Expiration

| Token | Lifetime | Storage |
|-------|----------|---------|
| **Access Token** | 30 minutes (configurable) | Memory/localStorage |
| **Refresh Token** | 7 days (configurable) | localStorage |

### Example Usage

```bash
curl -X GET http://localhost:8000/users/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Response Format

### Standard Response Envelope

All API responses follow the `BaseResponse` schema:

```json
{
  "status": "success",
  "message": "Human-readable message",
  "data": { ... }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"success"` or `"error"` |
| `message` | string | Human-readable description |
| `data` | object/array/null | Response payload |

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

### Error Response Example

```json
{
  "status": "error",
  "message": "User not found",
  "data": null
}
```

### HTTP Status Codes

| Code | Description | Common Scenarios |
|------|-------------|------------------|
| `200 OK` | Success | GET, PATCH, DELETE |
| `201 Created` | Resource created | POST |
| `400 Bad Request` | Invalid input | Validation errors, duplicates |
| `401 Unauthorized` | Auth required | Missing/invalid token |
| `403 Forbidden` | Insufficient permissions | Wrong role |
| `404 Not Found` | Resource not found | Invalid ID |
| `422 Unprocessable Entity` | Validation error | Pydantic validation |
| `500 Internal Server Error` | Server error | Database errors |

See [Errors & Response Envelope](./errors-and-envelope.md) for details.

---

## API Endpoints

### Authentication & Users

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/auth/signup` | POST | Public | Register new user |
| `/auth/login` | POST | Public | Authenticate user |
| `/auth/refresh` | POST | Public | Refresh access token |
| `/auth/logout` | POST | Bearer | Revoke tokens |
| `/auth/send-credentials/{user_code}` | POST | Admin | Email user credentials |
| `/auth/send-reset/{user_code}` | POST | Admin | Send password reset link |
| `/auth/reset-password` | POST | Public | Reset password with token |
| `/auth/request-otp` | POST | Public | Request OTP |
| `/auth/verify-otp` | POST | Public | Verify OTP |
| `/users/` | GET | Admin | List/filter users |
| `/users/{user_code}` | PATCH | Admin | Update user |
| `/users/{user_code}` | DELETE | Admin | Delete user |

### Matches

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/matches/` | POST | Admin | Create match |
| `/matches/` | GET | Admin | Get match details |
| `/matches/{match_code}` | PATCH | Admin | Update match |
| `/matches/{match_code}` | DELETE | Admin | Delete match |

### Questions

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/questions/drive/` | POST | Admin | Import from Google Drive |
| `/questions/excel/` | POST | Admin | Import from Excel |
| `/questions/` | POST | Admin | Create question manually |
| `/questions/` | GET | Admin | Get question details |
| `/questions/{match_code}/{question_code}` | DELETE | Admin | Delete question |

### Answers

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/answers/` | POST | Player/Admin | Submit answer |
| `/answers/` | GET | Admin | Get answer (cache → DB) |
| `/answers/{match_code}/{user_code}/{question_code}` | DELETE | Admin | Delete answer |

### Records

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/records/` | POST | Player/Admin | Record points |
| `/records/` | GET | Player/Admin | Get user records |

### Scoreboard

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/scoreboard/{match_code}` | GET | Admin | Get leaderboard |

### Caching Strategy

The backend uses **Valkey** for caching:

| Endpoint | Cache Behavior |
|----------|----------------|
| `/answers/` | POST writes to cache; GET reads from cache (falls back to PostgreSQL) |
| `/records/` | POST writes to cache, updates leaderboard |
| `/scoreboard/{match_code}` | Reads from Valkey ZSET |

**Note**: Cache invalidation is automatic on write operations.

---

## WebSocket

### Connection Endpoint

```
ws://localhost:8000/ws/{match_code}
```

### Authentication

WebSocket connections do not enforce JWT by default. To add authentication, use `get_ws_user(token)` from `dependencies/user_auth.py`.

### Message Format

#### Client → Server

```json
{
  "type": "send_question|clear_question|navigate|start_the_timer|send_players_info",
  "user_code": "string",
  "question_code": "string (optional)",
  "content": "string (optional)",
  "media_source": "string|array (optional)",
  "time_limit": "number (optional)",
  "path": "string (optional)"
}
```

#### Server → Client

**IMPORTANT**: Backend sends **raw payload objects** (not wrapped in `{ "message": payload }`).

```json
{
  "type": "send_question|clear_question|navigate|start_the_timer|send_players_info|player_score_updated",
  ...
}
```

See [WebSocket API](./websocket.md) for complete message type documentation.

---

## Developer Resources

### Email / SMTP Configuration

Configure SMTP for transactional emails (credentials, password resets, OTPs):

**Environment Variables** (Docker: `configs/.env`, Local: `backend/app/.env`):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password-or-app-password
EMAIL_FROM_NAME="Olympia Custom"
FRONTEND_URL=http://localhost:5173
```

**Notes:**
- For Gmail: Enable 2FA and use an App Password
- `FRONTEND_URL` is used for password reset links

### Running the Application

```bash
# Development mode (auto-reload)
cd backend/app
uvicorn main:app --reload

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000

# Docker Compose
docker-compose up -d --profile development
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | JWT secret key | `your-secret-key` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `7` |
| `POSTGRES_DB_USER` | PostgreSQL username | `oc3_user` |
| `POSTGRES_DB_PASSWORD` | PostgreSQL password | `secure_password` |
| `POSTGRES_DB_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_DB_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB_NAME` | Database name | `oc3_db` |
| `VALKEY_USER` | Valkey username | `default` |
| `VALKEY_PASSWORD` | Valkey password | `valkey_pass` |
| `VALKEY_HOST` | Valkey host | `localhost` |
| `VALKEY_PORT` | Valkey port | `6379` |
| `SERVICE_ACCOUNT_FILE` | GCP service account JSON | `credentials.json` |

### Logging

The backend uses `global_logger` from `logger.py`:

```python
from logger import global_logger

global_logger.info("Application started")
global_logger.error("Database connection failed", exc_info=True)
```

**Log Location**: `logs/backend.log` (daily rotation, 7-day retention)

### Database Patterns

- All operations are **async** (SQLAlchemy 2.0 + asyncpg)
- Use `select()` + `await db.execute()` for queries
- `session.add()` is **not** awaitable
- Always `await` coroutines

### WebSocket Integration

- Endpoint: `GET /ws/{match_code}`
- Valkey pub/sub for multi-instance sync via `ConnectionManager`
- Backend sends raw payloads (not wrapped)
- See [WebSocket API](./websocket.md)

### Frontend Integration

- TypeScript interfaces must match API schemas
- See `frontend/src/types/` for type definitions
- WebSocket messages are raw payloads

### Common Tasks

#### Add a New Endpoint

1. Define schema in `schemas/`
2. Implement business logic in `core/`
3. Create route handler in `routes/`
4. Update documentation in `docs/backend/`

#### Add a New Model

1. Define model in `models/`
2. Create Alembic migration
3. Update schemas if needed
4. Test with Swagger UI

---

## Quick Start

### 1. Register Admin User

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

### 2. Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=OC_U001&password=securepassword123"
```

### 3. Create Match

```bash
curl -X POST http://localhost:8000/matches/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      {"user_code": "OC_U001", "position": 1},
      {"user_code": "OC_U002", "position": 2}
    ]
  }'
```

### 4. Import Questions

```bash
curl -X POST "http://localhost:8000/questions/excel/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>" \
  -F "file=@questions.xlsx"
```

### 5. Start Game via WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/OC3_M001');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "send_question",
    user_code: "OC_U001",
    question_code: "OC3_Q001",
    content: "What is the capital of France?",
    media_source: null
  }));
};
```

---

## Related Documentation

- [Auth](./auth.md)
- [Users](./users.md)
- [Matches](./matches.md)
- [Questions](./questions.md)
- [Answers](./answers.md)
- [Records](./records.md)
- [Scoreboard](./scoreboard.md)
- [WebSocket](./websocket.md)
- [Errors & Envelope](./errors-and-envelope.md)
