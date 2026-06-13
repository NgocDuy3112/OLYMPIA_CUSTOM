import os

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query, HTTPException
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
    qualifier,
    media,
)
from sqlalchemy import text
from dependencies.postgresql_db import *
from dependencies.valkey_store import get_valkey
from dependencies.s3_services import init_s3_client, close_s3_client
from dependencies.ws_manager import get_ws_manager
from dependencies.user_auth import get_ws_user
from utils.ws_connection import ConnectionManager
from logger import global_logger
import asyncio
from jwt import PyJWTError


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    global_logger.info("Application startup: Database engine initialized")
    
    valkey = None
    manager = await get_ws_manager()

    try:
        valkey = await get_valkey()
        manager.set_valkey(valkey)
        global_logger.info("WebSocket Connection Manager initialized with Valkey.")
    except Exception as e:
        global_logger.error(
            f"Failed to initialize Valkey connection: {str(e)}. "
            f"WebSocket pub/sub features will be unavailable. "
            f"Please verify VALKEY_HOST, VALKEY_PORT and VALKEY_PASSWORD environment variables.",
            exc_info=True
        )
        # Continue startup without Valkey - REST API will still work

    # S3 singleton: best-effort, same pattern as Valkey. If it fails,
    # media routes return 503 instead of crashing the whole worker.
    await init_s3_client()

    async with engine.begin() as conn:
        await conn.execute(text(
            "DO $$ BEGIN "
            "CREATE TYPE roleenum AS ENUM ('guest', 'player', 'mc', 'admin'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; "
            "END $$"
        ))
        await conn.run_sync(Base.metadata.create_all)
        global_logger.info("Database tables ensured via SQLAlchemy metadata.create_all.")
    
    yield
    
    # Cleanup code
    global_logger.info("Application Shutdown: Disposing of database engine.")
    
    # Gracefully shut down WebSocket ConnectionManager (cancel Valkey listeners)
    try:
        await manager.shutdown()
    except Exception as e:
        global_logger.warning(f"Error shutting down ConnectionManager: {e}", exc_info=True)
    
    if valkey:
        try:
            await valkey.close()
            global_logger.info("Valkey connection pool closed.")
        except Exception as e:
            global_logger.warning(f"Error closing Valkey connection: {e}", exc_info=True)

    # Tear down the S3 singleton so aiohttp's HTTPConnectionPool releases
    # its keep-alive sockets. Safe to call even if init_s3_client failed.
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
    allow_credentials=False,  # must be False when allow_origins=["*"]; app uses Bearer tokens, not cookies
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
app.include_router(qualifier.router)
app.include_router(media.router)



# Message types that non-admin users are allowed to broadcast.
# Admin can send any type. This prevents player/MC from injecting
# privileged messages like score updates, navigation commands, etc.
PLAYER_ALLOWED_TYPES: frozenset[str] = frozenset({
    "answer",
    "player_answer",
    "buzz",
    "player_heartbeat",
    "player_online",
    "mc_online",
    "request_presence",
    "keyword_submit",
    "vd_player_power",
    "vd_power_window_closed",
    "vd_questions_meta_request",
    "pong_latency",
})

MC_ALLOWED_TYPES: frozenset[str] = frozenset({
    "answer",
    "buzz",
    "mc_online",
    "player_heartbeat",
    "player_online",
    "request_presence",
    "send_question",
    "clear_question",
    "start_the_timer",
    "send_answers_to_players",
    "clear_answers",
    "round_start",
    "round_end",
    "navigate",
    "play_video",
    "pause_video",
    "send_players_info",
    "player_score_updated",
    "player_offline",
    "answering_window_activated",
    "vd_power_activated",
    "vdc_questions_meta",
    "vdc_question_state",
    "vdr_questions_meta",
    "vdr_question_state",
    "vd_questions_selected",
    "vd_selection_update",
    "bp_dung",
    "bp_chon_cau_hoi",
    "wrong",
    "skip",
    "game_end",
    "open_match",
    "end_match",
    "finish_match",
    "show_hint",
    "introduce_players",
    "show_scoreboard",
    "keyword_submit",
    "keyword_locked",
    "buzzer_winner",
    "blocked_buzz",
    "vd_power_window_open",
})


@app.websocket("/ws/{match_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    match_code: str,
    token: str | None = Query(None, description="JWT access token"),
):
    # ── Authenticate WebSocket connection ─────────────────────────────────
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    try:
        user_info = get_ws_user(token)
    except PyJWTError:
        await websocket.close(code=4001, reason="Invalid authentication token")
        return
    except Exception:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    user_role = user_info.get("role", "")
    global_logger.info(
        f"WebSocket authenticated: user={user_info['user_code']!r} "
        f"role={user_role!r} room={match_code!r}"
    )

    ws_manager: ConnectionManager = await get_ws_manager()
    await ws_manager.connect(websocket, match_code)

    # ── Reconnect: Resend current game state to player ─────────────────────
    # When a player reconnects, they need to receive the current game state
    # to avoid missing timer/question events
    if user_role == "player":
        try:
            # Request current state from admin (admin should be listening for this)
            await ws_manager.broadcast_to_room(match_code, {
                "type": "player_reconnected",
                "user_code": user_info["user_code"],
            })
            global_logger.info(f"[WS] Player reconnected, requesting state: {user_info['user_code']!r}")
        except Exception as e:
            global_logger.warning(f"[WS] Failed to request state for reconnected player: {e}")

    try:
        while True:
            data = await websocket.receive_json()
            # Inject authenticated user info into inbound messages
            # Only inject user_code if not already present so admin can proxy
            # player-specific messages (e.g. buzzer_winner) without overwriting.
            if "user_code" not in data:
                data["user_code"] = user_info["user_code"]
            data["role"] = user_role

            msg_type = data.get("type", "")

            # Role-based message filtering: only admin and mc can send
            # privileged control messages. Players are restricted to a
            # small set of allowed types to prevent injection attacks.
            if user_role == "player" and msg_type not in PLAYER_ALLOWED_TYPES:
                global_logger.warning(
                    f"[BP ANSWER SYNC] Blocked player message: type={msg_type!r} "
                    f"user={user_info['user_code']!r} room={match_code!r} allowed={PLAYER_ALLOWED_TYPES}"
                )
                continue
            elif user_role == "mc" and msg_type not in MC_ALLOWED_TYPES:
                global_logger.warning(
                    f"Blocked mc message: type={msg_type!r} "
                    f"user={user_info['user_code']!r} room={match_code!r}"
                )
                continue

            global_logger.info(
                f"[BP ANSWER SYNC] Received message from {user_info['user_code']!r} "
                f"role={user_role!r} in room {match_code!r}: {data}"
            )
            await ws_manager.broadcast_to_room(match_code, data)
            global_logger.info(
                f"[BP ANSWER SYNC] Broadcasted message to room {match_code!r}: type={msg_type!r}"
            )

    except WebSocketDisconnect:
        global_logger.info(
            f"WebSocket disconnected: {user_info['user_code']!r} room={match_code!r}"
        )

    except Exception as e:
        global_logger.error(
            f"WebSocket error in room {match_code!r} for "
            f"{user_info['user_code']!r}: {e}",
            exc_info=True,
        )

    finally:
        ws_manager.disconnect(websocket, match_code)