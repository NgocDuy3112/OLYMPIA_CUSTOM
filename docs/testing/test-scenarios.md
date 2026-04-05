# Test Scenarios — OLYMPIA CUSTOM

Comprehensive test scenarios covering functional, performance, security, and
edge-case testing for the quiz game platform.

---

## 1. Functional Tests

### 1.1 Authentication

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| AUTH-01 | Register new player | POST `/auth/signup` with valid payload | 201, returns access + refresh token |
| AUTH-02 | Login with correct credentials | POST `/auth/login` | 200, returns tokens |
| AUTH-03 | Login with wrong password | POST `/auth/login` with bad password | 401 |
| AUTH-04 | Access admin endpoint with player token | GET `/questions/` with player JWT | 403 |
| AUTH-05 | Access player endpoint with expired token | GET with expired JWT | 401 |
| AUTH-06 | Token refresh | POST `/auth/refresh` with valid refresh token | 200, new access token |

### 1.2 Question Management

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| Q-01 | Import questions from Excel | POST `/questions/excel/` with valid file | 201, questions created |
| Q-02 | Import duplicate questions | POST same Excel twice | 400, duplicate error |
| Q-03 | Get questions by match | GET `/questions/?match_code=OC3_M001` | 200, list of questions |
| Q-04 | Get single question | GET with `question_code` param | 200, single question object |
| Q-05 | Update question | PATCH `/questions/{match}/{code}` | 200, updated fields |
| Q-06 | Delete question | DELETE `/questions/{match}/{code}` | 200, soft-deleted |

### 1.3 Match Management

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| M-01 | Create match | POST `/matches/` with valid payload | 201, match created |
| M-02 | Get match by code | GET `/matches/{code}` | 200, match details |
| M-03 | List all matches | GET `/matches/` | 200, list of matches |
| M-04 | Delete match | DELETE `/matches/{code}` | 200, soft-deleted |

### 1.4 Answer Submission

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| A-01 | Submit valid answer | POST `/answers/` with valid payload | 201, answer recorded |
| A-02 | Submit duplicate answer | POST same answer twice | 400 or idempotent |
| A-03 | Submit answer for wrong match | POST with mismatched match_code | 400 |

### 1.5 Qualifier Round

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| VL-01 | Import qualifier questions | POST `/questions/excel/qualifier/` | 201, questions created |
| VL-02 | Calculate scores for question | POST `/qualifier/calculate-scores` | 200, score updates returned |
| VL-03 | End round 1 (8 players advance) | POST `/qualifier/end-round` with round_number=1 | 200, 8 passed, reserves marked |
| VL-04 | End round 2 (4 players advance) | POST `/qualifier/end-round` with round_number=2 | 200, 4 passed from uncategorized |
| VL-05 | End round 3 (2 players advance) | POST `/qualifier/end-round` with round_number=3 | 200, 2 passed from uncategorized |
| VL-06 | End round 4 (2 players advance) | POST `/qualifier/end-round` with round_number=4 | 200, 2 passed from uncategorized |
| VL-07 | End round 5 (fill to 16) | POST `/qualifier/end-round` with round_number=5 | 200, reserves fill to 16 total |
| VL-08 | Get standings | GET `/qualifier/standings/{match_code}` | 200, sorted by score |
| VL-09 | Get advancements | GET `/qualifier/advancements/{match_code}` | 200, all advancement records |
| VL-10 | Override advance count | POST `/qualifier/end-round` with advance_count=5 | 200, 5 players advance |
| VL-11 | Invalid round number | POST `/qualifier/end-round` with round_number=6 | 400, validation error |
| VL-12 | Player access standings | GET `/qualifier/standings/{match_code}` with player JWT | 200, standings returned |
| VL-13 | Player access advancements | GET `/qualifier/advancements/{match_code}` with player JWT | 403, forbidden |

### 1.6 Media Proxy

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| MED-01 | Stream image by file_id | GET `/media/drive/?file_id=...` | 200, image/jpeg |
| MED-02 | Stream video by file_name | GET `/media/drive/?file_name=...` | 200, video/mp4 |
| MED-03 | Stream audio | GET with audio file | 200, audio/mpeg |
| MED-04 | File not found | GET with invalid file_id | 404 |
| MED-05 | Unsupported MIME type | GET with PDF file_id | 400 |
| MED-06 | Unauthenticated access | GET without JWT | 401 |

---

## 2. Performance Tests

### 2.1 WebSocket Load Test

| ID | Scenario | Tool | Target |
|----|----------|------|--------|
| PERF-01 | 100 concurrent WS connections | `scripts/load_test_qualifier.py` | p95 connect < 2s |
| PERF-02 | 300 concurrent WS connections | `scripts/load_test_qualifier.py` | p95 connect < 5s |
| PERF-03 | 300 simultaneous answers | `scripts/load_test_qualifier.py` | p95 answer < 3s |
| PERF-04 | Sustained 50 users for 10 min | Custom script | No memory leak |

**Run load test:**
```bash
cd scripts
pip install aiohttp websockets
python load_test_qualifier.py --users 300 --ramp-up 10
```

### 2.2 API Throughput

| ID | Scenario | Tool | Target |
|----|----------|------|--------|
| PERF-05 | 1000 GET /questions/ requests | `ab` or `wrk` | > 500 req/s |
| PERF-06 | 100 concurrent POST /answers/ | `wrk` | < 500ms p95 |
| PERF-07 | Media streaming 50 concurrent | `curl` parallel | < 2s TTFB |

---

## 3. Security Tests

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| SEC-01 | SQL injection in query params | GET `/questions/?match_code='; DROP TABLE--` | 400, no SQL error |
| SEC-02 | XSS in answer content | POST answer with `<script>alert(1)</script>` | Sanitized or rejected |
| SEC-03 | JWT tampering | Modify JWT payload and sign with wrong key | 401 |
| SEC-04 | Path traversal in media | GET `/media/drive/?file_name=../../etc/passwd` | 400 or 404 |
| SEC-05 | Rate limiting | 1000 login requests in 1 min | Throttled after threshold |
| SEC-06 | CORS misconfiguration | Request from evil.com | Rejected or no credentials |
| SEC-07 | WebSocket origin check | Connect from unauthorized origin | Rejected |

---

## 4. Edge Cases

| ID | Scenario | Expected |
|----|----------|----------|
| EDGE-01 | Player disconnects mid-game | Server cleans up, no crash |
| EDGE-02 | Two players with same user_code | Second rejected or handled |
| EDGE-03 | Answer submitted after timer expires | Rejected or flagged |
| EDGE-04 | Match with 0 questions | Graceful error, no crash |
| EDGE-05 | Media file > 100 MB | Chunked streaming, no OOM |
| EDGE-06 | Valkey connection lost | REST API still works, WS degrades |
| EDGE-07 | PostgreSQL connection pool exhausted | Queue or 503, no hang |
| EDGE-08 | Concurrent admin actions on same match | Last-write-wins or conflict handling |

---

## 5. Integration Tests

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| INT-01 | Full game flow | Create match → import questions → players join → answer → score | End-to-end success |
| INT-02 | WebSocket broadcast | Admin sends navigate → all players receive | All 4 players get message |
| INT-03 | Scoreboard update | Player answers → scoreboard recalculates | Correct ranking |
| INT-04 | Media in question display | Question with media_url → frontend renders | Image/audio/video displays |

---

## 6. Deployment Tests

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| DEP-01 | Fresh VPS deploy | Follow deploy/README.md | All 5 containers healthy |
| DEP-02 | HTTPS certificate | Check certbot logs | Valid cert, no errors |
| DEP-03 | Auto-restart after crash | `podman stop olympia-app` | Container restarts automatically |
| DEP-04 | Database migration on deploy | `podman compose up -d --build` | Alembic runs, no errors |
| DEP-05 | Frontend assets served | Visit domain in browser | Page loads, no 404 |

---

## 7. Automated Testing Setup

### Backend Testing (Pytest)

**Install test dependencies**:
```bash
pip install pytest pytest-asyncio pytest-cov httpx factory-boy
```

**Directory structure**:
```
backend/app/
├── tests/
│   ├── conftest.py           # Fixtures and setup
│   ├── test_auth.py          # Auth tests
│   ├── test_users.py         # User tests
│   ├── test_matches.py       # Match tests
│   ├── test_questions.py     # Question tests
│   ├── test_answers.py       # Answer tests
│   ├── test_records.py       # Record tests
│   └── integration/
│       ├── test_game_flow.py # End-to-end tests
│       └── test_websocket.py # WebSocket tests
```

**Run tests**:
```bash
# Run all tests
pytest tests/

# Run with coverage
pytest tests/ --cov=backend/app --cov-report=html

# Run specific test file
pytest tests/test_auth.py

# Run with verbose output
pytest tests/ -v
```

---

### Frontend Testing (Vitest + React Testing Library)

**Install test dependencies**:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

**Run tests**:
```bash
# Run all tests
npm test

# Run in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/components/InputField.test.tsx
```

---

### Integration Tests (Playwright)

**Install Playwright**:
```bash
npm install -D @playwright/test
npx playwright install
```

**Directory structure**:
```
frontend/
├── e2e/
│   ├── auth.spec.ts          # Authentication tests
│   ├── game-flow.spec.ts     # Game flow tests
│   └── admin/
│       ├── matches.spec.ts   # Match management
│       └── questions.spec.ts # Question management
```

**Run tests**:
```bash
# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific file
npx playwright test e2e/auth.spec.ts

# Run with specific browser
npx playwright test --project=chromium
```

---

## 8. CI/CD Integration

### GitHub Actions Workflow

**Key stages**:
1. **Backend Tests**: Pytest with PostgreSQL and Valkey services
2. **Frontend Tests**: Vitest + ESLint
3. **E2E Tests**: Playwright with full stack
4. **Build**: Docker images
5. **Deploy**: Kubernetes or VPS

**Coverage upload**:
```yaml
- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage.xml
    flags: backend
```

---

## 9. Test Coverage Goals

| Component | Target | Description |
|-----------|--------|-------------|
| **Backend** | 80% | Core business logic, API endpoints |
| **Frontend Components** | 75% | Shared and critical components |
| **Frontend Hooks** | 90% | WebSocket, session management |
| **E2E Critical Paths** | 100% | Login, game flow, scoring |

### Critical Paths (Must Test)

1. User authentication (signup, login, refresh)
2. Match creation and management
3. Question import and display
4. Answer submission and scoring
5. WebSocket connection and reconnection
6. Scoreboard updates
7. Admin game control flows

---

## Related Documentation
