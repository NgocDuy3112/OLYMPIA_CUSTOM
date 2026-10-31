import asyncio
import json
import os

from fastapi import FastAPI, Request, WebSocket, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from routes import (
    auth,
    user,
    match,
    answer,
    question,
    record,
    scoreboard,
    media,
    gm,
)
from sqlalchemy import text
from dependencies.postgresql_db import *
from dependencies.redis_store import get_redis
from dependencies.s3_services import init_s3_client, close_s3_client
from dependencies.ws_manager import get_ws_manager
from logger import global_logger
from utils.ws_endpoint import websocket_endpoint_handler


@asynccontextmanager
async def lifespan(app: FastAPI):

    global_logger.info("Application startup: Database engine initialized")

    redis = None
    redis_listener_task = None
    manager = await get_ws_manager()

    try:
        redis = await get_redis()
        manager.set_redis(redis)
        global_logger.info("WebSocket Connection Manager initialized with Redis.")

        async def relay_buzzer_events():
            pubsub = redis.pubsub()
            try:
                await pubsub.psubscribe("events:*")
                global_logger.info("[BUZZ RELAY] Redis subscriber started")
                async for message in pubsub.listen():
                    if message.get("type") != "pmessage":
                        continue
                    try:
                        payload = json.loads(message.get("data", ""))
                    except (TypeError, ValueError):
                        continue
                    if payload.get("type") not in {"buzzer_winner", "blocked_buzz"}:
                        continue
                    channel = str(message.get("channel", ""))
                    match = channel.removeprefix("events:")
                    if not match:
                        continue
                    global_logger.info(
                        f"[BUZZ RELAY] {payload.get('type')!r} match={match!r} "
                        f"user={payload.get('user_code')!r}"
                    )
                    await manager.send_to_room_local(match, payload)
            except asyncio.CancelledError:
                raise
            except Exception:
                global_logger.error("[BUZZ RELAY] Subscriber stopped", exc_info=True)
            finally:
                await pubsub.close()

        redis_listener_task = asyncio.create_task(relay_buzzer_events())
    except Exception as e:
        global_logger.error(
            f"Failed to initialize Redis connection: {str(e)}. "
            f"WebSocket pub/sub features will be unavailable. "
            f"Please verify REDIS_HOST, REDIS_PORT and REDIS_PASSWORD environment variables.",
            exc_info=True
        )

    await init_s3_client()

    async with engine.begin() as conn:
        await conn.execute(text(
            "DO $$ BEGIN "
            "CREATE TYPE roleenum AS ENUM ('player', 'mc', 'admin'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; "
            "END $$"
        ))
        await conn.run_sync(Base.metadata.create_all)
        global_logger.info("Database tables ensured via SQLAlchemy metadata.create_all.")

    yield


    global_logger.info("Application Shutdown: Disposing of database engine.")


    if redis_listener_task is not None:
        redis_listener_task.cancel()
        try:
            await redis_listener_task
        except asyncio.CancelledError:
            pass

    try:
        await manager.shutdown()
    except Exception as e:
        global_logger.warning(f"Error shutting down ConnectionManager: {e}", exc_info=True)

    if redis:
        try:
            await redis.close()
            global_logger.info("Redis connection pool closed.")
        except Exception as e:
            global_logger.warning(f"Error closing Redis connection: {e}", exc_info=True)


    await close_s3_client()

    if engine:
        await engine.dispose()
        global_logger.info("Database engine disposed.")


app = FastAPI(lifespan=lifespan, description="OLYMPIA CUSTOM 3 MATCH - API ENDPOINTS", version="0.0.1")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "message": exc.detail, "data": None},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    global_logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error", "data": None},
    )


@app.get("/health")
def health_check():
    return {"status": "healthy"}


cors_origins = os.getenv("CORS_ORIGINS", "").strip()
allowed_origins = [o.strip() for o in cors_origins.split(",") if o.strip()] if cors_origins else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(match.router)
app.include_router(answer.router)
app.include_router(question.router)
app.include_router(record.router)
app.include_router(scoreboard.router)
app.include_router(media.router)
app.include_router(gm.router)


@app.websocket("/ws/{match_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    match_code: str,
    token: str | None = Query(None, description="JWT access token"),
):
    await websocket_endpoint_handler(websocket, match_code, token)