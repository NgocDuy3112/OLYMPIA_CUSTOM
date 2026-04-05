# WebSocket Events Reference

Complete reference for all WebSocket events used in OLYMPIA CUSTOM 3 frontend application.

---

## Table of Contents

1. [Overview](#overview)
2. [Connection](#connection)
3. [Client → Server Events](#client--server-events)
4. [Server → Client Events](#server--client-events)
5. [Event Categories by Round](#event-categories-by-round)
6. [Event Payload Schemas](#event-payload-schemas)
7. [Best Practices](#best-practices)

---

## Overview

WebSocket communication in OLYMPIA CUSTOM 3 uses a **raw payload format** - messages are sent as plain JSON objects without wrapping.

**Connection URL**:
```
ws://localhost:8000/ws/{match_code}
```

**Message Format**:
```typescript
// Client → Server
{
  type: "event_name",
  user_code: "OC_U001",
  // ... other fields
}

// Server → Client (broadcast)
{
  type: "event_name",
  // ... event-specific data
}
```

---

## Connection

### WebSocket Endpoint

| Property | Value |
|----------|-------|
| **URL** | `/ws/{match_code}` |
| **Authentication** | Optional (not enforced by default) |
| **Protocol** | WebSocket (ws:// or wss://) |
| **Message Format** | JSON |

### Connection Lifecycle

```typescript
// 1. Connect
const ws = new WebSocket(`ws://localhost:8000/ws/${matchCode}`);

// 2. On open - send presence announcement
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "player_online",
    user_code: playerCode
  }));
};

// 3. Listen for messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};

// 4. Disconnect
ws.close();
```

---

## Client → Server Events

Events sent from frontend (Admin/Player) to the backend server.

### player_online

**Direction**: Player → Server  
**Purpose**: Announce player presence when connecting to WebSocket room  
**Sent by**: `PlayerWebSocketContext`

**Payload**:
```typescript
{
  type: "player_online",
  user_code: string
}
```

**Example**:
```json
{
  "type": "player_online",
  "user_code": "OC_U001"
}
```

---

### player_heartbeat

**Direction**: Player → Server  
**Purpose**: Periodic heartbeat to maintain connection alive  
**Sent by**: `PlayerWebSocketContext` (every 30 seconds)

**Payload**:
```typescript
{
  type: "player_heartbeat",
  user_code: string
}
```

**Example**:
```json
{
  "type": "player_heartbeat",
  "user_code": "OC_U001"
}
```

---

### request_presence

**Direction**: Admin → Server  
**Purpose**: Request all connected players to announce their presence  
**Sent by**: `AdminWebSocketContext` on connection

**Payload**:
```typescript
{
  type: "request_presence"
}
```

**Example**:
```json
{
  "type": "request_presence"
}
```

---

### answer

**Direction**: Player → Server  
**Purpose**: Submit answer for a question  
**Sent by**: Player round pages (PQualifierPage, PKhoiDongChungPage, etc.)

**Payload**:
```typescript
{
  type: "answer",
  user_code: string,
  question_code: string,
  answer_text: string,
  has_buzzed: boolean,
  timestamp: number
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `user_code` | string | Player's user code |
| `question_code` | string | Question identifier |
| `answer_text` | string | Answer content |
| `has_buzzed` | boolean | Whether player buzzed in |
| `timestamp` | number | Elapsed seconds when submitted |

**Example**:
```json
{
  "type": "answer",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "answer_text": "Hà Nội",
  "has_buzzed": false,
  "timestamp": 12.490
}
```

---

### buzz

**Direction**: Player → Server  
**Purpose**: Signal buzzer press in individual rounds  
**Sent by**: `PVeDichRiengPage`

**Payload**:
```typescript
{
  type: "buzz",
  user_code: string,
  question_code: string,
  has_buzzed: boolean
}
```

**Example**:
```json
{
  "type": "buzz",
  "user_code": "OC_U001",
  "question_code": "OC3_Q_VDR_01",
  "has_buzzed": true
}
```

---

### request_qualifier_state

**Direction**: Player → Server  
**Purpose**: Request current qualifier round state  
**Sent by**: `PQualifierPage`

**Payload**:
```typescript
{
  type: "request_qualifier_state",
  user_code: string
}
```

**Example**:
```json
{
  "type": "request_qualifier_state",
  "user_code": "OC_U001"
}
```

---

### send_players_info

**Direction**: Admin → Server  
**Purpose**: Broadcast player list and scores to all clients  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "send_players_info",
  players: Array<{
    playerCode: string,
    playerName: string,
    playerScore: number,
    playerLastAnswer?: string,
    playerTimestamp?: number,
    playerHasBuzzed?: boolean,
    playerConnected?: boolean
  }>
}
```

**Example**:
```json
{
  "type": "send_players_info",
  "players": [
    {
      "playerCode": "OC_U001",
      "playerName": "Nguyen Van A",
      "playerScore": 100,
      "playerConnected": true
    },
    {
      "playerCode": "OC_U002",
      "playerName": "Tran Thi B",
      "playerScore": 50,
      "playerConnected": true
    }
  ]
}
```

---

### send_question

**Direction**: Admin → Server  
**Purpose**: Send question to all players  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "send_question",
  user_code: string,
  question_code: string,
  content: string,
  media_source?: string | string[]
}
```

**Example**:
```json
{
  "type": "send_question",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "content": "Thủ đô của Việt Nam là gì?",
  "media_source": "https://example.com/image.jpg"
}
```

---

### clear_question

**Direction**: Admin → Server  
**Purpose**: Clear current question from all player screens  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "clear_question",
  user_code: string,
  count?: number  // For qualifier rounds
}
```

**Example**:
```json
{
  "type": "clear_question",
  "user_code": ""
}
```

---

### start_the_timer

**Direction**: Admin → Server  
**Purpose**: Start countdown timer for a question  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "start_the_timer",
  user_code: string,
  time_limit: number,
  question_code: string,
  started_at: number
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `time_limit` | number | Timer duration in seconds |
| `question_code` | string | Question identifier |
| `started_at` | number | Unix timestamp when timer started |

**Example**:
```json
{
  "type": "start_the_timer",
  "user_code": "",
  "time_limit": 30,
  "question_code": "OC3_Q001",
  "started_at": 1709856000000
}
```

---

### navigate

**Direction**: Admin → Server  
**Purpose**: Instruct players to navigate to a specific page  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "navigate",
  user_code: string,
  path: string
}
```

**Example**:
```json
{
  "type": "navigate",
  "user_code": "",
  "path": "/player/kdc"
}
```

---

### send_answers_to_players

**Direction**: Admin → Server  
**Purpose**: Display all players' answers (for Group Warm-up rounds)  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "send_answers_to_players",
  answers: Array<{
    user_code: string,
    content: string,
    timestamp: number
  }>
}
```

**Example**:
```json
{
  "type": "send_answers_to_players",
  "answers": [
    {
      "user_code": "OC_U001",
      "content": "Hà Nội",
      "timestamp": 12.490
    },
    {
      "user_code": "OC_U002",
      "content": "TP. Hồ Chí Minh",
      "timestamp": 15.230
    }
  ]
}
```

---

### clear_answers

**Direction**: Admin → Server  
**Purpose**: Clear all player answers  
**Sent by**: Admin round pages

**Payload**:
```typescript
{
  type: "clear_answers",
  user_code: string
}
```

**Example**:
```json
{
  "type": "clear_answers",
  "user_code": ""
}
```

---

### sync_qualifier_round

**Direction**: Admin → Server  
**Purpose**: Synchronize qualifier round state  
**Sent by**: `AQualifierPage`

**Payload**:
```typescript
{
  type: "sync_qualifier_round",
  count: number
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `count` | number | Number of questions in round |

**Example**:
```json
{
  "type": "sync_qualifier_round",
  "count": 10
}
```

---

### veDich_questions_meta

**Direction**: Admin → Server  
**Purpose**: Send metadata for Về Đích questions (Group Stage)  
**Sent by**: `AVeDichChungPage`

**Payload**:
```typescript
{
  type: "veDich_questions_meta",
  match_code: string,
  question_metadata: Array<{
    questionCode: string,
    subject: string,
    points: number,
    state: "available" | "answered" | "selected"
  }>
}
```

**Example**:
```json
{
  "type": "veDich_questions_meta",
  "match_code": "OC3_M001",
  "question_metadata": [
    {
      "questionCode": "OC3_Q_VDC_01",
      "subject": "Toán",
      "points": 10,
      "state": "available"
    }
  ]
}
```

---

### veDich_rieng_questions_meta

**Direction**: Admin → Server  
**Purpose**: Send metadata for Về Đích Riêng questions (Individual Stage)  
**Sent by**: `AVeDichRiengPage`

**Payload**:
```typescript
{
  type: "veDich_rieng_questions_meta",
  question_metadata: Array<{
    questionCode: string,
    subject: string,
    points: number,
    state: "available" | "answered" | "selected"
  }>
}
```

---

### veDich_question_state

**Direction**: Admin → Server  
**Purpose**: Update state of a specific question  
**Sent by**: `AVeDichChungPage`, `AVeDichRiengPage`

**Payload**:
```typescript
{
  type: "veDich_question_state",
  question_code: string,
  state: "available" | "answered" | "selected"
}
```

**Example**:
```json
{
  "type": "veDich_question_state",
  "question_code": "OC3_Q_VDC_01",
  "state": "answered"
}
```

---

### veDich_selection_update

**Direction**: Admin → Server  
**Purpose**: Update question selection state for Về Đích  
**Sent by**: `AVeDichPickQuestionPage`

**Payload**:
```typescript
{
  type: "veDich_selection_update",
  selections: Array<{
    playerCode: string,
    questionCode: string,
    points: number
  }>
}
```

---

### veDich_questions_selected

**Direction**: Admin → Server  
**Purpose**: Confirm final question selections  
**Sent by**: `AVeDichPickQuestionPage`

**Payload**:
```typescript
{
  type: "veDich_questions_selected",
  selections: Array<{
    playerCode: string,
    questionCode: string,
    points: number
  }>
}
```

---

### blocked_buzz

**Direction**: Admin → Server  
**Purpose**: Block/enable buzzer for specific player  
**Sent by**: `AVeDichPickQuestionPage`

**Payload**:
```typescript
{
  type: "blocked_buzz",
  user_code: string | null,
  match_code: string
}
```

**Example**:
```json
{
  "type": "blocked_buzz",
  "user_code": "OC_U001",
  "match_code": "OC3_M001"
}
```

---

### answering_window_activated

**Direction**: Admin → Server  
**Purpose**: Notify that answering window is activated  
**Sent by**: `AVeDichRiengPage`

**Payload**:
```typescript
{
  type: "answering_window_activated",
  user_code: string,
  question_code: string
}
```

---

### buzzer_winner

**Direction**: Admin → Server  
**Purpose**: Announce winner with buzzer celebration  
**Sent by**: `AVeDichRiengPage`

**Payload**:
```typescript
{
  type: "buzzer_winner",
  user_code: string,
  match_code: string
}
```

---

## Server → Client Events

Events broadcast from server to all connected clients in the room.

**Note**: The backend broadcasts all received messages to all clients in the room. All Client → Server events are automatically rebroadcast as Server → Client events.

### Broadcast Flow

```
Admin sends: { type: "send_question", ... }
     ↓
Backend receives via WebSocket
     ↓
Backend publishes to Valkey channel {match_code}
     ↓
All instances receive and forward
     ↓
All connected clients receive the message
```

### Special Server Events

These events may be generated by the server or backend processes:

### player_score_updated

**Purpose**: Notify clients of score change  
**Triggered by**: Record creation via API

**Payload**:
```typescript
{
  type: "player_score_updated",
  user_code: string,
  new_total_score: number
}
```

---

### qualifier_scores_updated

**Purpose**: Broadcast qualifier score updates after calculation  
**Triggered by**: `POST /qualifier/calculate-scores`

**Payload**:
```typescript
{
  type: "qualifier_scores_updated",
  question_code: string,
  correct_answer: string,
  correct_count: number,
  wrong_count: number,
  score_updates: Array<{
    user_code: string,
    delta: number,
    new_total: number,
    is_correct: boolean
  }>
}
```

**Example**:
```json
{
  "type": "qualifier_scores_updated",
  "question_code": "OC3_Q_VL_1_01",
  "correct_answer": "A",
  "correct_count": 16,
  "wrong_count": 2,
  "score_updates": [
    {
      "user_code": "OC_U_P03TST01",
      "delta": 2,
      "new_total": 10,
      "is_correct": true
    },
    {
      "user_code": "OC_U_P03TST02",
      "delta": -16,
      "new_total": -5,
      "is_correct": false
    }
  ]
}
```

---

### qualifier_advancement

**Purpose**: Broadcast player advancement/reserve status  
**Triggered by**: `POST /qualifier/end-round`

**Payload**:
```typescript
{
  type: "qualifier_advancement",
  round_number: number,
  passed: Array<{
    user_code: string,
    user_name: string,
    total_score: number
  }>,
  reserve: Array<{
    user_code: string,
    user_name: string,
    total_score: number
  }>
}
```

**Example**:
```json
{
  "type": "qualifier_advancement",
  "round_number": 1,
  "passed": [
    {
      "user_code": "OC_U_P03TST06",
      "user_name": "Thi sinh 06",
      "total_score": 21
    }
  ],
  "reserve": [
    {
      "user_code": "OC_U_P03TST01",
      "user_name": "Thi sinh 01",
      "total_score": -11
    }
  ]
}
```

---

### qualifier_state

**Purpose**: Send current qualifier state to player  
**Triggered by**: `request_qualifier_state` from player

**Payload**:
```typescript
{
  type: "qualifier_state",
  current_round: number,
  current_question: number,
  standings: Array<{
    user_code: string,
    user_name: string,
    total_score: number,
    rank: number
  }>
}
```

---

### answer

**Purpose**: Broadcast answer to all clients  
**Triggered by**: Player answer submission

**Payload**:
```typescript
{
  type: "answer",
  user_code: string,
  question_code: string,
  match_code: string,
  answer_text: string,
  has_buzzed: boolean,
  timestamp: number
}
```

---

## Event Categories by Round

### Qualifier (Vòng Loại - VL)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection announcement |
| `request_qualifier_state` | Player → Server | Request round state |
| `qualifier_state` | Server → Client | Round state response |
| `answer` | Player → Server | Submit answer |
| `sync_qualifier_round` | Admin → Server | Sync round state |
| `send_question` | Admin → Server | Send question |
| `start_the_timer` | Admin → Server | Start timer |
| `send_answers_to_players` | Admin → Server | Show all answers |
| `qualifier_scores_updated` | Server → Client | Score calculation result |
| `qualifier_advancement` | Server → Client | Round advancement result |

---

### Khởi Động Chung (Group Warm-up - KDC)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection |
| `answer` | Player → Server | Submit answer |
| `send_players_info` | Admin → Server | Update player list |
| `send_question` | Admin → Server | Send question |
| `clear_question` | Admin → Server | Clear question |
| `start_the_timer` | Admin → Server | Start timer |
| `send_answers_to_players` | Admin → Server | Show answers |
| `navigate` | Admin → Server | Navigate players |

---

### Khởi Động Riêng (Individual Warm-up - KDR)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection |
| `answer` | Player → Server | Submit answer |
| `send_players_info` | Admin → Server | Update scores |
| `send_question` | Admin → Server | Send question |
| `clear_question` | Admin → Server | Clear question |
| `start_the_timer` | Admin → Server | Start timer |
| `navigate` | Admin → Server | Navigate |

---

### Bứt Phá (Sprint - BP)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection |
| `answer` | Player → Server | Submit answer |
| `send_players_info` | Admin → Server | Update scores |
| `send_question` | Admin → Server | Send question |
| `clear_question` | Admin → Server | Clear question |
| `start_the_timer` | Admin → Server | Start timer |
| `send_answers_to_players` | Admin → Server | Show answers |
| `navigate` | Admin → Server | Navigate |

---

### Vượt Đèo (Escape - VD)

Uses custom clue components (`AVuotDeoClue`, `PVuotDeoClue`) with direct API calls instead of WebSocket events.

---

### Về Đích Chung (Final Group Stage - VDC)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection |
| `answer` | Player → Server | Submit answer |
| `send_players_info` | Admin → Server | Update scores |
| `veDich_questions_meta` | Admin → Server | Send question metadata |
| `veDich_question_state` | Admin → Server | Update question state |
| `send_question` | Admin → Server | Send question |
| `start_the_timer` | Admin → Server | Start timer |
| `navigate` | Admin → Server | Navigate |

---

### Về Đích Riêng (Final Individual Stage - VDR)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection |
| `buzz` | Player → Server | Buzz signal |
| `veDich_rieng_questions_meta` | Admin → Server | Question metadata |
| `veDich_question_state` | Admin → Server | Update state |
| `answering_window_activated` | Admin → Server | Activate window |
| `buzzer_winner` | Admin → Server | Winner celebration |
| `navigate` | Admin → Server | Navigate |

---

### Giải Mã (Decode - GM)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `player_online` | Player → Server | Connection |
| `answer` | Player → Server | Submit answer |
| `send_players_info` | Admin → Server | Update scores |
| `send_question` | Admin → Server | Send question |
| `start_the_timer` | Admin → Server | Start timer |
| `send_answers_to_players` | Admin → Server | Show answers |
| `navigate` | Admin → Server | Navigate |

---

## Event Payload Schemas

### TypeScript Type Definitions

```typescript
// Base event structure
interface WSEvent {
  type: string;
  user_code?: string;
  [key: string]: unknown;
}

// Player presence
interface PlayerOnlineEvent extends WSEvent {
  type: "player_online";
  user_code: string;
}

interface PlayerHeartbeatEvent extends WSEvent {
  type: "player_heartbeat";
  user_code: string;
}

// Answer submission
interface AnswerEvent extends WSEvent {
  type: "answer";
  user_code: string;
  question_code: string;
  answer_text: string;
  has_buzzed: boolean;
  timestamp: number;
}

// Game control
interface SendQuestionEvent extends WSEvent {
  type: "send_question";
  user_code: string;
  question_code: string;
  content: string;
  media_source?: string | string[];
}

interface ClearQuestionEvent extends WSEvent {
  type: "clear_question";
  user_code: string;
  count?: number;
}

interface StartTimerEvent extends WSEvent {
  type: "start_the_timer";
  user_code: string;
  time_limit: number;
  question_code: string;
  started_at: number;
}

interface NavigateEvent extends WSEvent {
  type: "navigate";
  user_code: string;
  path: string;
}

// Player management
interface SendPlayersInfoEvent extends WSEvent {
  type: "send_players_info";
  players: PlayerStatus[];
}

interface PlayerStatus {
  playerCode: string;
  playerName: string;
  playerScore: number;
  playerLastAnswer?: string;
  playerTimestamp?: number;
  playerHasBuzzed?: boolean;
  playerConnected?: boolean;
}

// Qualifier events
interface SyncQualifierRoundEvent extends WSEvent {
  type: "sync_qualifier_round";
  count: number;
}

interface RequestQualifierStateEvent extends WSEvent {
  type: "request_qualifier_state";
  user_code: string;
}

// Về Đích events
interface VeDichQuestionsMetaEvent extends WSEvent {
  type: "veDich_questions_meta";
  match_code: string;
  question_metadata: QuestionMetadata[];
}

interface QuestionMetadata {
  questionCode: string;
  subject: string;
  points: number;
  state: "available" | "answered" | "selected";
}

interface VeDichQuestionStateEvent extends WSEvent {
  type: "veDich_question_state";
  question_code: string;
  state: "available" | "answered" | "selected";
}

// Buzzer events
interface BuzzEvent extends WSEvent {
  type: "buzz";
  user_code: string;
  question_code: string;
  has_buzzed: boolean;
}

interface BlockedBuzzEvent extends WSEvent {
  type: "blocked_buzz";
  user_code: string | null;
  match_code: string;
}

interface BuzzerWinnerEvent extends WSEvent {
  type: "buzzer_winner";
  user_code: string;
  match_code: string;
}
```

---

## Best Practices

### 1. Connection Management

```typescript
// Always send presence on connect
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "player_online",
    user_code: playerCode
  }));
};

// Implement reconnection with backoff
const reconnect = () => {
  setTimeout(() => {
    connect();
  }, 3000);
};
```

### 2. Message Handling

```typescript
// Use switch statement for type handling
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case "send_question":
      handleQuestion(message);
      break;
    case "start_the_timer":
      handleTimer(message);
      break;
    case "navigate":
      handleNavigation(message);
      break;
    default:
      console.log("Unknown message type:", message.type);
  }
};
```

### 3. Error Handling

```typescript
ws.onerror = (error) => {
  console.error("WebSocket error:", error);
  setConnectionStatus("error");
};

ws.onclose = () => {
  setConnectionStatus("disconnected");
  reconnect();
};
```

### 4. Message Queue

```typescript
// Queue messages when disconnected
const messageQueue: WSMessage[] = [];

const sendMessage = (payload: WSMessage) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    messageQueue.push(payload);
  }
};

// Drain queue on reconnect
const drainQueue = () => {
  while (messageQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
    const msg = messageQueue.shift();
    if (msg) {
      ws.send(JSON.stringify(msg));
    }
  }
};
```

### 5. Debounce Frequent Events

```typescript
// Debounce heartbeat to avoid flooding
const sendHeartbeat = useCallback(
  debounce(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "player_heartbeat",
        user_code: playerCode
      }));
    }
  }, 1000),
  [playerCode, ws]
);
```

### 6. Type Safety

```typescript
// Use TypeScript for type safety
const handleWSMessage = (message: WSEvent) => {
  if (message.type === "answer") {
    // TypeScript knows message has answer-specific fields
    console.log(message.answer_text);
  }
};
```

---

## Related Documentation

- [Backend WebSocket API](../backend/websocket.md) - Backend WebSocket implementation
- [Frontend API](./frontend/API.md) - Frontend API reference
- [Frontend Architecture](./frontend/ARCHITECTURE.md) - Architecture overview

---

## Version

**Last Updated**: March 2026  
**Version**: 3.0.0
