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
    gm,
)
from sqlalchemy import text
from dependencies.postgresql_db import *
from dependencies.valkey_store import get_valkey
from dependencies.s3_services import init_s3_client, close_s3_client
from dependencies.ws_manager import get_ws_manager
from dependencies.user_auth import get_ws_user
from utils.ws_connection import ConnectionManager
from utils.ws_message_processor import (
    apply_buzzer_clear,
    apply_gm_admin_state,
    apply_gm_hint_store,
    apply_gm_player_state,
    apply_vedich_power_gating,
    handle_mc_reconnect,
    handle_player_reconnect,
    is_allowed_by_role,
)
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
app.include_router(gm.router)



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
    await ws_manager.connect(websocket, match_code, user_code=user_info["user_code"])

    if user_role == "player":
        await handle_player_reconnect(ws_manager, match_code, user_info["user_code"])
    elif user_role == "mc":
        # MC reconnects get the same snapshot-replay treatment as
        # players — buzer_winner + gm hints, plus an ``mc_reconnected``
        # hint to the admin so it can re-push the per-round WS state
        # (question / timer / board metadata) to the MC tab. Admin pages
        # group ``mc_online`` + ``mc_reconnected`` so the existing
        # late-join re-broadcast path covers both events.
        await handle_mc_reconnect(ws_manager, match_code, user_info["user_code"])

    try:
        while True:
            data = await websocket.receive_json()
            if "user_code" not in data:
                data["user_code"] = user_info["user_code"]
            data["role"] = user_role

            msg_type = data.get("type", "")

            if not is_allowed_by_role(user_role, msg_type):
                global_logger.warning(
                    f"[BP ANSWER SYNC] Blocked {user_role} message: type={msg_type!r} "
                    f"user={user_info['user_code']!r} room={match_code!r}"
                )
                continue

            global_logger.info(
                f"[BP ANSWER SYNC] Received message from {user_info['user_code']!r} "
                f"role={user_role!r} in room {match_code!r}: {data}"
            )

            # ── Về Đích power gating (server-authoritative) ────────────────
            # Players may use Quyền năng (star / shield) at most once across
            # both Về Đích Chung and Về Đích Riêng. The server rewrites the
            # payload to enforce this — see utils/ws_message_processor.py.
            broadcast_data = await apply_vedich_power_gating(
                ws_manager, match_code, user_info["user_code"], data,
            )

            # ── Buzzer winner server-side state ────────────────────────────────
            # Mirror the VĐ power-gating pattern: a server-side companion
            # function that mutates the authoritative Valkey state for the
            # `clear_buzz` event so a reconnecting player doesn't see a
            # stale winner from the previous question. The payload itself
            # is returned unchanged so it still gets broadcast to clients.
            broadcast_data = await apply_buzzer_clear(
                ws_manager, match_code, broadcast_data,
            )

            # ── Giải Mã per-clue hint store ─────────────────────────────────
            # Server-authoritative snapshot of every hint the admin has
            # revealed / hidden in the current GM round. Player reconnects
            # replay this HASH so a refreshed player does not lose the
            # current hint grid. Like the VĐ / buzzer-writer companions
            # above, the payload is returned unchanged so it still
            # broadcasts to all connected clients normally.
            broadcast_data = await apply_gm_hint_store(
                ws_manager, match_code, broadcast_data,
            )

            # ── Giải Mã admin-tab state snapshot ───────────────────────────
            # Server-authoritative snapshot of the admin's local React
            # state for the GM round. Lets a refreshed admin tab
            # re-hydrate via ``GET /gm/admin-state`` on mount. Admin-only
            # events are gated upstream by ``MC_ALLOWED_TYPES`` so a
            # player/MC accidentally sending them is a no-op for us.
            broadcast_data = await apply_gm_admin_state(
                ws_manager, match_code, broadcast_data,
            )

            # ── Giải Mã per-player state snapshot ─────────────────────────
            # Server-authoritative snapshot of per-player GM state
            # (today: keyword submission). Lets a refreshed player tab
            # re-hydrate ``hasSubmittedKeyword`` via the
            # ``handle_player_reconnect`` replay path so the keyword
            # textbox stays locked. Idempotent with the other GM
            # companions (``apply_gm_hint_store``,
            # ``apply_gm_admin_state``) which DEL their respective
            # keys on ``round_start`` / ``clear_question``.
            broadcast_data = await apply_gm_player_state(
                ws_manager, match_code, broadcast_data,
            )

            await ws_manager.broadcast_to_room(match_code, broadcast_data)
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