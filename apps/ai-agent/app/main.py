"""FastAPI entry — wiring thủ công, không DI framework."""

from __future__ import annotations

from contextlib import asynccontextmanager

import redis.asyncio as redis
from fastapi import FastAPI, Header, HTTPException, Request, Response

from app.adapters.bank_gateway import BankGatewayRepo
from app.adapters.discord_gateway import DiscordGatewayRepo
from app.adapters.jev_router import JevRouter
from app.adapters.llm_http import build_llm_client
from app.adapters.question_gateway import QuestionGatewayRepo
from app.adapters.score_gateway import ScoreGatewayRepo
from app.adapters.valkey_snapshot import ValkeySnapshotRepo
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_client = redis.Redis(
        host=settings.valkey_host,
        port=settings.valkey_port,
        decode_responses=True,
    )
    snapshot_repo = ValkeySnapshotRepo(redis_client)
    llm = build_llm_client()  # OpenAI-compatible qua LLM_BASE_URL
    jev_router = JevRouter()
    app.state.agent = AgentService(
        llm=llm,
        snapshot_repo=snapshot_repo,
        score_repo=ScoreGatewayRepo(),
        question_repo=QuestionGatewayRepo(),
        bank_repo=BankGatewayRepo(),
        discord_repo=DiscordGatewayRepo(),
        cache=redis_client,
        router=jev_router,
    )
    app.state.redis = redis_client
    yield
    await jev_router.aclose()
    await redis_client.aclose()


app = FastAPI(title="oc-ai-agent", lifespan=lifespan)


def _check_service_token(request: Request) -> None:
    expected = settings.agent_service_token
    if not expected:
        return  # dev: gateway-local traffic, auth enforced by Fastify
    if request.headers.get("x-agent-token") != expected:
        raise HTTPException(status_code=401, detail="Invalid agent token")


async def _check_rate_limit(redis_client, user_code: str) -> None:
    key = f"agent:rate:{user_code}:1m"
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
    _check_service_token(request)
    role = ROLE_HEADER_ALIASES.get(x_user_role)
    if role is None:
        raise HTTPException(status_code=403, detail="OCee chỉ dành cho admin/operator")

    await _check_rate_limit(request.app.state.redis, x_user_code)

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
