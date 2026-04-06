# Qualifier API Documentation

Complete API reference for the Vòng Loại (Qualifier) round in OLYMPIA CUSTOM 3.

---

## Table of Contents

- [Overview](#overview)
- [Game Flow](#game-flow)
- [API Endpoints](#api-endpoints)
- [WebSocket Events](#websocket-events) 
- [Data Models](#data-models)
- [Scoring System](#scoring-system)
- [Advancement Logic](#advancement-logic)
- [Error Handling](#error-handling)
- [Examples](#examples)

---

## Overview

The Qualifier round (Vòng Loại) is the preliminary stage where players compete to advance to the main game. It consists of up to 5 rounds with progressively fewer questions and advancing players.

### Round Structure

| Round | Vietnamese | Questions | Players Advancing | Notes |
|-------|------------|-----------|-------------------|-------|
| 1 | Vòng 1 | 8 | Top 8 | All registered players participate |
| 2 | Vòng 2 | 4 | Top 4 | Only uncategorized players from Round 1 |
| 3 | Vòng 3 | 2 | Top 2 | Only uncategorized players from Round 2 |
| 4 | Vòng 4 | 2 | Top 2 | Only uncategorized players from Round 3 |
| 5 | Dự Phòng | 8 | Fill to 16 | Reserve players from all rounds |

### Player Categories

After each round, players are categorized as:

- **Passed**: Top N players with positive cumulative scores
- **Reserve**: Players with negative cumulative scores
- **Uncategorized**: Players who haven't been categorized yet (continue to next round)

---

## Game Flow

### Admin Workflow

```
1. Import questions via POST /questions/excel/qualifier/
2. Start round via WebSocket: send_question
3. Players submit answers via WebSocket: answer
4. Admin shows correct answer via WebSocket: show_answer
5. Calculate scores: POST /qualifier/calculate-scores
6. End round: POST /qualifier/end-round
7. Repeat for rounds 2-5 as needed
8. View standings: GET /qualifier/standings/{match_code}
9. View advancements: GET /qualifier/advancements/{match_code}
```

### Player Workflow

```
1. Connect to WebSocket: ws://localhost:8000/ws/{match_code}
2. Send presence: player_online
3. Receive question: question
4. Submit answer: answer
5. Receive correct answer: answer_reveal
6. Receive score update: qualifier_scores_updated
7. Receive advancement notification: qualifier_advancement
```

---

## API Endpoints

### POST /qualifier/calculate-scores

Calculate and apply qualifier scores for all players who answered a specific question.

**Authentication**: Required (Admin role)

**Request Body**:
```json
{
  "match_code": "OC3_M_VL",
  "question_code": "OC3_Q_VL_1_01",
  "correct_answer": "A",
  "round_number": 1
}
```

**Request Schema**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | Yes | Match identifier (must start with `OC3_M`) |
| `question_code` | string | Yes | Question identifier (must start with `OC3_Q`) |
| `correct_answer` | string | Yes | Correct answer option (A-F) |
| `round_number` | integer | Yes | Round number (1-5) |

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Scores calculated successfully",
  "data": {
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
}
```

**Error Responses**:
- `400 Bad Request`: Invalid match_code, question_code, or correct_answer format
- `404 Not Found`: Question or match not found
- `500 Internal Server Error`: Database or calculation error

---

### POST /qualifier/end-round

Finalize a qualifier round. Marks players with negative scores as reserve and advances top N players.

**Authentication**: Required (Admin role)

**Request Body**:
```json
{
  "match_code": "OC3_M_VL",
  "round_number": 1,
  "advance_count": null
}
```

**Request Schema**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_code` | string | Yes | Match identifier |
| `round_number` | integer | Yes | Round number to finalize (1-5) |
| `advance_count` | integer | No | Override default advancement count |

**Default Advancement Counts**:
| Round | Default `advance_count` |
|-------|------------------------|
| 1 | 8 |
| 2 | 4 |
| 3 | 2 |
| 4 | 2 |
| 5 | Fill to 16 total passed |

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Round 1 finalized. Advanced 8 players, marked 6 as reserve.",
  "data": {
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
}
```

---

### GET /qualifier/advancements/{match_code}

Retrieve all advancement records for a match.

**Authentication**: Required (Admin role)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `match_code` | string | Match identifier |

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Advancements retrieved successfully",
  "data": {
    "advancements": [
      {
        "user_code": "OC_U_P03TST06",
        "user_name": "Thi sinh 06",
        "status": "passed",
        "round_number": 1,
        "total_score": 21,
        "created_at": "2026-04-04T10:05:00Z"
      },
      {
        "user_code": "OC_U_P03TST01",
        "user_name": "Thi sinh 01",
        "status": "reserve",
        "round_number": 1,
        "total_score": -11,
        "created_at": "2026-04-04T10:05:00Z"
      }
    ]
  }
}
```

---

### GET /qualifier/standings/{match_code}

Retrieve current qualifier standings for a match, sorted by ranking rules.

**Authentication**: Required (Admin or Player role)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `match_code` | string | Match identifier |

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Standings retrieved successfully",
  "data": {
    "standings": [
      {
        "user_code": "OC_U_P03TST06",
        "user_name": "Thi sinh 06",
        "total_score": 21,
        "correct_score": 21,
        "avg_response_time": 3.45,
        "rank": 1
      },
      {
        "user_code": "OC_U_P03TST08",
        "user_name": "Thi sinh 08",
        "total_score": 18,
        "correct_score": 18,
        "avg_response_time": 4.12,
        "rank": 2
      }
    ]
  }
}
```

**Sorting Rules**:
1. Higher `total_score` ranks first
2. If tied, higher `correct_score` ranks first
3. If still tied, lower `avg_response_time` ranks first

---

## WebSocket Events

### qualifier_scores_updated

Broadcast to all clients after score calculation.

**Direction**: Server → Client

**Payload**:
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
    }
  ]
}
```

---

### qualifier_advancement

Broadcast when players are advanced or marked as reserve.

**Direction**: Server → Client

**Payload**:
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

### request_qualifier_state

Request current qualifier state from server.

**Direction**: Player → Server

**Payload**:
```json
{
  "type": "request_qualifier_state",
  "user_code": "OC_U_P03TST01"
}
```

**Server Response**:
```json
{
  "type": "qualifier_state",
  "current_round": 1,
  "current_question": 3,
  "standings": [...]
}
```

---

## Data Models

### qualifier_advancement Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_code` | VARCHAR(50) | Foreign key to users table |
| `match_code` | VARCHAR(50) | Foreign key to matches table |
| `round_number` | INTEGER | Round where advancement occurred |
| `status` | VARCHAR(20) | `passed` or `reserve` |
| `total_score` | INTEGER | Cumulative score at time of advancement |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

### qualifier_records Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_code` | VARCHAR(50) | Foreign key to users table |
| `match_code` | VARCHAR(50) | Foreign key to matches table |
| `question_code` | VARCHAR(50) | Foreign key to questions table |
| `round_number` | INTEGER | Round number |
| `answer_text` | VARCHAR(10) | Player's answer (A-F) |
| `is_correct` | BOOLEAN | Whether answer was correct |
| `response_time` | FLOAT | Time taken to answer (seconds) |
| `score_delta` | INTEGER | Points earned/lost |
| `created_at` | TIMESTAMP | Record creation time |

---

## Scoring System

### Score Calculation

For each question, players earn or lose points based on their answer:

```
Correct answer: +wrong_count points
Wrong answer: -correct_count points
Skipped: 0 points
```

**Example**:
- 20 players answer a question
- 16 correct, 4 wrong
- Correct players: +4 points each
- Wrong players: -16 points each

### Cumulative Score

Players accumulate scores across all questions in all rounds:

```
total_score = sum(score_delta for all questions answered)
```

### Ranking Rules

Players are ranked by:
1. **Total Score** (descending) - higher is better
2. **Correct Score** (descending) - sum of positive deltas
3. **Average Response Time** (ascending) - faster is better

---

## Advancement Logic

### End of Round Processing

When `POST /qualifier/end-round` is called:

1. **Calculate cumulative scores** for all players who answered questions in the round
2. **Mark reserves**: Players with `total_score < 0` are marked as `reserve`
3. **Advance top N**: From remaining uncategorized players, select top N by ranking
4. **Broadcast results**: Send `qualifier_advancement` WebSocket event

### Important Rules

1. **Once categorized, always categorized**: A player marked as `passed` or `reserve` cannot change status
2. **Round 5 fills to 16**: The backup round advances enough reserve players to reach 16 total passed
3. **Uncategorized players continue**: Only players without a status participate in subsequent rounds

### Example Flow

**Round 1** (20 players, 8 questions):
- After scoring: 14 players have positive scores, 6 have negative
- End round: Top 8 → `passed`, 6 with negative → `reserve`
- Remaining 6 uncategorized → continue to Round 2

**Round 2** (6 players, 4 questions):
- After scoring: 4 positive, 2 negative
- End round: Top 4 → `passed`, 2 → `reserve`
- 0 uncategorized remaining

**Round 3** (0 players):
- No uncategorized players to participate
- No advancements

---

## Error Handling

### Common Errors

| Status Code | Error | Cause |
|-------------|-------|-------|
| 400 | Invalid match_code | match_code doesn't start with `OC3_M` |
| 400 | Invalid question_code | question_code doesn't start with `OC3_Q` |
| 400 | Invalid correct_answer | Answer not in A-F |
| 400 | Invalid round_number | Round not in 1-5 |
| 404 | Match not found | No match with given code |
| 404 | Question not found | No question with given code |
| 403 | Forbidden | Non-admin trying to access admin endpoints |
| 500 | Internal error | Database or calculation failure |

---

## Examples

### Complete Round Flow

```bash
# 1. Calculate scores for question 1
curl -X POST http://localhost:8000/qualifier/calculate-scores \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M_VL",
    "question_code": "OC3_Q_VL_1_01",
    "correct_answer": "A",
    "round_number": 1
  }'

# 2. Repeat for all 8 questions...

# 3. End round 1
curl -X POST http://localhost:8000/qualifier/end-round \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_code": "OC3_M_VL",
    "round_number": 1
  }'

# 4. Get standings
curl -X GET "http://localhost:8000/qualifier/standings/OC3_M_VL" \
  -H "Authorization: Bearer $TOKEN"

# 5. Get advancements
curl -X GET "http://localhost:8000/qualifier/advancements/OC3_M_VL" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### WebSocket Integration

```typescript
// Player connects and submits answer
const ws = new WebSocket('ws://localhost:8000/ws/OC3_M_VL');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'player_online',
    user_code: 'OC_U_P03TST01'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'question':
      // Display question to player
      break;
    case 'qualifier_scores_updated':
      // Update player's score display
      console.log('Score delta:', data.score_updates[0].delta);
      break;
    case 'qualifier_advancement':
      // Show advancement results
      console.log('Passed:', data.passed);
      console.log('Reserve:', data.reserve);
      break;
  }
};

// Submit answer
ws.send(JSON.stringify({
  type: 'answer',
  user_code: 'OC_U_P03TST01',
  question_code: 'OC3_Q_VL_1_01',
  answer_text: 'A',
  has_buzzed: false,
  timestamp: 5.234
}));
```

### Testing Scripts

#### simulate_qualifier_bot.py

**Location**: `scripts/simulate_qualifier_bot.py`

**Purpose**: Bot players tự động trả lời khi admin broadcast câu hỏi qua WebSocket. Dùng để test UI mà không cần nhiều người thật.

**Features**:
- Đăng nhập N players test (OC_U_P03TST01-64)
- Kết nối WebSocket cho từng player
- Lắng nghe event `send_question` từ admin
- Tự động submit đáp án với delay ngẫu nhiên (1-9s)
- Có thể điều chỉnh tỷ lệ đúng/sai và tỷ lệ bỏ qua

**Chạy trong container**:
```bash
podman exec -it -w /backend/app app python simulate_qualifier_bot.py --players 20
```

**Options**:
```bash
--players N        Số bot players (default 20)
--correct-rate F     Xác suất trả lời đúng 0.0-1.0 (default 0.75)
--skip-rate F        Xác suất bỏ qua câu hỏi (default 0.10)
--min-delay F        Delay tối thiểu giây (default 1.0)
--max-delay F        Delay tối đa giây (default 9.0)
```

**Workflow**:
1. Chạy script ở terminal
2. Admin vào browser `/admin/vl`
3. Admin click **BẮT ĐẦU VÒNG** → chọn câu → **BẤM GIỜ**
4. Bots tự động trả lời, terminal hiển thị từng đáp án
5. Admin click **TÍNH ĐIỂM** và **KẾT THÚC VÒNG** như bình thường

#### simulate_qualifier_full.py

**Location**: `scripts/simulate_qualifier_full.py`

**Purpose**: Full 5-round batch simulation (non-interactive). Tự động chạy hết 5 vòng không cần admin.

**Chạy**:
```bash
podman exec -it -w /backend/app app python simulate_qualifier_full.py --auto --burst --players 20
```

---

## Related Documentation

- [WebSocket Events](./websocket.md) - Full WebSocket event reference
- [Questions API](./questions.md) - Question import and management
- [Answers API](./answers.md) - Answer submission and caching
- [Records API](./records.md) - Score recording
- [Frontend Types](../../frontend/src/types/qualifier.ts) - TypeScript interfaces