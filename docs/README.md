# OLYMPIA CUSTOM 3 - Documentation

Complete documentation for the OLYMPIA CUSTOM 3 quiz game platform.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Documentation Index](#documentation-index)
3. [Quick Links](#quick-links)
4. [Architecture Overview](#architecture-overview)
5. [Development Workflow](#development-workflow)
6. [Support](#support)

---

## Getting Started

### What is OLYMPIA CUSTOM 3?

OLYMPIA CUSTOM 3 is a real-time multiplayer quiz game platform featuring:
- **Admin Interface**: Game control, question management, scoring
- **Player Interface**: Answer submission, buzzer, score display
- **Multiple Game Rounds**: Qualifier, Warm-up, Sprint, Escape, Final stages
- **Real-time Communication**: WebSocket-based live updates
- **Hybrid Database**: PostgreSQL for persistence, Valkey for caching

### Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 18+ | Frontend development |
| **Python** | 3.12+ | Backend development |
| **Docker** | 24+ | Containerization |
| **PostgreSQL** | 17 | Primary database |
| **Valkey** | 9 | Cache and real-time data |

### Quick Start

**1. Clone the repository**:
```bash
git clone https://github.com/your-org/olympia-custom.git
cd olympia-custom
```

**2. Deploy with Podman Compose**:
```bash
# Start all services (production)
./scripts/deploy.sh

# Check status
podman-compose ps
```

**3. Access the application**:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

**4. Create admin user**:
```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "Admin User",
    "user_code": "OC_U001",
    "password": "admin123",
    "role": "admin"
  }'
```

---

## Documentation Index

### Backend Documentation

| Document | Description |
|----------|-------------|
| [Backend README](./backend/README.md) | Complete API reference and development guide |
| [Authentication](./backend/auth.md) | Auth endpoints, OAuth2 flows, security |
| [Users API](./backend/users.md) | User management endpoints |
| [Matches API](./backend/matches.md) | Match creation and management |
| [Questions API](./backend/questions.md) | Question import and CRUD |
| [Answers API](./backend/answers.md) | Answer submission and caching |
| [Records API](./backend/records.md) | Score recording and leaderboards |
| [Scoreboard API](./backend/scoreboard.md) | Leaderboard retrieval |
| [Qualifier API](./backend/qualifier.md) | Qualifier round management |
| [WebSocket API](./backend/websocket.md) | Real-time communication |
| [Media API](./backend/media.md) | Media upload/proxy (S3 + Google Drive) |
| [Errors & Envelope](./backend/errors-and-envelope.md) | Error handling patterns |

---

### Frontend Documentation

| Document | Description |
|----------|-------------|
| [Frontend README](./frontend/README.md) | Overview, environment setup, deployment |
| [API Reference](./frontend/API.md) | HTTP and WebSocket client usage |
| [Architecture](./frontend/ARCHITECTURE.md) | Project structure and patterns |
| [Components](./frontend/COMPONENTS.md) | Component library documentation |

---

### Data Schemas

| Document | Description |
|----------|-------------|
| [Schema Overview](./data-schemas/README.md) | PostgreSQL and Valkey overview |
| [PostgreSQL Schema](./data-schemas/postgresql.md) | Detailed table definitions |
| [Valkey Schema](./data-schemas/valkey.md) | Cache and real-time structures |

---

### Testing

| Document | Description |
|----------|-------------|
| [Test Scenarios](./testing/test-scenarios.md) | Manual and automated test cases |

---

### Deployment & Development

| Document | Description |
|----------|-------------|
| [Deployment Guide](./deployment/README.md) | Production deployment instructions |
| [Development Guide](./development/README.md) | Local setup and contribution guidelines |

---

## Quick Links

### Common Tasks

| Task | Documentation |
|------|---------------|
| **Setup local development** | [Development Guide](./development/README.md#local-setup) |
| **Deploy to production** | [Deployment Guide](./deployment/README.md) |
| **Add new API endpoint** | [Backend README](./backend/README.md#common-tasks) |
| **Create database migration** | [Data Schemas](./data-schemas/README.md#database-migrations) |
| **Run tests** | [Test Scenarios](./testing/test-scenarios.md#automated-testing-setup) |
| **Debug WebSocket issues** | [WebSocket API](./backend/websocket.md#debugging) |

### API Documentation

| Resource | URL |
|----------|-----|
| **Swagger UI** | http://localhost:8000/docs |
| **ReDoc** | http://localhost:8000/redoc |
| **OpenAPI JSON** | http://localhost:8000/openapi.json |

### External Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Valkey Documentation](https://valkey.io/docs/)

---

## Architecture Overview

### System Architecture

```
Browser (React SPA — Admin / MC / Player)
  ├─ HTTP /api/*  ──────────────► FastAPI Backend
  └─ WebSocket /ws/{match_code}?token=JWT
                                    │
                               Valkey pub/sub
                             (channel = match_code)
                                    │
                         ┌──────────┴──────────┐
                       BGM Bot              SFX Bot
                    (bgm_bot.py)         (sfx_bot.py)
                    Discord voice        Discord voice

FastAPI Backend
  ├─ PostgreSQL 17  (persistence)
  ├─ Valkey 9       (cache + leaderboard + pub/sub)
  └─ S3             (question media + audio files)

Production reverse proxy: Nginx + Let's Encrypt (certbot)
```

### Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Frontend** | React + TypeScript | Vite build tool |
| **Styling** | Tailwind CSS | - |
| **Backend** | FastAPI (Python 3.12+) | Async, SQLAlchemy 2.0 |
| **Database** | PostgreSQL 17 | Persistence |
| **Cache / Pub-Sub** | Valkey 9 | Leaderboard ZSET + bot events |
| **Auth** | JWT HS256 | Query param for WebSocket |
| **Discord Bots** | discord.py | BGM + SFX audio in voice channel |
| **Object Storage** | S3-compatible | Audio + question media |
| **Container** | Podman Compose | Production deployment |

---

## Development Workflow

### 1. Local Setup

```bash
# Backend (dependencies managed with uv — no pip install needed)
cp configs/.env.example configs/.env
# Edit configs/.env with your settings

# Frontend
cd frontend
npm install
```

### 2. Start Services

```bash
# Start databases
docker-compose up -d postgresql valkey

# Start backend (development mode)
cd backend/app
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start frontend (development mode)
cd frontend
npm run dev
```

> **Note**: No migrations needed — tables are auto-created on startup via `Base.metadata.create_all`.

### 4. Run Tests

```bash
# Backend tests
cd backend/app
pytest tests/

# Frontend tests
cd frontend
npm test
```

### 5. Code Quality

```bash
# Backend
black backend/app/
isort backend/app/
flake8 backend/app/
mypy backend/app/

# Frontend
npm run lint
```

---

## Game Rounds

| Code | Vietnamese | English | Description |
|------|------------|---------|-------------|
| **VL** | Vòng Loại | Qualifier | Preliminary qualification |
| **KDC** | Khởi Động Chung | Group Warm-up | All players answer same questions |
| **KDR** | Khởi Động Cá Nhân | Individual Warm-up | Individual questions per player |
| **BP** | Bứt Phá | Buzzer Sprint | Fast-paced buzzer round |
| **VDC** | Về Đích Chung | Final Group Stage | Final group round (4 questions, with pick sub-step) |
| **VDR** | Về Đích Cá Nhân | Final Individual Stage | Final individual round (3 questions, with pick sub-step) |
| **GM** | Giải Mã | Decode | Mystery/decoding round |

---

## Support

### Getting Help

1. **Documentation**: Search this documentation first
2. **API Docs**: Visit http://localhost:8000/docs for interactive API reference
3. **Issues**: Report bugs via GitHub Issues
4. **Discussions**: Ask questions in GitHub Discussions

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection errors | [Backend README](./backend/README.md#database-connection-errors) |
| WebSocket disconnections | [WebSocket API](./backend/websocket.md#debugging) |
| Token expiration | [Auth Docs](./backend/auth.md#troubleshooting) |
| Build failures | [Frontend README](./frontend/README.md#troubleshooting) |

### Contributing

See [Development Guide](./development/README.md#contributing) for contribution guidelines.

---

## License

[Add your license information here]

---

## Version

**Current Version**: 3.0.0
**Last Updated**: March 2026
