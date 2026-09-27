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
app/utils/      graph utils: state.py / nodes.py / tools.py
app/agent.py    graph construction (build_graph)
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
`OPENROUTER_API_KEY`, `LLM_MODEL` (`<vendor/model>` trên OpenRouter) — LLM duy nhất
qua `langchain-openrouter` ChatOpenRouter.
Router: `OPENROUTER_API_KEY` (trống thì mặc định task `qa`), `JEV_MODEL`
(default `typesafe/jev-1.13`), `JEV_TIMEOUT`, `JEV_MIN_CONFIDENCE` (default 0.6).
Tracing (OTel → collector → Tempo + Phoenix): `PHOENIX_COLLECTOR_ENDPOINT` là URL ĐẦY ĐỦ
`/v1/traces` (compose: `http://otel-collector:4318/v1/traces`; trỏ thẳng Phoenix:
`http://localhost:6006/v1/traces`), `PHOENIX_PROJECT_NAME` (default `ocee`),
`PHOENIX_API_KEY` (nếu bật auth); trống endpoint = tắt. Tempo: Grafana explore +
exemplar traceID; Phoenix: LLM detail. Server: `PHOENIX_TELEMETRY_ENABLED=false`.
