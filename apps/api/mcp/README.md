# @oc/api-mcp — MCP server cho Fastify backend

Thin HTTP-client: không chạm DB/Valkey trực tiếp, gọi lại REST `/api/*`
của `apps/api` nên reuse toàn bộ guard (`requireAuth/Role/Scope`),
validation và audit. Hỗ trợ cả **stdio** và **Streamable HTTP**.

```mermaid
flowchart LR
    Client[MCP client] -->|stdio| MCP[@oc/api-mcp]
    Client -->|POST /mcp| MCP
    MCP -->|fetch + sid cookie| API[apps/api /api/*]
    API --> DB[(Postgres)]
    API --> Valkey[(Valkey)]
```

## Chạy

```bash
# 1. Backend phải chạy trước
pnpm --filter @oc/api dev   # :8000

# 2. Cài + build MCP
pnpm --filter @oc/api-mcp install
pnpm --filter @oc/api-mcp build

# stdio (Claude Desktop / Code)
OC_API_BASE_URL=http://localhost:8000 OC_API_SID=<sid-login> \
  node apps/api/mcp/dist/index.ts

# HTTP
MCP_PORT=8300 node apps/api/mcp/dist/index.js -- --http
curl -X POST localhost:8300/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

## Env

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `OC_API_BASE_URL` | `http://localhost:8000` | Backend Fastify |
| `OC_API_SID` | `""` | Dev/stdio fallback khi request không có token identity (quyền = user này) |
| `MCP_SERVICE_TOKEN` | `""` | Secret chung MCP→API: MCP mint sid từ identity (`POST /api/auth/service/session`). Trùng giá trị với env của `apps/api`. Trong strict mode, Bearer này = legacy full-access (dùng `OC_API_SID`) |
| `MCP_AGENT_TOKENS` | `""` | Per-agent: `"ocee:tok1:OC_U_17270001;boss:tok2:OC_U_17270002"` — format `name:token:userCode`. `userCode` phải là user role `operator`/`admin` (mint từ chối khác). Set là bật strict mode (thiếu/sai token → 401) |
| `MCP_AGENT_NAME` | `""` | stdio mode: chọn identity theo tên trong `MCP_AGENT_TOKENS` |
| `MCP_PORT` / `MCP_HOST` | `8300` / `0.0.0.0` | HTTP mode |

Dev fallback lấy `sid`: login `POST /api/auth/login` (player) hoặc
`/api/auth/staff-login` (admin/operator), copy cookie `sid` vào `OC_API_SID`.
Có token identity thì khỏi cần — MCP tự mint sid server-side.

## Identity flow (token → sid)

```
Bearer <token> → token record → userCode → POST /api/auth/service/session
  (guard Bearer MCP_SERVICE_TOKEN, role operator/admin) → sid TTL 24h
  → cache in-memory → API call Cookie sid=<sid> → 401 → mint lại 1 lần
```

Client (ChatGPT / Claude Code) chỉ cấu hình URL + Bearer token như cũ —
không thấy sid, không cần tạo lại token khi sid hết hạn.

## Tools (7)

Read: `match_overview`, `tournament_overview`, `match_questions`,
`match_answers`, `bank_search`.

Write (API vẫn enforce role, thiếu quyền → 401/403): `grade_question`,
`bank_create` (qauthor).

Tool gộp theo intent (không endpoint =1 tool): không identifier → list,
có identifier → detail; `match_overview` kèm `includeScoreboard`,
`tournament_overview` kèm `view:"standings"`.

## Giới hạn

- Gỡ hết tool gating: mọi token hợp lệ nhận đủ 13 tool — quyền do backend
  chốt theo identity (role `operator`/`admin` check lúc mint).
- Dev/stdin không token: fallback `OC_API_SID` (single-identity cũ).
- WS (`/ws/:matchCode`) và SSE bank-events không expose qua MCP.
