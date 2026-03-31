# Development Guide

Local development setup and contribution guidelines for OLYMPIA CUSTOM 3.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [Development Workflow](#development-workflow)
4. [Code Style](#code-style)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Git Workflow](#git-workflow)
8. [Contributing](#contributing)
9. [Project Structure](#project-structure)

---

## Prerequisites

### Required Software

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| **Git** | 2.40+ | Version control | [git-scm.com](https://git-scm.com/) |
| **Python** | 3.12+ | Backend runtime | [python.org](https://www.python.org/) |
| **Node.js** | 18+ | Frontend runtime | [nodejs.org](https://nodejs.org/) |
| **Docker** | 24+ | Containerization | [docker.com](https://www.docker.com/) |
| **Docker Compose** | 2.20+ | Multi-container | Included with Docker |

### Recommended Tools

| Tool | Purpose |
|------|---------|
| **VS Code** | Code editor |
| **Postman** | API testing |
| **pgAdmin** | PostgreSQL GUI |
| **Another Redis Desktop Manager** | Valkey GUI |
| **TablePlus** | Database client |

---

## Local Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/olympia-custom.git
cd olympia-custom
```

### 2. Setup Backend

```bash
cd backend/app

# Create virtual environment
python -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp configs/.env.example configs/.env

# Edit environment file
nano configs/.env
```

**configs/.env** (Development):
```bash
# Security
SECRET_KEY=dev-secret-key-not-for-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
POSTGRES_DB_USER=oc3_user
POSTGRES_DB_PASSWORD=dev_password
POSTGRES_DB_HOST=localhost
POSTGRES_DB_PORT=5432
POSTGRES_DB_NAME=oc3_db

# Valkey
VALKEY_USER=default
VALKEY_PASSWORD=dev_password
VALKEY_HOST=localhost
VALKEY_PORT=6379

# Email/SMTP (use Mailtrap for development)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-user
SMTP_PASSWORD=your-mailtrap-password
EMAIL_FROM_NAME="Olympia Dev"
FRONTEND_URL=http://localhost:5173

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Logging
LOG_LEVEL=DEBUG
LOG_FORMAT=colored

# Google Drive
DRIVE_CREDENTIALS_FILE=credentials.json

# Application
ENVIRONMENT=development
DEBUG=True
```

### 3. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit environment file
nano .env
```

**.env** (Development):
```bash
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_ENABLE_DEBUG=true
VITE_ENABLE_MOCK_API=false
```

### 4. Start Services

```bash
# From project root
# Start PostgreSQL and Valkey
docker-compose up -d postgres valkey

# Wait for services to be ready
sleep 10

# Verify services
docker-compose ps
```

### 5. Run Migrations

```bash
cd backend/app
source venv/bin/activate  # If not already activated
alembic upgrade head
```

### 6. Create Admin User

```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "Developer Admin",
    "user_code": "OC_U001",
    "password": "devpassword123",
    "role": "admin"
  }'
```

---

## Development Workflow

### Starting Development Servers

**Terminal 1 - Backend**:
```bash
cd backend/app
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend**:
```bash
cd frontend
npm run dev
```

**Terminal 3 - Database Logs**:
```bash
docker-compose logs -f postgres valkey
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | React application |
| **Backend API** | http://localhost:8000 | FastAPI server |
| **Swagger UI** | http://localhost:8000/docs | Interactive API docs |
| **ReDoc** | http://localhost:8000/redoc | API documentation |
| **PostgreSQL** | localhost:5432 | Database |
| **Valkey** | localhost:6379 | Cache |

---

## Code Style

### Backend (Python)

**Install development tools**:
```bash
pip install black isort flake8 mypy pytest pytest-cov
```

**Formatting**:
```bash
# Sort imports
isort backend/app/

# Format code
black backend/app/

# Lint code
flake8 backend/app/

# Type checking
mypy backend/app/
```

**.flake8**:
```ini
[flake8]
max-line-length = 100
exclude = venv,alembic,__pycache__,.git
ignore = E203,W503
```

**pyproject.toml** (Black configuration):
```toml
[tool.black]
line-length = 100
target-version = ['py312']
include = '\.pyi?$'
exclude = '''
/(
    \.git
  | venv
  | alembic
  | __pycache__
)/
'''
```

### Frontend (TypeScript/React)

**Formatting**:
```bash
# Lint code
npm run lint

# Format code (if Prettier is configured)
npm run format
```

**.eslintrc.cjs**:
```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
```

---

## Testing

### Backend Testing

```bash
cd backend/app
source venv/bin/activate

# Run all tests
pytest tests/

# Run with coverage
pytest tests/ --cov=backend/app --cov-report=html --cov-report=term-missing

# Run specific test file
pytest tests/test_auth.py -v

# Run specific test function
pytest tests/test_auth.py::test_signup_success -v

# Run tests by marker
pytest tests/ -m "not slow" -v
```

### Frontend Testing

```bash
cd frontend

# Run all tests
npm test

# Run in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/components/InputField.test.tsx

# Run with UI
npx vitest --ui
```

### E2E Testing

```bash
cd frontend

# Install Playwright browsers
npx playwright install

# Run all E2E tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific browser
npx playwright test --project=chromium

# Generate HTML report
npx playwright show-report
```

---

## Debugging

### Backend Debugging

**VS Code launch.json**:
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
      "justMyCode": true,
      "env": {
        "DEBUG": "true"
      }
    }
  ]
}
```

**Using Python debugger**:
```python
import pdb; pdb.set_trace()  # Traditional breakpoint
breakpoint()  # Python 3.7+
```

**Logging**:
```python
from logger import global_logger

global_logger.debug("Debug message with %s", variable)
global_logger.info("Info message")
global_logger.warning("Warning message")
global_logger.error("Error message", exc_info=True)
```

### Frontend Debugging

**VS Code launch.json**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Chrome: Launch",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/frontend/src"
    },
    {
      "type": "chrome",
      "request": "attach",
      "name": "Chrome: Attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/frontend/src"
    }
  ]
}
```

**React DevTools**:
- Install React DevTools extension
- Use Components tab for component tree
- Use Profiler tab for performance

**Console debugging**:
```typescript
console.log('Debug:', data)
console.table(arrayOfObjects)
console.trace('Trace execution')
```

### WebSocket Debugging

**Browser DevTools**:
1. Open DevTools → Network → WS
2. Click on WebSocket connection
3. View Messages tab for frames

**Backend logging**:
```python
from logger import global_logger

async def websocket_endpoint(websocket: WebSocket, match_code: str):
    global_logger.info(f"WebSocket connection opened for {match_code}")
    try:
        while True:
            data = await websocket.receive_json()
            global_logger.debug(f"Received: {data}")
            # Process message
    except WebSocketDisconnect:
        global_logger.info(f"WebSocket disconnected: {match_code}")
```

---

## Git Workflow

### Branch Strategy

```
main (production-ready)
├── develop (integration branch)
│   ├── feature/user-authentication
│   ├── feature/question-import
│   ├── bugfix/login-issue
│   └── hotfix/critical-fix
```

### Commit Message Convention

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

**Example**:
```
feat(auth): add OAuth2 support

- Implement OAuth2 authorization code flow
- Add /oauth/authorize endpoint
- Add /oauth/token endpoint
- Update authentication documentation

Closes #123
```

### Common Git Commands

```bash
# Create feature branch
git checkout -b feature/your-feature

# Stage changes
git add .

# Commit
git commit -m "feat(scope): description"

# Push branch
git push origin feature/your-feature

# Rebase on latest develop
git fetch origin develop
git rebase origin/develop

# Squash commits before merge
git rebase -i HEAD~3

# Create PR (GitHub CLI)
gh pr create --title "feat: description" --body "Description of changes"
```

---

## Contributing

### Pull Request Process

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes** following code style guidelines
4. **Write tests** for new functionality
5. **Run tests** and ensure all pass
6. **Update documentation** if needed
7. **Commit** with conventional commit messages
8. **Push** to your fork
9. **Create Pull Request** with clear description
10. **Address review comments**
11. **Squash commits** if requested
12. **Merge** after approval

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests pass locally

## Related Issues
Closes #123
```

### Code Review Guidelines

**Reviewers should check**:
- Code correctness and logic
- Test coverage
- Performance implications
- Security considerations
- Documentation completeness
- Adherence to coding standards

**Review response time**: Within 48 hours

---

## Project Structure

```
olympia-custom/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI application
│       ├── configs.py           # Configuration
│       ├── logger.py            # Logging setup
│       ├── core/                # Business logic
│       ├── models/              # SQLAlchemy models
│       ├── schemas/             # Pydantic schemas
│       ├── routes/              # API routes
│       ├── dependencies/        # Dependency injection
│       ├── utils/               # Utilities
│       ├── tests/               # Tests
│       └── alembic/             # Database migrations
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── contexts/            # React contexts
│   │   ├── hooks/               # Custom hooks
│   │   ├── pages/               # Page components
│   │   ├── routes/              # Route definitions
│   │   ├── types/               # TypeScript types
│   │   ├── utils/               # Utilities
│   │   └── configs.ts           # Configuration
│   ├── tests/                   # Tests
│   └── e2e/                     # E2E tests
├── docs/                        # Documentation
├── configs/                     # Configuration files
├── scripts/                     # Utility scripts
├── docker-compose.yaml          # Docker Compose (development)
└── docker-compose.prod.yaml     # Docker Compose (production)
```

---

## Common Development Tasks

### Add New API Endpoint

1. **Define schema** in `backend/app/schemas/`
2. **Implement business logic** in `backend/app/core/`
3. **Create route handler** in `backend/app/routes/`
4. **Add tests** in `backend/app/tests/`
5. **Update documentation** in `docs/backend/`
6. **Test with Swagger UI**

### Add New React Component

1. **Create component** in `frontend/src/components/`
2. **Add TypeScript types** in `frontend/src/types/`
3. **Write tests** in `frontend/tests/`
4. **Export from index** file
5. **Document** in `docs/frontend/COMPONENTS.md`

### Database Migration

1. **Modify model** in `backend/app/models/`
2. **Generate migration**: `alembic revision --autogenerate -m "description"`
3. **Review migration** in `alembic/versions/`
4. **Test migration**: `alembic upgrade head`
5. **Test rollback**: `alembic downgrade -1`
6. **Commit migration** file

---

## Troubleshooting

### Common Issues

**Problem**: Port already in use

**Solution**:
```bash
# Find process using port
lsof -i :8000
lsof -i :5173

# Kill process
kill -9 <PID>

# Or use different port
uvicorn main:app --reload --port 8001
npm run dev -- --port 5174
```

**Problem**: Database connection error

**Solution**:
```bash
# Check Docker containers
docker-compose ps

# Restart database
docker-compose restart postgres

# Check connection string
cat configs/.env

# Test connection
psql postgresql://user:pass@localhost:5432/dbname
```

**Problem**: Node modules issues

**Solution**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Problem**: Python virtual environment issues

**Solution**:
```bash
cd backend/app
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## Related Documentation

- [Main Documentation](../README.md) - Documentation index
- [Backend README](../backend/README.md) - Backend API reference
- [Frontend README](../frontend/README.md) - Frontend reference
- [Deployment Guide](../deployment/README.md) - Production deployment
