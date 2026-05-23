# Matches API

**Tag**: `Matches`

Match management endpoints for creating, retrieving, updating, and deleting matches.

---

## Table of Contents

- [POST `/matches/`](#post-matches)
- [GET `/matches/`](#get-matches)
- [GET `/matches/all`](#get-matchesall)
- [GET `/matches/{match_code}/room`](#get-matchesmatch_coderoom)
- [GET `/matches/{match_code}/players`](#get-matchesmatch_codeplayers)
- [PATCH `/matches/{match_code}`](#patch-matchesmatch_code)
- [PATCH `/matches/{match_code}/finish`](#patch-matchesmatch_codefinish)
- [DELETE `/matches/{match_code}`](#delete-matchesmatch_code)

---

## POST `/matches/`

Create a new match with optional player assignments.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/` |
| **Method** | `POST` |
| **Auth** | Admin role required |
| **Content-Type** | `application/json` |

### Request Body

**Schema**: `MatchInfoPostRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | ✅ | Unique match ID (must start with `OC3_M`) |
| `match_name` | string | ✅ | Human-readable match name |
| `match_status` | string | ❌ | Match status: `setup`, `active`, `completed`, `in_progress`, `paused`, `finished` (default: `setup`) |
| `players` | array | ❌ | Player assignments (max 4 players) |

**Player Assignment Schema** (`MatchPlayerAssignment`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_code` | string | ✅ | Player's user code (must start with `OC_U`) |
| `position` | integer | ✅ | Position (1-4) |

### Request Example

```bash
curl -X POST http://localhost:8000/matches/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      {"user_code": "OC_U001", "position": 1},
      {"user_code": "OC_U002", "position": 2},
      {"user_code": "OC_U003", "position": 3},
      {"user_code": "OC_U004", "position": 4}
    ]
  }'
```

### Success Response

**Status**: `201 Created`

```json
{
  "status": "success",
  "message": "Match created successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input (e.g., wrong `match_code` format) |
| `400` | Duplicate Error | Match already exists |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `500` | Server Error | Database or server error |

---

## GET `/matches/`

Retrieve match details by match code (includes players).

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to retrieve |

### Request Example

```bash
curl -X GET "http://localhost:8000/matches/?match_code=OC3_M001" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Match retrieved successfully",
  "data": {
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      { "user_code": "OC_U001", "user_name": "Nguyen Van A", "position": 1 }
    ]
  }
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Missing or invalid `match_code` |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## GET `/matches/all`

Retrieve all non-deleted matches.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/all` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Request Example

```bash
curl -X GET "http://localhost:8000/matches/all" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Matches retrieved successfully",
  "data": [
    { "match_code": "OC3_M001", "match_name": "Vòng loại 1" },
    { "match_code": "OC3_M002", "match_name": "Trận chung kết" }
  ]
}
```

---

## GET `/matches/{match_code}/room`

Retrieve match room info for a player, MC, or admin joining a room. Returns match metadata and current player list.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}/room` |
| **Method** | `GET` |
| **Auth** | Any authenticated user |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code |

### Request Example

```bash
curl -X GET "http://localhost:8000/matches/OC3_M001/room" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

**Schema**: `MatchRoomResponse`

```json
{
  "status": "success",
  "message": "Match room retrieved successfully",
  "data": {
    "match_code": "OC3_M001",
    "match_name": "Vòng loại 1",
    "players": [
      { "user_code": "OC_U001", "user_name": "Nguyen Van A", "position": 1 }
    ]
  }
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## GET `/matches/{match_code}/players`

Retrieve the list of players in a match.

## GET `/matches/{match_code}/players`

Retrieve the list of players in a match.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}/players` |
| **Method** | `GET` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to retrieve players for |

### Request Example

```bash
curl -X GET "http://localhost:8000/matches/OC3_M001/players" \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Players retrieved successfully",
  "data": {
    "players": [
      {
        "user_code": "OC_U001",
        "user_name": "Nguyen Van A",
        "position": 1
      },
      {
        "user_code": "OC_U002",
        "user_name": "Tran Thi B",
        "position": 2
      }
    ]
  }
}
```

### Error Responses

---

## PATCH `/matches/{match_code}`

Update an existing match.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}` |
| **Method** | `PATCH` |
| **Auth** | Admin role required |
| **Content-Type** | `application/json` |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to update |

### Request Body

**Schema**: `MatchUpdateRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_name` | string | ❌ | New match name |
| `match_status` | string | ❌ | New match status: `setup`, `active`, `completed`, `in_progress`, `paused`, `finished` |
| `players` | array | ❌ | Updated player assignments |

### Request Example

```bash
curl -X PATCH http://localhost:8000/matches/OC3_M001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "match_name": "Vòng loại 1 - Updated",
    "players": [
      {"user_code": "OC_U001", "position": 1},
      {"user_code": "OC_U002", "position": 2}
    ]
  }'
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Match updated successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Validation Error | Invalid input data |
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## PATCH `/matches/{match_code}/finish`

Mark a match as finished. Sets `match_status` to `finished`.

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}/finish` |
| **Method** | `PATCH` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to finish |

### Request Example

```bash
curl -X PATCH http://localhost:8000/matches/OC3_M001/finish \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Match finished successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## DELETE `/matches/{match_code}`

Soft-delete a match (sets `is_deleted = true`).

### Request

| Property | Value |
|----------|-------|
| **URL** | `/matches/{match_code}` |
| **Method** | `DELETE` |
| **Auth** | Admin role required |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `match_code` | string | ✅ | Match code to delete |

### Request Example

```bash
curl -X DELETE http://localhost:8000/matches/OC3_M001 \
  -H "Authorization: Bearer <token>"
```

### Success Response

**Status**: `200 OK`

```json
{
  "status": "success",
  "message": "Match deleted successfully",
  "data": null
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `401` | Authentication Error | Missing or invalid token |
| `403` | Authorization Error | Not an admin user |
| `404` | Not Found Error | Match not found |
| `500` | Server Error | Database or server error |

---

## Schemas

### MatchInfoPostRequest

```typescript
interface MatchInfoPostRequest {
  match_code: string;  // Must start with 'OC3_M'
  match_name: string;
  match_status?: "setup" | "active" | "completed" | "in_progress" | "paused" | "finished";
  players?: MatchPlayerAssignment[];
}

interface MatchPlayerAssignment {
  user_code: string;  // Must start with 'OC_U'
  position: number;   // 1-4
}
```

### MatchUpdateRequest

```typescript
interface MatchUpdateRequest {
  match_name?: string;
  match_status?: "setup" | "active" | "completed" | "in_progress" | "paused" | "finished";
  players?: MatchPlayerAssignment[];
}
```

### MatchRoomResponse

```typescript
interface MatchRoomResponse {
  status: "success" | "error";
  message: string;
  data: {
    match_code: string;
    match_name: string;
    players: MatchPlayerInRoom[];
  } | null;
}

interface MatchPlayerInRoom {
  user_code: string;
  user_name: string;
  position: number;
}
```

---

## Related Files

- `backend/app/routes/match.py` - Route handlers
- `backend/app/core/match.py` - Business logic
- `backend/app/schemas/match.py` - Match schemas
- `backend/app/models/match.py` - Match model
