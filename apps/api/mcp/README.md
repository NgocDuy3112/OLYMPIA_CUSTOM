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
| `OC_API_SID` | `""` | Cookie `sid` sau login (quyền tools = quyền user này) |
| `MCP_SERVICE_TOKEN` | `""` | Bearer full-access legacy (dev rỗng = mở) |
| `MCP_AGENT_TOKENS` | `""` | Per-agent: `"ocee:tok1:agent:read,judge;boss:tok2:admin:*"`. Role chỉ `admin,operator,agent` (khác bị loại). Scope ⊂ `read,score,bank,judge`, `*`=all. Set là bật strict mode (thiếu/sai token → 401) |
| `MCP_AGENT_NAME` | `""` | stdio mode: giới hạn scope theo tên trong `MCP_AGENT_TOKENS` |
| `MCP_PORT` / `MCP_HOST` | `8300` / `0.0.0.0` | HTTP mode |

Lấy `sid`: login `POST /api/auth/login` (player) hoặc `/api/auth/staff-login`
(admin/operator), copy cookie `sid`.

## Tools (14)

Read: `list_matches`, `get_match`, `get_scoreboard`, `list_questions`,
`search_bank`, `list_tournaments`, `get_tournament`, `get_standings`,
`qualifier_questions`, `qualifier_standings`.

Write (API vẫn enforce role, thiếu quyền → 401/403):
`score_calculate`, `score_adjust` (controller),
`bank_create` (qauthor), `qualifier_close` (qauthor/controller).

## Giới hạn

- Single-identity: mọi tool dùng chung `OC_API_SID` của server.
  Multi-user thật cần nhúng `/mcp` vào `apps/api` để reuse session
  per-request (xem Grilling notes).
- WS (`/ws/:matchCode`) và SSE bank-events không expose qua MCP.
