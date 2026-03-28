# WebSocket API

**Tag**: `WebSocket`

Real-time communication endpoint for game synchronization.

---

## Table of Contents

- [Connection Endpoint](#connection-endpoint)
- [Authentication](#authentication)
- [Message Format](#message-format)
- [Message Types](#message-types)
- [Implementation Details](#implementation-details)

---

## Connection Endpoint

### WebSocket URL

```
ws://localhost:8000/ws/{match_code}
```

**Production**: `wss://your-domain.com/ws/{match_code}`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match room code |

### Example Connection

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/OC3_M001');

ws.onopen = () => {
  console.log('Connected to match room');
};

ws.onmessage = (event) => {
  // Backend sends raw payload objects (not wrapped)
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onclose = () => {
  console.log('Disconnected');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

---

## Authentication

WebSocket connections do **not** enforce JWT authentication by default.

### Adding Authentication

To implement authentication, validate tokens using `get_ws_user(token)` from `dependencies/user_auth.py`:

```javascript
// Client-side: Send token after connection
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "auth",
    token: "jwt-token-here"
  }));
};
```

---

## Message Format

### Client → Server

Clients send JSON messages:

```json
{
  "type": "message_type",
  "user_code": "string",
  "additional_field": "value"
}
```

### Server → Client

**IMPORTANT**: Backend sends **raw payload objects** directly (NOT wrapped in `{ "message": payload }`).

```json
{
  "type": "message_type",
  "additional_field": "value"
}
```

**Note**: Some frontend code supports both shapes for backward compatibility, but the backend always sends raw objects.

---

## Message Types

### `send_question`

Send a question to all players in the match room.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"send_question"` |
| `user_code` | string | ✅ | Admin user code |
| `question_code` | string | ✅ | Question to send |
| `content` | string | ✅ | Question content |
| `media_source` | string\|array | ❌ | Media URL(s) |

#### Example

```json
{
  "type": "send_question",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "content": "What is the capital of Vietnam?",
  "media_source": "https://example.com/image.jpg"
}
```

---

### `clear_question`

Clear the current question from all players' screens.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"clear_question"` |
| `user_code` | string | ✅ | Admin user code |

#### Example

```json
{
  "type": "clear_question",
  "user_code": "OC_U001"
}
```

---

### `navigate`

Navigate players to a specific page.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"navigate"` |
| `user_code` | string | ✅ | Admin user code |
| `path` | string | ✅ | Path to navigate to |

#### Example

```json
{
  "type": "navigate",
  "user_code": "OC_U001",
  "path": "/player/kdc"
}
```

---

### `start_the_timer`

Start a timer for a question.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"start_the_timer"` |
| `user_code` | string | ✅ | Admin user code |
| `time_limit` | number | ✅ | Timer duration in seconds |
| `question_code` | string | ✅ | Question code |

#### Example

```json
{
  "type": "start_the_timer",
  "user_code": "OC_U001",
  "time_limit": 30,
  "question_code": "OC3_Q001"
}
```

---

### `send_players_info`

Send player information, scoreboard, and profiles (recommended consolidated shape).

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"send_players_info"` |
| `players` | array | ✅ | Array of player objects |

#### Example

```json
{
  "type": "send_players_info",
  "players": [
    {
      "user_code": "OC_U001",
      "user_name": "Nguyen Van A",
      "position": 1,
      "score": 100
    },
    {
      "user_code": "OC_U002",
      "user_name": "Tran Thi B",
      "position": 2,
      "score": 50
    }
  ]
}
```

---

### `player_score_updated`

Notify clients of a score change for a specific player.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"player_score_updated"` |
| `user_code` | string | ✅ | Player's user code |
| `new_total_score` | number | ✅ | Updated total score |

#### Example

```json
{
  "type": "player_score_updated",
  "user_code": "OC_U001",
  "new_total_score": 150
}
```

---

### `answer`

Broadcast a player's answer to all clients.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"answer"` |
| `user_code` | string | ✅ | Player's user code |
| `question_code` | string | ✅ | Question code |
| `match_code` | string | ✅ | Match code |
| `answer_text` | string | ✅ | Answer text |
| `has_buzzed` | boolean | ✅ | Whether player buzzed |
| `timestamp` | number | ✅ | Elapsed seconds |

#### Example

```json
{
  "type": "answer",
  "user_code": "OC_U001",
  "question_code": "OC3_Q001",
  "match_code": "OC3_M001",
  "answer_text": "Hanoi",
  "has_buzzed": false,
  "timestamp": 12.490
}
```

---

### `buzz`

Buzz notification from a player (for individual rounds).

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"buzz"` |
| `user_code` | string | ✅ | Player's user code |

#### Example

```json
{
  "type": "buzz",
  "user_code": "OC_U001"
}
```

---

### `request_presence`

Admin requests all clients to announce their presence.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"request_presence"` |

#### Example

```json
{
  "type": "request_presence"
}
```

**Client Response**: Clients should send `player_online` message.

---

### `player_online`

Player announces presence upon WebSocket connection.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"player_online"` |
| `user_code` | string | ✅ | Player's user code |

#### Example

```json
{
  "type": "player_online",
  "user_code": "OC_U001"
}
```

---

### `clear_answers`

Reset all player answers.

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"clear_answers"` |

#### Example

```json
{
  "type": "clear_answers"
}
```

---

### `send_answers_to_players`

Display other players' answers (for Khởi Động Chung).

#### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `"send_answers_to_players"` |
| `answers` | array | ✅ | Array of answer objects |

#### Example

```json
{
  "type": "send_answers_to_players",
  "answers": [
    {
      "user_code": "OC_U001",
      "content": "Hanoi",
      "timestamp": 12.490
    },
    {
      "user_code": "OC_U002",
      "content": "Ho Chi Minh City",
      "timestamp": 15.230
    }
  ]
}
```

---

## Implementation Details

### Connection Manager

The `ConnectionManager` in `backend/app/utils/ws_connection.py` handles:

| Feature | Description |
|---------|-------------|
| **Connection Management** | Connect/disconnect WebSocket clients |
| **Room Management** | Group clients by match code |
| **Broadcasting** | Send messages to all clients in a room |
| **Valkey Integration** | Publish/subscribe for multi-instance sync |

### Valkey Integration

For multi-instance deployments, WebSocket messages are synchronized via Valkey:

**Publish**:
```python
await redis.publish(f"room:{match_code}", json.dumps({
  "__origin": instance_id,
  "__payload": message
}))
```

**Subscribe**:
- Each instance subscribes to its rooms
- Messages include `__origin` to prevent broadcast loops

### Message Broadcasting Flow

```
Client sends message
        ↓
Server receives via receive_json()
        ↓
Server logs message
        ↓
Calls ws_manager.broadcast_to_room(match_code, data)
        ↓
Broadcasts to all connected clients in room
        ↓
If Valkey enabled: PUBLISH to room:{match_code} channel
        ↓
Other instances receive and forward to their clients
```

### Error Handling

| Error Type | Handling |
|------------|----------|
| **WebSocketDisconnect** | Gracefully removes client from room |
| **General errors** | Logged with full context |
| **Cleanup** | Disconnects properly handled in `finally` block |

---

## Best Practices

### Client-Side

1. **Reconnection**: Implement automatic reconnection with exponential backoff
2. **Message Queue**: Queue messages during disconnection
3. **Heartbeat**: Send periodic ping to keep connection alive
4. **Error Handling**: Handle connection errors gracefully

### Server-Side

1. **Rate Limiting**: Limit message frequency per client
2. **Validation**: Validate all incoming messages
3. **Logging**: Log all messages for debugging
4. **Cleanup**: Properly clean up disconnected clients

---

## Related Files

- `backend/app/main.py` - WebSocket endpoint
- `backend/app/utils/ws_connection.py` - ConnectionManager
- `backend/app/dependencies/ws_manager.py` - WebSocket manager
- `backend/app/dependencies/user_auth.py` - Token validation helpers
