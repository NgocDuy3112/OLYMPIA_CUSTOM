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
│   ├── scoreboard.py    # Scoreboard calculation
│   └── qualifier.py     # Qualifier round logic
├── models/              # SQLAlchemy ORM models
│   ├── user.py          # User model
│   ├── match.py         # Match model
│   ├── question.py      # Question model
│   ├── answer.py        # Answer model
│   ├── record.py        # Record model
│   ├── password_reset_token.py  # Password reset tokens
│   ├── qualifier_advancement.py # Qualifier advancements
│   └── qualifier_record.py      # Qualifier-specific records
├── schemas/             # Pydantic models
│   ├── base.py          # BaseResponse schema
│   ├── user.py          # User schemas
│   ├── match.py         # Match schemas
│   ├── question.py      # Question schemas
│   ├── answer.py        # Answer schemas
│   ├── record.py        # Record schemas
│   ├── scoreboard.py    # Scoreboard schemas
│   └── qualifier.py     # Qualifier schemas
├── routes/              # API routers
│   ├── auth.py          # /auth endpoints
│   ├── user.py          # /users endpoints
│   ├── match.py         # /matches endpoints
│   ├── question.py      # /questions endpoints
│   ├── answer.py        # /answers endpoints
│   ├── record.py        # /records endpoints
│   ├── scoreboard.py    # /scoreboard endpoints
│   ├── qualifier.py     # /qualifier endpoints
│   └── media.py         # /media endpoints
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
  "role": "guest|player|mc|admin",
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

### Qualifier

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/qualifier/advance` | POST | Admin | Advance players from qualifier |
| `/qualifier/records/` | POST | Admin | Record qualifier points |
| `/qualifier/records/` | GET | Admin | Get qualifier records |
| `/qualifier/advancements/` | GET | Admin | Get qualifier advancements |

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
| `DRIVE_CREDENTIALS_FILE` | Google Drive OAuth credentials JSON | `credentials.json` |

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

## Development Workflow

### Local Development Setup

1. **Clone and Install Dependencies**:
```bash
cd backend/app
pip install -r requirements.txt
```

2. **Environment Configuration**:
```bash
# Copy example environment file
cp configs/.env.example configs/.env

# Edit with your settings
nano configs/.env
```

3. **Start Services with Docker Compose**:
```bash
# Start PostgreSQL and Valkey only
docker-compose up -d postgres valkey

# Or start all services including backend
docker-compose up -d --profile development
```

4. **Run Database Migrations**:
```bash
cd backend/app
alembic upgrade head
```

5. **Start Development Server**:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Code Style and Quality

The project uses the following tools for code quality:

| Tool | Purpose | Command |
|------|---------|---------|
| **Black** | Code formatting | `black backend/app/` |
| **isort** | Import sorting | `isort backend/app/` |
| **Flake8** | Linting | `flake8 backend/app/` |
| **MyPy** | Type checking | `mypy backend/app/` |
| **Pytest** | Testing | `pytest tests/` |

**Pre-commit Hook Setup**:
```bash
pip install pre-commit
pre-commit install
```

### Debugging

**Using VS Code**:
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FastAPI: Debug",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "main:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000"
      ],
      "jinja": true,
      "justMyCode": true
    }
  ]
}
```

**Logging**:
```python
from logger import global_logger

# Different log levels
global_logger.debug("Debug message")
global_logger.info("Info message")
global_logger.warning("Warning message")
global_logger.error("Error message", exc_info=True)
global_logger.critical("Critical message")
```

---

## Troubleshooting

### Common Issues

#### Database Connection Errors

**Problem**: `Connection refused` or `could not connect to server`

**Solutions**:
1. Check if PostgreSQL is running:
```bash
docker-compose ps
```

2. Verify connection string:
```bash
# Test connection
psql postgresql://oc3_user:secure_password@localhost:5432/oc3_db
```

3. Check PostgreSQL logs:
```bash
docker-compose logs postgres
```

#### Valkey Connection Errors

**Problem**: `ERR AUTH <password> called without any password configured`

**Solutions**:
1. Check Valkey configuration in `docker-compose.yaml`
2. Verify password in environment variables
3. Test connection:
```bash
docker-compose exec valkey valkey-cli -a your_password ping
```

#### JWT Token Issues

**Problem**: `Token has expired` or `Could not validate credentials`

**Solutions**:
1. Check token expiration time in response
2. Implement token refresh logic (see [Auth](./auth.md#token-management))
3. Verify `SECRET_KEY` matches between deployments

#### WebSocket Disconnections

**Problem**: Frequent WebSocket disconnections

**Solutions**:
1. Check network stability
2. Verify load balancer WebSocket support (if applicable)
3. Increase timeout settings:
```python
# In uvicorn configuration
--timeout-keep-alive 300
```

4. Check Valkey pub/sub connection:
```bash
docker-compose logs -f olympia-app | grep "WebSocket"
```

#### Import Errors (Google Drive)

**Problem**: `Failed to import from Google Drive`

**Solutions**:
1. Verify `credentials.json` exists in `backend/app/`
2. Check Google Drive API is enabled
3. Verify service account has Drive access
4. Check `DRIVE_CREDENTIALS_FILE` environment variable

### Performance Issues

#### Slow Database Queries

**Diagnosis**:
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

**Solutions**:
1. Add indexes on frequently queried columns
2. Use `EXPLAIN ANALYZE` to understand query plans
3. Consider connection pooling adjustments

#### High Memory Usage

**Diagnosis**:
```bash
# Check container memory
docker stats

# Check Valkey memory
docker-compose exec valkey valkey-cli INFO memory
```

**Solutions**:
1. Adjust Valkey `maxmemory` policy
2. Review cache TTL settings
3. Implement pagination for large datasets

---

## Deployment

### Production Checklist

Before deploying to production:

- [ ] Set strong `SECRET_KEY` (min 32 characters)
- [ ] Configure production database credentials
- [ ] Set up SSL/TLS certificates
- [ ] Configure backup strategy for PostgreSQL
- [ ] Set up monitoring and alerting
- [ ] Review and update CORS origins
- [ ] Configure rate limiting
- [ ] Set up log aggregation
- [ ] Test disaster recovery procedures

### Environment Variables for Production

```bash
# Security
SECRET_KEY=your-super-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
POSTGRES_DB_USER=production_user
POSTGRES_DB_PASSWORD=very-secure-password
POSTGRES_DB_HOST=your-db-host
POSTGRES_DB_PORT=5432
POSTGRES_DB_NAME=olympia_production

# Valkey
VALKEY_USER=default
VALKEY_PASSWORD=secure-valkey-password
VALKEY_HOST=your-valkey-host
VALKEY_PORT=6379

# Email/SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-app-password
EMAIL_FROM_NAME="Olympia Custom"
FRONTEND_URL=https://your-domain.com

# Google Drive
DRIVE_CREDENTIALS_FILE=credentials.json

# CORS
ALLOWED_ORIGINS=https://your-domain.com,https://admin.your-domain.com

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### Docker Deployment

See [deploy/README.md](../../deploy/README.md) for comprehensive deployment instructions.

**Quick Deploy**:
```bash
# Build and start all services
docker-compose -f docker-compose.prod.yaml up -d --build

# Check health
curl http://localhost:8000/health

# View logs
docker-compose logs -f
```

### Scaling Considerations

**Horizontal Scaling**:
1. Use external PostgreSQL (not Docker)
2. Use external Valkey cluster
3. Configure load balancer with WebSocket support
4. Enable Valkey pub/sub for multi-instance sync

**Vertical Scaling**:
- Increase PostgreSQL connection pool
- Increase Valkey memory limit
- Adjust Uvicorn workers: `--workers 4`

---

## Monitoring and Observability

### Health Checks

```bash
# Basic health check
curl http://localhost:8000/health

# Detailed health check (with database)
curl http://localhost:8000/health/detailed
```

### Metrics to Monitor

| Metric | Tool | Alert Threshold |
|--------|------|-----------------|
| API Response Time | Prometheus/Grafana | p95 > 500ms |
| Error Rate | Prometheus/Grafana | > 1% |
| Database Connections | pg_stat_activity | > 80% pool |
| Valkey Memory | INFO memory | > 80% maxmemory |
| WebSocket Connections | Custom metric | Sudden drop |
| Disk Usage | Node exporter | > 85% |

### Log Aggregation

Recommended stack:
- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **Loki + Grafana**: Lightweight alternative
- **Cloud**: AWS CloudWatch, GCP Cloud Logging

---

## API Versioning

Current API version: **v1** (implicit)

Future versions should follow:
```
/api/v1/...
/api/v2/...
```

Version migration strategy:
1. Deprecate old version (6 months notice)
2. Maintain both versions during transition
3. Document breaking changes in changelog

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
