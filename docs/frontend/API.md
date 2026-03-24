# API & WebSocket Documentation

This document details all API endpoints and WebSocket communication used in the OLYMPIA CUSTOM 3 frontend.

## Table of Contents

1. [Configuration](#configuration)
2. [HTTP API](#http-api)
3. [WebSocket](#websocket)
4. [Session Management](#session-management)
5. [Message Types Reference](#message-types-reference)

---

## Configuration

Base URLs are defined in `src/configs.ts`:

```typescript
export const API_BASE_URL = "http://localhost:8000";
export const WS_BASE_URL = "ws://localhost:8000";
```

**Note:** These values assume local development. Production configuration should use environment variables.

---

## HTTP API

All authenticated API calls require a Bearer token in the `Authorization` header:

```typescript
headers: {
  "Authorization": `Bearer ${token}`
}
```

### Authentication Endpoints

#### POST `/auth/login`

Login user and obtain JWT token.

**Request:**
- Method: `POST`
- Content-Type: `application/x-www-form-urlencoded`
- Body:
  - `username` (string)
  - `password` (string)

**Response:**
```json
{
  "access_token": "jwt-token-string",
  "token_type": "bearer",
  "role": "admin" | "player",
  "user_code": "USER123"
}
```

**Implementation:**
- Form data encoded via `URLSearchParams`
- Base URL + `/auth/login`
- Example:
```typescript
const response = await fetch(`${API_BASE_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ username, password })
});
```

---

#### POST `/auth/signup`

Register new player account.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body:
  - `user_code` (string)
  - `user_name` (string)
  - `password` (string)
  - `role` (string): Only `"player"` allowed for signup

**Response:**
```json
{
  "message": "User created successfully"
}
```

**Implementation:**
```typescript
await fetch(`${API_BASE_URL}/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ user_code, user_name, password, role: "player" })
});
```

---

### Answers Endpoints

#### POST `/answers/`

Save a player's answer to a question.

**Request:**
- Method: `POST`
- Headers: `Authorization: Bearer <token>`
- Content-Type: `application/json`
- Body:
  - `user_code` (string)
  - `match_code` (string)
  - `question_code` (string)
  - `answer_text` (string)
  - `timestamp` (number): Unix timestamp in milliseconds

**Response:**
```json
{
  "id": 123,
  "user_code": "PLAYER001",
  "match_code": "MATCH123",
  "question_code": "BP_01",
  "answer_text": "42",
  "timestamp": 1709523456789
}
```

**Usage:**
```typescript
const answerResponse = await fetch(`${API_BASE_URL}/answers/`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    user_code,
    match_code,
    question_code,
    answer_text,
    timestamp: Date.now()
  })
});
```

---

#### GET `/answers/`

Retrieve answers for a specific player/question.

**Query Parameters:**
- `match_code` (required)
- `player_code` (required)
- `question_code` (required)

**Request:**
- Method: `GET`
- Headers: `Authorization: Bearer <token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "answer_text": "42",
    "timestamp": 1709523456789
  }
}
```

**Usage:**
```typescript
const url = new URL(`${API_BASE_URL}/answers/`);
url.searchParams.append('match_code', matchCode);
url.searchParams.append('player_code', playerCode);
url.searchParams.append('question_code', questionCode);

const response = await fetch(url, {
  headers: { "Authorization": `Bearer ${token}` }
});
```

---

### Matches Endpoints

#### GET `/matches/{matchCode}/players`

Fetch list of players in a match.

**Request:**
- Method: `GET`
- Path parameter: `matchCode`
- Headers: `Authorization: Bearer <token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "players": [
      {
        "code": "PLAYER001",
        "name": "Nguyễn Văn A",
        "score": 100,
        "is_current": false
      }
    ]
  }
}
```

**Usage:**
```typescript
const response = await fetch(`${API_BASE_URL}/matches/${matchCode}/players`, {
  headers: { "Authorization": `Bearer ${token}` }
});
const data = await response.json();
const players: Player[] = data.data.players;
```

---

### Scoreboard Endpoints

#### GET `/scoreboard/{matchCode}`

Fetch current scoreboard for a match.

**Request:**
- Method: `GET`
- Path parameter: `matchCode`
- Headers: `Authorization: Bearer <token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "scoreboard": [
      {
        "player_code": "PLAYER001",
        "player_score": 150
      },
      {
        "player_code": "PLAYER002",
        "player_score": 100
      }
    ]
  }
}
```

**Usage:**
```typescript
const response = await fetch(`${API_BASE_URL}/scoreboard/${matchCode}`, {
  headers: { "Authorization": `Bearer ${token}` }
});
const data = await response.json();
```

---

### Users Endpoints

#### GET `/users/`

Fetch user profile by user code.

**Query Parameters:**
- `user_code` (required)

**Request:**
- Method: `GET`
- Headers: `Authorization: Bearer <token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "user_code": "PLAYER001",
    "user_name": "Nguyễn Văn A",
    "role": "player"
  }
}
```

**Usage:**
```typescript
const url = `${API_BASE_URL}/users/?user_code=${playerCode}`;
const response = await fetch(url, {
  headers: { "Authorization": `Bearer ${token}` }
});
```

---

## WebSocket

WebSocket is the primary communication channel for real-time game events.

### Connection URL

```typescript
const wsUrl = `${WS_BASE_URL}/ws/${matchCode}`;
```

**Example:** `ws://localhost:8000/ws/MATCH123`

### Connection Management

**Hook:** `useWebSocket` (`src/hooks/useWebSocket.ts`)

**Features:**
- Automatic reconnection with 3-second delay
- Message draining using async iterator (prevents message loss)
- Connection gating: only active when `matchCode` is truthy
- Closure flag prevents state updates after cleanup

**Return Value:**
```typescript
{
  isConnected: boolean;
  lastMessage: unknown;
  sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;
}
```

**Usage:**
```typescript
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

### WebSocket Contexts

#### PlayerWebSocketContext

**Location:** `src/contexts/PlayerWebSocketContext.tsx`

**Behavior:**
- On connect: automatically sends `{ type: "player_online", user_code }`
- Handles `request_presence` messages (re-send presence)
- Auto-navigation on `navigate` messages

**Consume via hook:**
```typescript
import { usePlayerWebSocket } from "@/contexts/PlayerWebSocketContext";

const { isConnected, sendMessage } = usePlayerWebSocket();
```

---

#### AdminWebSocketContext

**Location:** `src/contexts/AdminWebSocketContext.tsx`

**Behavior:**
- On connect: automatically sends `{ type: "request_presence" }` to rebuild player list
- Provides same interface as player context

**Consume via hook:**
```typescript
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";

const { isConnected, sendMessage } = useAdminWebSocket();
```

---

## Message Types Reference

### Server → Client Messages

#### `send_question`

Admin sends question to all players.

**Fields:**
```typescript
{
  type: "send_question";
  question_code: string;
  content: string;       // Question text
  media_source?: string; // Media URL (optional)
}
```

**Triggered by:** Admin clicking "Hiển thị câu hỏi"

**Handling:**
- Players: Display question, clear previous answers
- Admin: Show question in admin view

---

#### `clear_question`

Clear current question from all displays.

**Fields:**
```typescript
{
  type: "clear_question";
}
```

**Triggered by:** Admin action

---

#### `send_players_info`

Broadcast player list, scoreboard, and profile data.

**Fields:**
```typescript
{
  type: "send_players_info";
  players: PlayerStatus[];
  scoreboard: { player_code: string; player_score: number }[];
  profiles?: { user_code: string; user_name: string }[];
}
```

**Triggered by:** Admin page load or player connection

**Usage:** Build player list UI, update scores

---

#### `start_the_timer`

Start countdown timer.

**Fields:**
```typescript
{
  type: "start_the_timer";
  time_limit: number; // Seconds
}
```

**Triggered by:** Admin clicks "Bắt đầu"

**Handling:**
- Start timer with specified duration
- Auto-submit answers when timer expires

---

#### `player_score_updated`

Notify of score change for a specific player.

**Fields:**
```typescript
{
  type: "player_score_updated";
  user_code: string;
  new_total_score: number;
}
```

**Triggered by:** Admin awarding points

**Handling:**
- Update local player status
- Refresh displayed scores

---

#### `clear_answers`

Reset all player answers.

**Fields:**
```typescript
{
  type: "clear_answers";
}
```

**Triggered by:** Admin clicks "Xóa đáp án"

**Handling:**
- Clear answer input fields
- Reset answer states

---

#### `send_answers_to_players`

Display other players' answers (for Khởi Động Chung).

**Fields:**
```typescript
{
  type: "send_answers_to_players";
  answers: {
    user_code: string;
    content: string;
    timestamp: number;
  }[];
}
```

**Triggered by:** Admin clicks "Hiển thị đáp án"

**Handling:**
- Show each player's answer in UI
- Display relative timestamps

---

#### `answer`

Real-time answer from another player.

**Fields:**
```typescript
{
  type: "answer";
  user_code: string;
  answer_text: string;
  timestamp: number;
}
```

**Broadcast:** To all players (including sender?) when answer submitted

**Handling:**
- Show notification or update player list
- Displays: "PLAYER001: Đáp án của tôi: 42"

---

#### `buzz`

Buzz notification from any player.

**Fields:**
```typescript
{
  type: "buzz";
  user_code: string;
}
```

**Triggered by:** Player pressing buzzer in individual rounds

**Handling (for players):**
- Highlight buzzed player
- Lock own buzzer if another player buzzed

**Handling (for admin):**
- Show which player buzzed first
- Lock subsequent buzzes

---

#### `request_presence`

Admin requests all clients to announce presence.

**Fields:**
```typescript
{
  type: "request_presence";
}
```

**Triggered by:** Admin connecting or manually requesting

**Response:** Clients send `player_online` message

---

#### `navigate`

Server-initiated navigation command.

**Fields:**
```typescript
{
  type: "navigate";
  path: string;
  user_code?: string; // Optional, empty = broadcast to all
}
```

**Triggered by:** Server directing player to new page

**Handling (PlayerWebSocketContext):**
```typescript
if (message.type === "navigate") {
  navigate(message.path);
}
```

**Examples:**
- `path: "/kdc/MATCH123/PLAYER001"` → redirect to group warm-up
- `path: "/kdr/MATCH123/PLAYER001"` → redirect to individual warm-up

---

### Client → Server Messages

#### `player_online`

Player announces presence upon WebSocket connection.

**Fields:**
```typescript
{
  type: "player_online";
  user_code: string;
}
```

**Sent automatically:** By `PlayerWebSocketContext` on connect

---

#### `answer`

Submit answer through WebSocket (alternative to HTTP).

**Fields:**
```typescript
{
  type: "answer";
  user_code: string;
  question_code: string;
  answer_text: string;
  timestamp: number;
}
```

**Alternative:** HTTP POST to `/answers/` also used

---

#### `buzz`

Buzz signal for individual rounds.

**Fields:**
```typescript
{
  type: "buzz";
  user_code: string;
}
```

**Triggered by:** Player pressing buzzer in Bứt Phá or Vượt Đèo

---

## Session Management

Sessions are stored separately for admin and player roles.

### Admin Session

**Storage:** `localStorage`

**Keys:**
- `jwtToken_admin`: JWT access token
- `role`: `"admin"`
- `matchCode`: Current match code

**Example:**
```typescript
localStorage.setItem("jwtToken_admin", token);
localStorage.setItem("role", "admin");
localStorage.setItem("matchCode", "MATCH123");
```

---

### Player Session

**Storage:** `sessionStorage` (cleared on browser close)

**Keys:**
- `jwtToken_player`: JWT access token
- `role`: `"player"`
- `playerCode`: Player user code
- `matchCode`: Current match code

**Example:**
```typescript
sessionStorage.setItem("jwtToken_player", token);
sessionStorage.setItem("role", "player");
sessionStorage.setItem("playerCode", playerCode);
sessionStorage.setItem("matchCode", matchCode);
```

---

### Session Management Hooks

#### useAuthSession

**Location:** `src/hooks/useAuthSession.ts`

**Purpose:** Save session after login/signup and perform navigation.

**Methods:**
```typescript
const { saveSession } = useAuthSession();

// Save session
saveSession(data: {
  access_token: string;
  role: "admin" | "player";
  user_code?: string;
  match_code?: string;
});
```

**Logic:**
```typescript
if (role === "admin") {
  localStorage.setItem("jwtToken_admin", token);
  localStorage.setItem("role", "admin");
  localStorage.setItem("matchCode", matchCode || "");
  navigate("/admin/game-managing");
} else if (role === "player") {
  sessionStorage.setItem("jwtToken_player", token);
  sessionStorage.setItem("role", "player");
  sessionStorage.setItem("playerCode", user_code || "");
  sessionStorage.setItem("matchCode", matchCode || "");
  navigate("/player/access");
}
```

---

#### usePlayerSession

**Location:** `src/hooks/usePlayerSession.ts`

**Purpose:** Read-only snapshot of player session from sessionStorage.

**Return Value:**
```typescript
{
  matchCode: string | null;
  playerCode: string | null;
  token: string | null;
}
```

**Reactivity:** Uses `window.addEventListener("storage")` to sync across tabs

**Usage:**
```typescript
const { matchCode, playerCode, token } = usePlayerSession();
```

---

## Error Handling

### HTTP Errors

All API calls should be wrapped in try-catch:

```typescript
try {
  const response = await fetch(...);
  if (!response.ok) {
    const error = await response.json();
    alert(`Lỗi: ${error.detail || "Không xác định"}`);
    throw new Error(error.detail);
  }
  return await response.json();
} catch (error) {
  console.error("API error:", error);
  throw error;
}
```

### WebSocket Errors

- Connection failures trigger automatic reconnection
- Send failures return `false` (limitation of current implementation)
- Context consumers should check `isConnected` before sending

---

## Rate Limiting & Throttling

**No client-side throttling implemented.** Backend should handle rate limiting, but recommended client-side guard:

```typescript
const canSend = isConnected && !isSending;
if (canSend) {
  setIsSending(true);
  await sendMessage(payload);
  setTimeout(() => setIsSending(false), 100); // 10 ops/sec limit
}
```

---

## Fallback Strategies

**Primary:** WebSocket
**Fallback:** HTTP polling (not implemented)

If WebSocket is unavailable:
1. Try reconnecting (automatic, 3s delay)
2. After 3 failed attempts, show connection error
3. Manual "Reconnect" button in UI

---

## Security Considerations

- **Token storage:**
  - Admin: `localStorage` (persists across browser sessions)
  - Player: `sessionStorage` (cleared on browser close)
- **CORS:** Backend must allow frontend origin
- **HTTPS:** Production must use HTTPS and `wss://`
- **Token expiration:** Frontend does not handle token refresh (assumes long-lived tokens or backend refresh endpoint)

---

## Development Tips

1. **Mocking WebSocket:** For unit tests, mock `useWebSocket` hook
2. **Testing endpoints:** Use Postman/Insomnia with JWT in Authorization header
3. **Debugging:** Enable logger at DEBUG level; inspect WebSocket messages in browser DevTools Network tab
4. **Local dev:** Backend must run on `localhost:8000` (or update config)

---

## API Versioning

**Current version:** 1.0 (implicit)
**Base path:** `/` (no version prefix planned)
**Change management:** Backward-compatible additions only; breaking changes require frontend updates

---

## Request/Response Examples

### Complete Login Flow

```typescript
// 1. POST /auth/login
const loginResponse = await fetch("http://localhost:8000/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ username: "admin", password: "pass123" })
});

const { access_token, role, user_code } = await loginResponse.json();

// 2. Save session
if (role === "admin") {
  localStorage.setItem("jwtToken_admin", access_token);
  localStorage.setItem("role", role);
  navigate("/admin/game-managing");
}

// 3. Connect WebSocket
const wsUrl = `ws://localhost:8000/ws/${matchCode}`;
const ws = new WebSocket(wsUrl);
ws.onopen = () => {
  ws.send(JSON.stringify({ type: "request_presence" }));
};
```

---

### Complete Player Answer Flow

```typescript
// 1. Receive question via WebSocket
ws.onmessage = (event) => {
  const { type, question_code, content, media_source } = JSON.parse(event.data);
  if (type === "send_question") {
    setCurrentQuestion({ questionCode: question_code, questionText: content, ... });
  }
};

// 2. Player enters answer and submits
const handleSubmit = async () => {
  // HTTP fallback
  await fetch("http://localhost:8000/answers/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user_code: playerCode,
      match_code: matchCode,
      question_code: currentQuestion.questionCode,
      answer_text: answerText,
      timestamp: Date.now()
    })
  });

  // WebSocket broadcast
  sendMessage({
    type: "answer",
    user_code: playerCode,
    question_code: currentQuestion.questionCode,
    answer_text: answerText,
    timestamp: Date.now()
  });
};
```

---

This concludes the API & WebSocket documentation. Refer to `COMPONENTS.md` and `ARCHITECTURE.md` for related details.
