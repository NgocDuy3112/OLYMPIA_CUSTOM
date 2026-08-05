from fastapi import Query, WebSocket, WebSocketDisconnect
from jwt import PyJWTError

from core.question import get_question_from_request_from_db
from dependencies.postgresql_db import AsyncSessionLocal
from dependencies.user_auth import get_ws_user
from dependencies.ws_manager import get_ws_manager
from logger import global_logger
from utils.ws_connection import ConnectionManager
from utils.ws_message_processor import (
    handle_guest_reconnect,
    handle_mc_reconnect,
    handle_player_reconnect,
    is_allowed_by_role,
    send_initial_snapshot,
)
from utils.ws_round_handlers import persist_round_state, prepare_round_ui_payload

LOUD_MESSAGE_TYPES = {"buzz", "vd_player_power", "answer", "player_answer"}
LOUD_BROADCAST_TYPES = {"buzz", "vd_player_power", "answer", "player_answer", "buzzer_winner", "blocked_buzz"}


async def websocket_endpoint_handler(
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
    user_code = user_info["user_code"]

    if user_role in ("admin", "mc"):
        global_logger.info(
            f"WebSocket authenticated: user={user_code!r} "
            f"role={user_role!r} room={match_code!r}"
        )
    else:
        global_logger.debug(
            f"WebSocket authenticated: user={user_code!r} "
            f"role={user_role!r} room={match_code!r}"
        )

    ws_manager: ConnectionManager = await get_ws_manager()
    await ws_manager.connect(websocket, match_code, user_code=user_code, role=user_role)

    if user_role in ("admin", "player", "mc", "guest"):
        await send_initial_snapshot(ws_manager, websocket, match_code, user_code, user_role)

    await handle_role_reconnect(ws_manager, match_code, user_code, user_role)

    try:
        while True:
            data = await websocket.receive_json()
            await handle_ws_message(
                websocket=websocket,
                ws_manager=ws_manager,
                match_code=match_code,
                user_code=user_code,
                user_role=user_role,
                data=data,
            )
    except WebSocketDisconnect:
        global_logger.debug(f"WebSocket disconnected: {user_code!r} room={match_code!r}")
    except Exception as e:
        global_logger.error(
            f"WebSocket error in room {match_code!r} for {user_code!r}: {e}",
            exc_info=True,
        )
    finally:
        ws_manager.disconnect(websocket, match_code)


async def handle_role_reconnect(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
    user_role: str,
) -> None:
    if user_role == "player":
        await handle_player_reconnect(ws_manager, match_code, user_code)
    elif user_role == "mc":
        await handle_mc_reconnect(ws_manager, match_code, user_code)
    elif user_role == "guest":
        await handle_guest_reconnect(ws_manager, match_code, user_code)


async def handle_ws_message(
    websocket: WebSocket,
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
    user_role: str,
    data: dict,
) -> None:
    msg_type = data.get("type", "")
    if msg_type == "user_online" or "user_code" not in data:
        data["user_code"] = user_code
    data["role"] = user_role

    if not is_allowed_by_role(user_role, msg_type):
        global_logger.warning(
            f"[BP ANSWER SYNC] Blocked {user_role} message: type={msg_type!r} "
            f"user={user_code!r} room={match_code!r}"
        )
        return

    if msg_type == "user_online" and data.get("status") == "heartbeat":
        return

    if msg_type == "request_snapshot":
        await send_initial_snapshot(ws_manager, websocket, match_code, user_code, user_role)
        return

    log_received_message(user_code, user_role, match_code, msg_type, data)
    broadcast_data = await prepare_round_ui_payload(ws_manager, match_code, user_code, msg_type, data)
    await send_ui_payload(ws_manager, match_code, msg_type, broadcast_data)
    await persist_round_state(ws_manager, match_code, user_code, msg_type, broadcast_data)
    await send_reveal_answer_if_needed(ws_manager, match_code, msg_type, broadcast_data)
    log_broadcast_message(match_code, msg_type)


async def send_ui_payload(
    ws_manager: ConnectionManager,
    match_code: str,
    msg_type: str,
    data: dict,
) -> None:
    await ws_manager.broadcast_to_room(match_code, data)


async def send_reveal_answer_if_needed(
    ws_manager: ConnectionManager,
    match_code: str,
    msg_type: str,
    data: dict,
) -> None:
    if msg_type != "send_question":
        return
    question_code = data.get("question_code", "")
    if not question_code:
        return
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


def log_received_message(user_code: str, user_role: str, match_code: str, msg_type: str, data: dict) -> None:
    if msg_type in LOUD_MESSAGE_TYPES:
        global_logger.info(
            f"[BP ANSWER SYNC] Received message from {user_code!r} "
            f"role={user_role!r} in room {match_code!r}: {data}"
        )
    else:
        global_logger.debug(
            f"[BP ANSWER SYNC] Received message from {user_code!r} "
            f"role={user_role!r} in room {match_code!r}: type={msg_type!r}"
        )


def log_broadcast_message(match_code: str, msg_type: str) -> None:
    if msg_type in LOUD_BROADCAST_TYPES:
        global_logger.info(f"[BP ANSWER SYNC] Broadcasted message to room {match_code!r}: type={msg_type!r}")
    else:
        global_logger.debug(f"[BP ANSWER SYNC] Broadcasted message to room {match_code!r}: type={msg_type!r}")
