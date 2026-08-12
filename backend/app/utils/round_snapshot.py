from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


ROUND_SNAPSHOT_KEY_PREFIX = "round:snapshot:"
ROUND_SNAPSHOT_TTL_SECONDS = 10800

SIMPLE_FIELDS = {
    "send_question": "current_question",
    "start_the_timer": "timer",
    "send_answers_to_players": "answers",
    "send_keyword_answers": "keyword_answers",
    "send_keyword_info": "keyword_info",
    "vd_selection_update": "vd_selection_update",
    "keyword_clues_locked": "keyword_clues_locked",
    "reveal_keyword_answer": "keyword_answer",
    "media_control": "video",
}

REPLAY_ORDER = [
    "vd_selected_chung",
    "vd_selected_rieng",
    "vdc_meta",
    "vdr_meta",
    "vdc_question_states",
    "vdr_question_states",
    "current_question",
    "timer",
    "video",
    "answers",
    "vd_selection_update",
    "keyword_info",
    "keyword_clues_locked",
    "keyword_answers",
    "keyword_answer",
]

CLEAR_FIELDS = [
    "current_question",
    "timer",
    "video",
    "answers",
    "vd_selection_update",
    "keyword_answers",
    "keyword_info",
    "keyword_clues_locked",
    "keyword_answer",
]


def round_snapshot_key(match_code: str) -> str:
    return f"{ROUND_SNAPSHOT_KEY_PREFIX}{match_code}"


async def apply_round_snapshot(valkey: Valkey, match_code: str, data: dict[str, Any]) -> None:
    if not valkey or not match_code:
        return

    msg_type = data.get("type", "")
    key = round_snapshot_key(match_code)

    try:
        if msg_type == "round_start" or (msg_type == "round_end" and data.get("round") != "gm"):
            await valkey.delete(key)
            return

        if msg_type == "clear_question":
            await valkey.hdel(key, *CLEAR_FIELDS)
            await valkey.expire(key, ROUND_SNAPSHOT_TTL_SECONDS)
            return

        if msg_type == "clear_answers":
            await valkey.hdel(key, "answers", "keyword_answers")
            await valkey.expire(key, ROUND_SNAPSHOT_TTL_SECONDS)
            return

        if msg_type == "vd_questions_selected":
            round_kind = str(data.get("round") or "")
            if round_kind == "chung":
                await _set_field(valkey, key, "vd_selected_chung", data)
            elif round_kind == "rieng":
                await _set_field(valkey, key, "vd_selected_rieng", data)
            return

        if msg_type == "vdc_questions_meta":
            await _set_field(valkey, key, "vdc_meta", data)
            return

        if msg_type == "vdr_questions_meta":
            await _set_field(valkey, key, "vdr_meta", data)
            return

        if msg_type in ("vdc_question_state", "vdr_question_state"):
            field = "vdc_question_states" if msg_type == "vdc_question_state" else "vdr_question_states"
            question_code = data.get("question_code")
            if not question_code:
                return
            states = await _get_field(valkey, key, field)
            if not isinstance(states, dict):
                states = {}
            states[str(question_code)] = data
            await _set_field(valkey, key, field, states)
            return

        field = SIMPLE_FIELDS.get(msg_type)
        if field:
            await _set_field(valkey, key, field, data)
    except Exception as exc:
        global_logger.warning(
            f"[round_snapshot] apply failed match={match_code!r} type={msg_type!r}: {exc}",
            exc_info=True,
        )


async def get_round_snapshot_messages(valkey: Valkey, match_code: str) -> list[dict[str, Any]]:
    if not valkey or not match_code:
        return []

    try:
        raw = await valkey.hgetall(round_snapshot_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[round_snapshot] HGETALL failed match={match_code!r}: {exc}",
            exc_info=True,
        )
        return []

    decoded: dict[str, Any] = {}
    for k, v in raw.items():
        field = _decode(k)
        try:
            decoded[field] = json.loads(_decode(v))
        except (TypeError, ValueError):
            continue

    messages: list[dict[str, Any]] = []
    for field in REPLAY_ORDER:
        value = decoded.get(field)
        if not value:
            continue
        if field in ("vdc_question_states", "vdr_question_states") and isinstance(value, dict):
            messages.extend(m for m in value.values() if isinstance(m, dict))
        elif isinstance(value, dict):
            messages.append(value)
    return messages


async def _set_field(valkey: Valkey, key: str, field: str, value: Any) -> None:
    await valkey.hset(key, field, json.dumps(value, ensure_ascii=False))
    await valkey.expire(key, ROUND_SNAPSHOT_TTL_SECONDS)


async def _get_field(valkey: Valkey, key: str, field: str) -> Any:
    raw = await valkey.hget(key, field)
    if raw is None:
        return None
    try:
        return json.loads(_decode(raw))
    except (TypeError, ValueError):
        return None


def _decode(value: Any) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)
