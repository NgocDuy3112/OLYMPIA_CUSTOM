# OLYMPIA CUSTOM 3 — Backend API Documentation

Tài liệu này mô tả chi tiết API backend của hệ thống OLYMPIA CUSTOM 3, được xây dựng bằng FastAPI.

## Mục lục

- [Tổng quan](#tổng-quan)
- [Authentication](#authentication)
- [Response Format](#response-format)
- [API Endpoints](#api-endpoints)
- [WebSocket](#websocket)
- [Developer Resources](#developer-resources)

---

## Tổng quan

### Framework & Technology Stack

- **Framework**: FastAPI (Python 3.12+)
- **Database**: PostgreSQL 17 (Async SQLAlchemy 2.0)
- **Cache**: Valkey 9 (Redis-compatible)
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Google Drive & Excel import

### Base URL

- Development: `http://localhost:8000`
- Production: Configured via environment variables

### OpenAPI Documentation

FastAPI tự động generate tài liệu API:

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI JSON**: `http://localhost:8000/openapi.json`

### Health Check

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check if the API is running |

**Response**:

```json
{
  "status": "healthy"
}
```

### Project Structure

```
backend/app/
├── core/          # Business logic layer
├── routes/        # FastAPI route handlers
├── models/        # SQLAlchemy ORM models
├── schemas/       # Pydantic request/response models
├── dependencies/  # Dependency injection (DB, Auth, Valkey)
├── utils/         # Helper functions
└── main.py        # Application entry point
```

---

## Authentication

### JWT Token Format

Tất cả protected endpoints yêu cầu Bearer token trong Authorization header:

```
Authorization: Bearer <access_token>
```

### Token Structure

JWT tokens contain the following claims:

```json
{
  "sub": "user_code",
  "role": "guest|player|admin",
  "exp": timestamp
}
```

### Token Acquisition

| Endpoint | Method | Public | Description |
|----------|--------|--------|-------------|
| `/auth/signup` | POST | ✅ | Register new user |
| `/auth/login` | POST | ✅ | Authenticate and get token |

### Token Usage

```bash
# Example: Get user list (admin only)
curl -X GET http://localhost:8000/users/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Expiration

- Default: Configured via `ACCESS_TOKEN_EXPIRE_MINUTES` environment variable
- Tokens must be refreshed before expiration
- Expired tokens return `401 Unauthorized`

---

## Response Format

### Standard Response Envelope

Tất cả API responses follow the `BaseResponse` schema:

```json
{
  "status": "success" | "error",
  "message": "string",
  "data": "object | array | null"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"success"` or `"error"` |
| `message` | string | Human-readable message |
| `data` | object/array/null | Response payload |

### Error Response Example

```json
{
  "status": "error",
  "message": "User not found",
  "data": null
}
```

### Common Error Codes

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| `400 Bad Request` | Validation Error | Invalid input data (e.g., invalid code format) |
| `401 Unauthorized` | Authentication Error | Missing or invalid token |
| `403 Forbidden` | Authorization Error | Insufficient permissions (wrong role) |
| `404 Not Found` | Not Found Error | Resource doesn't exist |
| `422 Unprocessable Entity` | Validation Error | Pydantic schema validation failure |
| `500 Internal Server Error` | Server Error | Database or server error |

For more details, see [Errors & Response Envelope](./errors-and-envelope.md).

---

## API Endpoints

### Authentication & Users

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/auth/signup` | POST | Public | Register new user |
| `/auth/login` | POST | Public | Authenticate user |
| `/users/` | GET | Admin | List or filter users |
| `/users/{user_code}` | PATCH | Admin | Update user |
| `/users/{user_code}` | DELETE | Admin | Delete user |

### Matches (Trận đấu)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/matches/` | POST | Admin | Create new match |
| `/matches/` | GET | Admin | Get match details |
| `/matches/{match_code}` | PATCH | Admin | Update match |
| `/matches/{match_code}` | DELETE | Admin | Delete match |

### Questions (Câu hỏi)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/questions/drive/` | POST | Admin | Import from Google Drive |
| `/questions/excel/` | POST | Admin | Import from Excel file |
| `/questions/{match_code}/{question_code}` | DELETE | Admin | Delete question |

### Answers (Câu trả lời)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/answers/` | POST | Player/Admin | Submit answer (writes to Valkey cache + PostgreSQL) |
| `/answers/` | GET | Admin | Get most recent answer (reads from Valkey cache, falls back to PostgreSQL) |
| `/answers/{match_code}/{user_code}/{question_code}` | DELETE | Admin | Delete answer |

### Records (Điểm số)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/records/` | POST | Player/Admin | Record points (writes to Valkey cache + PostgreSQL) |
| `/records/` | GET | Player/Admin | Get records for user in match |

### Scoreboard (Bảng xếp hạng)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/scoreboard/{match_code}` | GET | Admin | Get leaderboard |

### Caching Strategy

The backend uses **Valkey** for caching frequently accessed data:

| Endpoint | Cache Behavior |
|----------|----------------|
| `/answers/` | POST writes to cache; GET reads from cache (falls back to PostgreSQL) |
| `/records/` | POST writes to cache |
| `/scoreboard/{match_code}` | Reads from Valkey cache |

**Note**: Cache invalidation is handled automatically on write operations. The cache serves as the primary read source for performance, with PostgreSQL as a fallback.

---

## WebSocket

### Connection Endpoint

```
ws://localhost:8000/ws/{match_code}
```

### Authentication

WebSocket connections currently don't enforce JWT authentication by default. To add authentication, implement token validation using `get_ws_user(token)` from `dependencies/user_auth.py`.

### Message Format

#### Client → Server

```json
{
  "type": "send_question|clear_question|navigate|start_the_timer",
  "user_code": "string",
  "question_code": "string (optional)",
  "content": "string (optional)",
  "media_source": "string|array (optional)",
  "time_limit": "number (optional)",
  "path": "string (optional)"
}
```

#### Server → Client

**NOTE**: Backend sends **raw payload objects directly**. It does NOT wrap outbound frames in a `{ "message": payload }` envelope.

```json
{
  "type": "send_question|clear_question|navigate|start_the_timer|send_players_info",
  ...
}
```

---

## Developer Resources

### Project Structure

```
backend/app/
├── main.py              # FastAPI app entry point, lifespan, WebSocket
├── configs.py           # Configuration management
├── logger.py            # Logging utilities (global_logger)
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
├── schemas/             # Pydantic request/response models
│   ├── base.py          # BaseResponse schema
│   ├── user.py          # User schemas
│   ├── match.py         # Match schemas
│   ├── question.py      # Question schemas
│   ├── answer.py        # Answer schemas
│   ├── record.py        # Record schemas
│   └── scoreboard.py    # Scoreboard schemas
├── routes/              # API endpoints (FastAPI routers)
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

### Running the Application

```bash
# Development mode (with auto-reload)
cd backend/app
uvicorn main:app --reload

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000

# Using Docker Compose
docker-compose up -d --profile development
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | JWT secret key | `your-secret-key-here` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration time | `30` |
| `POSTGRES_DB_USER` | PostgreSQL username | `oc3_user` |
| `POSTGRES_DB_PASSWORD` | PostgreSQL password | `secure_password` |
| `POSTGRES_DB_HOST` | PostgreSQL hostname | `localhost` |
| `POSTGRES_DB_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB_NAME` | PostgreSQL database name | `oc3_db` |
| `VALKEY_USER` | Valkey username | `default` |
| `VALKEY_PASSWORD` | Valkey password | `valkey_password` |
| `VALKEY_HOST` | Valkey hostname | `localhost` |
| `VALKEY_PORT` | Valkey port | `6379` |
| `SERVICE_ACCOUNT_FILE` | GCP service account JSON path | `credentials.json` |

For local development, create `backend/app/.env` with the same variables (use `localhost` for hosts).

---

## Quick Start

### 1. Register a new admin user

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

### 2. Login to get token

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=OC_U001&password=securepassword123"
```

### 3. Create a match

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

### 4. Import questions from Excel

```bash
curl -X POST "http://localhost:8000/questions/excel/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>" \
  -F "file=@questions.xlsx"
```

### 5. Start the game via WebSocket

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

## Mục lục tài liệu

- [Auth](./auth.md)
- [Users](./users.md)
- [Matches](./matches.md)
- [Questions](./questions.md)
- [Answers](./answers.md)
- [Records](./records.md)
- [Scoreboard](./scoreboard.md)
- [WebSocket](./websocket.md)
- [Errors & Envelope](./errors-and-envelope.md)

## Developer Resources

### API Documentation

- **Swagger UI**: `http://localhost:8000/docs` (interactive API exploration)
- **ReDoc**: `http://localhost:8000/redoc` (clean documentation view)
- **OpenAPI JSON**: `http://localhost:8000/openapi.json` (machine-readable spec)

### Logging

The backend uses `global_logger` from `logger.py` for all logging. Logs are written to `logs/backend.log` with daily rotation and 7-day retention.

```python
from logger import global_logger

global_logger.info("Application started")
global_logger.error("Database connection failed", exc_info=True)
```

### Database Patterns

- All database operations are **async** (SQLAlchemy 2.0 + asyncpg)
- Use `select()` + `await db.execute()` for queries
- `session.add()` is **not** awaitable
- Always `await` coroutines; missing `await` is the most common async bug

### WebSocket

- Endpoint: `GET /ws/{match_code}`
- Valkey pub/sub powers room-based broadcasts via `ConnectionManager`
- Protocol defined in [WebSocket API](./websocket.md)
- **Important**: Backend sends raw payload objects (not wrapped in `{ "message": payload }`)

### Frontend Integration

- Frontend TypeScript interfaces must match API schemas exactly
- See `frontend/src/types/` for type definitions
- WebSocket messages are raw payloads (not wrapped in `{ "message": payload }`)

### Common Tasks

#### Add a new endpoint

1. Define schema in `schemas/`
2. Implement business logic in `core/`
3. Create route handler in `routes/`
4. Update documentation in `docs/api/`

#### Add a new model

1. Define model in `models/`
2. Create migration script
3. Update schemas if needed
4. Test with Swagger UI
