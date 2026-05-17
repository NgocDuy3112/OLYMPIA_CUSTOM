# Frontend API & WebSocket Documentation

Complete reference for all HTTP API endpoints and WebSocket communication used in the OLYMPIA CUSTOM 3 frontend.

---

## Table of Contents

1. [Configuration](#configuration)
2. [HTTP API](#http-api)
3. [WebSocket](#websocket)
4. [Session Management](#session-management)
5. [Message Types Reference](#message-types-reference)
6. [Error Handling](#error-handling)

---

## Configuration

### Base URLs

Defined in `src/configs.ts`:

```typescript
export const API_BASE_URL = "http://localhost:8000";
export const WS_BASE_URL = "ws://localhost:8000";
```

**Production**: Use environment variables to configure production URLs.

### API Client Setup

```typescript
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function apiCall(endpoint: string, options?: RequestInit) {
  const token = localStorage.getItem("jwtToken_admin") || 
                sessionStorage.getItem("jwtToken_player");
  
  const headers = {
    ...options?.headers,
    "Authorization": token ? `Bearer ${token}` : "",
    "Content-Type": "application/json",
  };

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}
```

---

## HTTP API

### Authentication Endpoints

#### POST `/auth/login`

Login and obtain JWT tokens.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ 
    username: "OC_U001", 
    password: "password123" 
  })
});

const data = await response.json();
// { access_token, refresh_token, token_type, role, user_code, user_name }
```

**Response**:
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

---

#### POST `/auth/signup`

Register a new user.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_name: "Nguyen Van A",
    user_code: "OC_U001",
    password: "password123",
    role: "player"  // Optional, default: "player"
  })
});
```

**Response**: Same as `/auth/login`

---

#### POST `/auth/refresh`

Refresh access token.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    refresh_token: "stored-refresh-token"
  })
});
```

**Response**: Same as `/auth/login`

---

#### POST `/auth/logout`

Revoke refresh tokens.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/auth/logout`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    refresh_token: "stored-refresh-token"
  })
});
```

---

### Users Endpoints

#### GET `/users/`

List or filter users (Admin only).

**Request**:
```typescript
// Get all users
const response = await fetch(`${API_BASE_URL}/users/`, {
  headers: { "Authorization": `Bearer ${token}` }
});

// Get user by code
const response = await fetch(`${API_BASE_URL}/users/?user_code=OC_U001`, {
  headers: { "Authorization": `Bearer ${token}` }
});

// Get users by role
const response = await fetch(`${API_BASE_URL}/users/?user_role=player`, {
  headers: { "Authorization": `Bearer ${token}` }
});
```

**Response** (Single User):
```json
{
  "status": "success",
  "message": "User retrieved successfully",
  "data": {
    "user_code": "OC_U001",
    "user_name": "Nguyen Van A",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Matches Endpoints

#### POST `/matches/`

Create a new match (Admin only).

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/matches/`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    match_code: "OC3_M001",
    match_name: "Vòng loại 1",
    players: [
      { user_code: "OC_U001", position: 1 },
      { user_code: "OC_U002", position: 2 }
    ]
  })
});
```

---

#### GET `/matches/`

Get match details (Admin only).

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/matches/?match_code=OC3_M001`, {
  headers: { "Authorization": `Bearer ${token}` }
});
```

**Response**:
```json
{
  "status": "success",
  "message": "Match retrieved successfully",
  "data": {
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      {
        "user_code": "OC_U001",
        "user_name": "Nguyen Van A",
        "position": 1
      }
    ]
  }
}
```

---

#### GET `/matches/{matchCode}/players`

Get players in a match.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/matches/${matchCode}/players`, {
  headers: { "Authorization": `Bearer ${token}` }
});

const data = await response.json();
const players: Player[] = data.data.players;
```

---

### Questions Endpoints

#### POST `/questions/excel/`

Import questions from Excel (Admin only).

**Request**:
```typescript
const formData = new FormData();
formData.append("file", fileInput.files[0]);

const response = await fetch(
  `${API_BASE_URL}/questions/excel/?match_code=${matchCode}`,
  {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: formData
  }
);
```

---

#### POST `/questions/`

Create a question manually (Admin only).

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/questions/`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    match_code: "OC3_M001",
    question_code: "OC3_Q001",
    content: "What is the capital of Vietnam?",
    answer: "Hanoi",
    explanation: "Hanoi is the capital of Vietnam",
    media_url: "https://example.com/image.jpg",
    options: ["Hà Nội", "TP.HCM", "Huế", "Đà Nẵng", "Cần Thơ", "Vũng Tàu"]
  })
});
```

---

### Qualifier Endpoints

#### POST `/questions/excel/qualifier/`

Import qualifier questions from Excel (Admin only).

**Request**:
```typescript
const formData = new FormData();
formData.append("file", fileInput.files[0]);

const response = await fetch(
  `${API_BASE_URL}/questions/excel/qualifier/?match_code=${matchCode}`,
  {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: formData
  }
);
```

---

#### POST `/qualifier/calculate-scores`

Calculate scores for a qualifier question (Admin only).

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/qualifier/calculate-scores`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    match_code: "OC3_M_VL",
    question_code: "OC3_Q_VL_1_01",
    correct_answer: "A",
    round_number: 1
  })
});

const data = await response.json();
// { status: "success", data: { correct_count, wrong_count, score_updates } }
```

---

#### POST `/qualifier/end-round`

Finalize a qualifier round (Admin only).

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/qualifier/end-round`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    match_code: "OC3_M_VL",
    round_number: 1,
    advance_count: null  // Optional override
  })
});

const data = await response.json();
// { status: "success", data: { round_number, passed: [...], reserve: [...] } }
```

---

#### GET `/qualifier/advancements/{match_code}`

Get all advancement records for a match (Admin only).

**Request**:
```typescript
const response = await fetch(
  `${API_BASE_URL}/qualifier/advancements/${matchCode}`,
  { headers: { "Authorization": `Bearer ${token}` } }
);

const data = await response.json();
// { status: "success", data: { advancements: [...] } }
```

---

#### GET `/qualifier/standings/{match_code}`

Get current qualifier standings (Admin or Player).

**Request**:
```typescript
const response = await fetch(
  `${API_BASE_URL}/qualifier/standings/${matchCode}`,
  { headers: { "Authorization": `Bearer ${token}` } }
);

const data = await response.json();
// { status: "success", data: { standings: [...] } }
```

---

### Answers Endpoints

#### POST `/answers/`

Submit an answer.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/answers/`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    match_code: matchCode,
    user_code: playerCode,
    question_code: questionCode,
    answer_text: answerText,
    has_buzzed: false,
    timestamp: elapsedSeconds
  })
});
```

---

#### GET `/answers/`

Get an answer (Admin only).

**Request**:
```typescript
const url = new URL(`${API_BASE_URL}/answers/`);
url.searchParams.append('match_code', matchCode);
url.searchParams.append('user_code', playerCode);
url.searchParams.append('question_code', questionCode);

const response = await fetch(url, {
  headers: { "Authorization": `Bearer ${token}` }
});
```

---

### Records Endpoints

#### POST `/records/`

Record points.

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/records/`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    match_code: matchCode,
    user_code: playerCode,
    question_code: questionCode,
    points: 100  // Must be multiple of 5
  })
});
```

---

#### GET `/records/`

Get user records.

**Request**:
```typescript
const url = new URL(`${API_BASE_URL}/records/`);
url.searchParams.append('match_code', matchCode);
url.searchParams.append('user_code', playerCode);

const response = await fetch(url, {
  headers: { "Authorization": `Bearer ${token}` }
});
```

---

### Scoreboard Endpoints

#### GET `/scoreboard/{matchCode}`

Get leaderboard (Admin only).

**Request**:
```typescript
const response = await fetch(`${API_BASE_URL}/scoreboard/${matchCode}`, {
  headers: { "Authorization": `Bearer ${token}` }
});

const data = await response.json();
const scoreboard = data.data.scoreboard;
```

**Response**:
```json
{
  "status": "success",
  "message": "Scoreboard retrieved successfully",
  "data": {
    "scoreboard": [
      {
        "user_code": "OC_U001",
        "user_name": "Nguyen Van A",
        "cumulative_score": 250
      }
    ]
  }
}
```

---

## WebSocket

### Connection

```typescript
const wsUrl = `${WS_BASE_URL}/ws/${matchCode}`;
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log('Connected to', wsUrl);
  // Auto-send presence announcement
  ws.send(JSON.stringify({
    type: "player_online",
    user_code: playerCode
  }));
};

ws.onmessage = (event) => {
  // Backend sends raw payloads (not wrapped)
  const message = JSON.parse(event.data);
  handleMessage(message);
};

ws.onclose = () => {
  console.log('Disconnected');
  // Attempt reconnection after 3 seconds
  setTimeout(connect, 3000);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### useWebSocket Hook

**Location**: `src/hooks/useWebSocket.ts`

**Features**:
- Automatic reconnection (3s delay)
- Message draining (prevents loss)
- Connection gating (only when `matchCode` is set)

**Usage**:
```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

const { isConnected, lastMessage, sendMessage } = useWebSocket(matchCode);

// Send message
await sendMessage({
  type: "answer",
  user_code: playerCode,
  question_code: questionCode,
  answer_text: answer,
  timestamp: Date.now()
});

// Listen to messages
useEffect(() => {
  if (lastMessage) {
    const data = JSON.parse(lastMessage.data);
    handleMessage(data);
  }
}, [lastMessage]);
```

---

## Session Management

### Admin Session

**Storage**: `localStorage`

**Keys**:
- `jwtToken_admin`: JWT access token
- `role`: `"admin"`
- `matchCode`: Current match code

**Example**:
```typescript
localStorage.setItem("jwtToken_admin", token);
localStorage.setItem("role", "admin");
localStorage.setItem("matchCode", "OC3_M001");
```

---

### Player Session

**Storage**: `sessionStorage` (cleared on browser close)

**Keys**:
- `jwtToken_player`: JWT access token
- `role`: `"player"`
- `playerCode`: Player user code
- `matchCode`: Current match code

**Example**:
```typescript
sessionStorage.setItem("jwtToken_player", token);
sessionStorage.setItem("role", "player");
sessionStorage.setItem("playerCode", "OC_U001");
sessionStorage.setItem("matchCode", "OC3_M001");
```

---

### useAuthSession Hook

**Location**: `src/hooks/useAuthSession.ts`

**Usage**:
```typescript
import { useAuthSession } from '@/hooks/useAuthSession';

const { saveSession, clearSession } = useAuthSession();

// After login/signup
saveSession({
  access_token: token,
  role: "admin",
  user_code: "OC_U001",
  match_code: "OC3_M001"
});

// On logout
clearSession();
```

---

### usePlayerSession Hook

**Location**: `src/hooks/usePlayerSession.ts`

**Usage**:
```typescript
import { usePlayerSession } from '@/hooks/usePlayerSession';

const { matchCode, playerCode, token } = usePlayerSession();

// Reactive to storage changes (cross-tab sync)
```

---

## Message Types Reference

### Server → Client Messages

#### `send_question`

Display a question.

```typescript
{
  type: "send_question";
  question_code: string;
  content: string;
  media_source?: string;
}
```

---

#### `clear_question`

Clear the current question.

```typescript
{
  type: "clear_question";
}
```

---

#### `send_players_info`

Broadcast player list and scores.

```typescript
{
  type: "send_players_info";
  players: Array<{
    user_code: string;
    user_name: string;
    position: number;
    score: number;
  }>;
}
```

---

#### `start_the_timer`

Start countdown timer.

```typescript
{
  type: "start_the_timer";
  time_limit: number;  // Seconds
  question_code: string;
}
```

---

#### `player_score_updated`

Score change notification.

```typescript
{
  type: "player_score_updated";
  user_code: string;
  new_total_score: number;
}
```

---

#### `answer`

Real-time answer from another player.

```typescript
{
  type: "answer";
  user_code: string;
  answer_text: string;
  timestamp: number;
}
```

---

#### `navigate`

Server-initiated navigation.

```typescript
{
  type: "navigate";
  path: string;
}
```

**Handling** (PlayerWebSocketContext):
```typescript
if (message.type === "navigate") {
  navigate(message.path);
}
```

---

### Client → Server Messages

#### `player_online`

Announce presence.

```typescript
{
  type: "player_online";
  user_code: string;
}
```

---

#### `answer`

Submit answer via WebSocket.

```typescript
{
  type: "answer";
  user_code: string;
  question_code: string;
  answer_text: string;
  timestamp: number;
}
```

---

#### `buzz`

Buzz signal (individual rounds).

```typescript
{
  type: "buzz";
  user_code: string;
}
```

---

## Error Handling

### HTTP Errors

```typescript
async function apiCall(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: "Unknown error" 
      }));
      alert(`Lỗi: ${error.message || "Không xác định"}`);
      throw new Error(error.message);
    }
    
    return await response.json();
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
}
```

### WebSocket Errors

```typescript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
  setConnectionStatus('error');
};

ws.onclose = () => {
  setConnectionStatus('disconnected');
  // Auto-reconnect after 3 seconds
  setTimeout(() => connect(), 3000);
};
```

### Token Expiration

```typescript
async function refreshToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    window.location.href = '/login';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('jwtToken_admin', data.access_token);
    } else {
      window.location.href = '/login';
    }
  } catch (error) {
    window.location.href = '/login';
  }
}
```

---

## Related Documentation

- [Backend API](../backend/README.md) - Backend endpoint reference
- [Architecture](./ARCHITECTURE.md) - Frontend architecture overview
- [Components](./COMPONENTS.md) - Component library
