from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager

import redis.asyncio as redis
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastmcp.client import Client

from app.adapters.jev_router import JevRouter
from app.adapters.llm_openrouter import build_llm_model
from app.config import settings
from app.domain.models import AgentError, AgentRequest, AgentResponse, UserRole
from app.services.agent_service import AgentService

ROLE_HEADER_ALIASES: dict[str, UserRole] = {
    "controller": "controller",
    "admin": "admin",
    "operator": "operator",
    "mc": "mc",
    "qauthor": "qauthor",
}

RATE_LIMIT_PER_MINUTE = 10


def _hashed_identity(user_code: str, match_code: str = "") -> str:
    """Hash user_code — Valkey/thread key không chứa PII thô."""
    import hashlib

    return hashlib.sha256(f"{user_code}:{match_code}".encode()).hexdigest()[:24]


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.observability import setup

    setup(app)

    async with AsyncExitStack() as stack:
        redis_client = redis.Redis(
            host=settings.valkey_host,
            port=settings.valkey_port,
            decode_responses=True,
        )
        model = build_llm_model()
        per_task = {}
        for task, override in (
            ("qa", settings.llm_model_qa),
            ("verify", settings.llm_model_verify),
            ("index", settings.llm_model_index),
            ("assist", settings.llm_model_assist),
            ("ops", settings.llm_model_ops),
            ("reason", settings.llm_model_reason),
            ("fact", settings.llm_model_fact),
            ("fresh", settings.llm_model_fresh),
        ):
            if override and override != settings.llm_model:
                per_task[task] = build_llm_model(override)
        jev_router = JevRouter()
        # Checkpointer Postgres (memory dài hạn, survive restart).
        # Không có URL/không nối được → None, service fallback MemorySaver.
        checkpointer = None
        if settings.postgres_url:
            try:
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

                checkpointer = await stack.enter_async_context(
                    AsyncPostgresSaver.from_conn_string(settings.postgres_url)
                )
                await checkpointer.setup()
            except Exception as exc:  # noqa: BLE001 — fail-open MemorySaver
                print(f"Postgres checkpointer unavailable, using memory: {exc}")
                checkpointer = None
        # 1 shared MCP connection cho cả process (adapter + tools).
        # MCP chết lúc start → None, fail-open chạy snapshot/discord.
        mcp_url = settings.mcp_base_url.rstrip("/") + "/mcp"
        try:
            mcp_shared = await stack.enter_async_context(
                Client(mcp_url, auth=settings.mcp_token)
                if settings.mcp_token
                else Client(mcp_url)
            )
        except Exception:  # noqa: BLE001 — MCP chết lúc start thì fail-open
            mcp_shared = None
        app.state.agent = AgentService(
            cache=redis_client,
            router=jev_router,
            model=model,
            models=per_task,
            mcp=mcp_shared,
            checkpointer=checkpointer,
        )
        app.state.redis = redis_client
        yield
    from app.observability import flush

    flush()
    await jev_router.aclose()
    await redis_client.aclose()


app = FastAPI(title="oc-ai-agent", lifespan=lifespan)


async def check_rate_limit(redis_client, user_code: str) -> None:
    key = f"agent:rate:{_hashed_identity(user_code)}:1m"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, 60)
    if count > RATE_LIMIT_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


@app.post("/agent/ask", response_model=AgentResponse)
async def agent_ask(
    body: AgentRequest,
    request: Request,
    x_user_code: str = Header(default="anonymous"),
    x_user_role: str = Header(default="operator"),
) -> AgentResponse:
    # Không token riêng — Fastify gateway gọi local, rate-limit + role đủ.
    role = ROLE_HEADER_ALIASES.get(x_user_role)
    if role is None:
        raise HTTPException(status_code=403, detail="OCee chỉ dành cho admin/operator")

    await check_rate_limit(request.app.state.redis, x_user_code)

    try:
        return await request.app.state.agent.ask(
            body.match_code, body.question, role, x_user_code
        )
    except AgentError as error:
        raise HTTPException(
            status_code=error.status_code, detail=error.message
        ) from error


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/metrics")
async def metrics() -> Response:
    from app.metrics import metrics_bytes

    body, content_type = metrics_bytes()
    return Response(content=body, media_type=content_type)
