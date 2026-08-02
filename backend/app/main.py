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
    apply_vedich_turn_player,
    handle_guest_reconnect,
    handle_mc_reconnect,
    handle_player_reconnect,
    is_allowed_by_role,
    send_initial_snapshot,
)
from utils.round_snapshot import apply_round_snapshot
from core.question import get_question_from_request_from_db
from logger import global_logger
import asyncio
from jwt import PyJWTError


@asynccontextmanager
async def lifespan(app: FastAPI):

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


    global_logger.info("Application Shutdown: Disposing of database engine.")


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
app.include_router(qualifier.router)
app.include_router(media.router)
app.include_router(gm.router)


@app.websocket("/ws/{match_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    match_code: str,
    token: str | None = Query(None, description="JWT access token"),
):

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


    if user_role in ("admin", "mc"):
        global_logger.info(
            f"WebSocket authenticated: user={user_info['user_code']!r} "
            f"role={user_role!r} room={match_code!r}"
        )
    else:
        global_logger.debug(
            f"WebSocket authenticated: user={user_info['user_code']!r} "
            f"role={user_role!r} room={match_code!r}"
        )

    ws_manager: ConnectionManager = await get_ws_manager()
    await ws_manager.connect(websocket, match_code, user_code=user_info["user_code"], role=user_role)

    if user_role in ("admin", "player", "mc", "guest"):
        await send_initial_snapshot(ws_manager, websocket, match_code, user_info["user_code"], user_role)

    if user_role == "player":
        await handle_player_reconnect(ws_manager, match_code, user_info["user_code"])
    elif user_role == "mc":
        await handle_mc_reconnect(ws_manager, match_code, user_info["user_code"])
    elif user_role == "guest":
        await handle_guest_reconnect(ws_manager, match_code, user_info["user_code"])

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

            if msg_type in {"buzz", "vd_player_power", "answer", "player_answer"}:
                global_logger.info(
                    f"[BP ANSWER SYNC] Received message from {user_info['user_code']!r} "
                    f"role={user_role!r} in room {match_code!r}: {data}"
                )
            else:
                global_logger.debug(
                    f"[BP ANSWER SYNC] Received message from {user_info['user_code']!r} "
                    f"role={user_role!r} in room {match_code!r}: type={msg_type!r}"
                )

            broadcast_data = await apply_vedich_turn_player(
                ws_manager, match_code, data,
            )

            broadcast_data = await apply_vedich_power_gating(
                ws_manager, match_code, user_info["user_code"], broadcast_data,
            )
            broadcast_data = await apply_buzzer_clear(
                ws_manager, match_code, broadcast_data,
            )
            broadcast_data = await apply_gm_hint_store(
                ws_manager, match_code, broadcast_data,
            )
            broadcast_data = await apply_gm_admin_state(
                ws_manager, match_code, broadcast_data,
            )
            broadcast_data = await apply_gm_player_state(
                ws_manager, match_code, broadcast_data,
            )

            await apply_round_snapshot(ws_manager.valkey, match_code, broadcast_data)

            if msg_type == "show_hint":
                await ws_manager.send_gm_hint_local(match_code, broadcast_data)
            else:
                await ws_manager.broadcast_to_room(match_code, broadcast_data)

            if msg_type == "send_question":
                question_code = broadcast_data.get("question_code", "")
                if question_code:
                    try:
                        async with AsyncSessionLocal() as reveal_session:
                            q_result = await get_question_from_request_from_db(match_code, question_code, reveal_session)
                            q_data = q_result.data if isinstance(q_result.data, dict) else {}
                            answer = q_data.get("answer", "") if q_data else ""
                            explanation = q_data.get("explanation", "") if q_data else ""
                            await ws_manager.send_to_roles_local(match_code, ["mc", "guest", "admin"], {
                                "type": "reveal_answer",
                                "question_code": question_code,
                                "answer": answer,
                                "explanation": explanation,
                            })
                    except Exception as e:
                        global_logger.warning(f"[WS] reveal_answer failed for {question_code!r}: {e}")

            if msg_type in {"buzz", "vd_player_power", "answer", "player_answer", "buzzer_winner", "blocked_buzz"}:
                global_logger.info(
                    f"[BP ANSWER SYNC] Broadcasted message to room {match_code!r}: type={msg_type!r}"
                )
            else:
                global_logger.debug(
                    f"[BP ANSWER SYNC] Broadcasted message to room {match_code!r}: type={msg_type!r}"
                )

    except WebSocketDisconnect:
        global_logger.debug(
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