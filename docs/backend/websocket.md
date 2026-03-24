
# WebSocket API

This document describes the WebSocket endpoint for real-time communication.

---

## Table of Contents

- [Connection Endpoint](#connection-endpoint)
- [Message Format](#message-format)
- [Message Types](#message-types)
- [Implementation Details](#implementation-details)

---

## Connection Endpoint

### WebSocket URL

```
ws://localhost:8000/ws/{match_code}
```

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
  // NOTE: Backend sends raw payload objects, NOT wrapped in { "message": payload }
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

### Authentication

WebSocket connections currently don't enforce JWT authentication by default. To add authentication, implement token validation using `get_ws_user(token)` from `dependencies/user_auth.py`.

---

## Message Format

### Client → Server

Clients send JSON messages to the server:

```json
{
  "type": "message_type",
  "user_code": "string",
  "additional_field": "value"
}
```

### Server → Client

**IMPORTANT**: The backend broadcasts **raw payload objects directly** to clients. It does NOT wrap outbound frames in a `{ "message": payload }` envelope.

```json
{
  "type": "message_type",
  "additional_field": "value"
}
```

**Note**: Some frontend code defensively supports both shapes for backward compatibility, but the backend always sends raw objects.

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

Send player information to players (recommended consolidated shape).

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

## Implementation Details

### Connection Manager

The `ConnectionManager` in `backend/app/utils/ws_connection.py` handles:

- **Connection management**: Connect/disconnect WebSocket clients
- **Room management**: Group clients by match code
- **Broadcasting**: Send messages to all clients in a room
- **Valkey integration**: Publish/subscribe for multi-instance sync

### Valkey Integration

For multi-instance deployments, the WebSocket manager uses Valkey for message synchronization:

- **Publish**: Messages are published to `room:{match_code}` channel
- **Subscribe**: Each instance subscribes to its rooms
- **Loop prevention**: Messages include `__origin` and `__payload` fields to prevent broadcast loops

### Message Broadcasting

When a client sends a message:

1. Server receives via `receive_json()`
2. Logs the message
3. Calls `ws_manager.broadcast_to_room(match_code, data)`
4. Server wraps payload as `{ "message": <payload> }`
5. Broadcasts to all clients in the room
6. If Valkey is enabled, publishes to channel for other instances

### Error Handling

- **WebSocketDisconnect**: Gracefully handles client disconnections
- **General errors**: Logged with full context for debugging
- **Cleanup**: Disconnects are properly handled in `finally` block

---

## Related Files

- `backend/app/main.py` - WebSocket endpoint
- `backend/app/utils/ws_connection.py` - ConnectionManager
- `backend/app/dependencies/ws_manager.py` - WebSocket manager dependency
- `backend/app/dependencies/user_auth.py` - Token validation helpers
         { "user_code": "OC_U_P01", "user_name": "Nguyen A", "position": 1, "cummulative_score": 120 },
         { "user_code": "OC_U_P02", "user_name": "Tran B", "position": 2, "cummulative_score": 90 }
       ]
     }
     ```
   - Legacy/alternate shape supported by some clients: `{ type: 'send_players_info', players: [...], scoreboard: [...], profiles: [...] }` — clients should accept either.

 - `player_score_updated` (server → clients)
   - payload example: `{ "type": "player_score_updated", "user_code": "OC_U_P03", "new_total_score": 150 }`

 - Output wrapper (server → client): messages are sent inside an envelope `{ "message": <payload> }` by the ConnectionManager. Frontend helpers typically unwrap this envelope before dispatching by `type`.

### Notes và best-practices

- Migration: các endpoint HTTP legacy `/controller/*` (admin → POST send_question / start_clock / navigate / clear_question ...) được xem là deprecated trong kế hoạch migrazione sang WS-first. Thay vì gọi REST, admin UI nên gửi control messages qua WebSocket theo các payload mẫu ở trên.
- Admin UI: sử dụng hook `useWebSocket(matchCode)` và gọi `sendMessage(payload)` (ví dụ như trên). Đảm bảo payload có `user_code` (admin có thể dùng `""` nếu không có mã user cụ thể) để tuân typing trên frontend.
- Multi‑instance: nếu triển khai nhiều backend, Valkey được dùng để replicate messages giữa các instance. `ConnectionManager` tự thêm `__origin` khi publish và bỏ qua các message có `__origin` trùng để tránh lặp.

### Error handling

- Lỗi trong loop được log; manager cố gắng cleanup clients bị lỗi.

## File liên quan

- `backend/app/main.py` (`websocket_endpoint`)
- `backend/app/utils/ws_connection.py` (ConnectionManager, Valkey integration)
- `backend/app/dependencies/ws_manager.py`
