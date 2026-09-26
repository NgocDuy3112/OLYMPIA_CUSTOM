# apps/ai-agent — MVP 2 Q&A agent

Stateless FastAPI service. Reads hot match state from Valkey directly,
DB-derived data via Fastify internal endpoints. No auth: Fastify gateway
injects `X-User-Code` / `X-User-Role` headers after validating the session.

## Run

```bash
uv sync                 # or: pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8100
```

## Layout (hexagonal-lite)

```
app/domain/     Pydantic models + Protocol ports
app/adapters/   ValkeySnapshotRepo, ApiGatewayScoreRepo, LLMClient (stub)
app/tools/      tool-loop: tool definitions + executor
app/services/   AgentService orchestrator
app/main.py     FastAPI wiring
```

## API

`POST /agent/ask`

```json
{ "match_code": "OC3_x", "question": "Ai đang dẫn đầu?" }
```
Headers: `X-User-Code`, `X-User-Role` (controller|mc|qauthor|operator|admin — staff only).

Response: `{ "answer": "...", "tools_used": ["get_scoreboard"], "cached": false }`

Env: `VALKEY_HOST`, `VALKEY_PORT`, `API_INTERNAL_URL`, `AGENT_SERVICE_TOKEN`,
`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Router: `TYPESAFE_API_KEY` (trống thì
keyword fallback), `JEV_MODEL`, `JEV_TIMEOUT`, `JEV_MIN_CONFIDENCE` (default 0.6).
