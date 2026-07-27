
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


GM_PLAYER_STATE_KEY_PREFIX = "gm:player_state:"


GM_PLAYER_STATE_TTL_SECONDS = 600


def gm_player_state_key(match_code: str, user_code: str) -> str:
    return f"{GM_PLAYER_STATE_KEY_PREFIX}{match_code}:{user_code}"


def _match_prefix(match_code: str) -> str:
    return f"{GM_PLAYER_STATE_KEY_PREFIX}{match_code}:"


async def set_player_keyword_submission(
    valkey: Valkey,
    match_code: str,
    user_code: str,
    keyword_text: str,
    clues_opened: int | None,
    timestamp: int | None,
    submitted_at: int | None = None,
) -> None:
    if not valkey or not match_code or not user_code:
        return
    payload: dict[str, Any] = {
        "has_submitted_keyword": True,
        "keyword_text": keyword_text or "",
        "clues_opened": clues_opened,
        "timestamp": timestamp,
    }
    if submitted_at is not None:
        payload["submitted_at"] = int(submitted_at)


    payload = {k: v for k, v in payload.items() if v is not None}

    key = gm_player_state_key(match_code, user_code)
    try:
        await valkey.hset(key, "state", json.dumps(payload, ensure_ascii=False))
        await valkey.expire(key, GM_PLAYER_STATE_TTL_SECONDS)
    except Exception as exc:
        global_logger.warning(
            f"[gm_player_state] HSET failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )


async def get_player_keyword_submission(
    valkey: Valkey,
    match_code: str,
    user_code: str,
) -> dict[str, Any] | None:
    if not valkey or not match_code or not user_code:
        return None
    try:
        raw = await valkey.hget(gm_player_state_key(match_code, user_code), "state")
    except Exception as exc:
        global_logger.warning(
            f"[gm_player_state] HGET failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )
        return None
    if raw is None:
        return None
    try:
        parsed = json.loads(_decode(raw))
    except (TypeError, ValueError) as exc:
        global_logger.warning(
            f"[gm_player_state] JSON decode failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
        )
        return None
    return parsed if isinstance(parsed, dict) else None


async def list_player_submissions(
    valkey: Valkey,
    match_code: str,
) -> dict[str, dict[str, Any]]:
    if not valkey or not match_code:
        return {}
    prefix = _match_prefix(match_code)
    out: dict[str, dict[str, Any]] = {}
    try:

        cursor = 0
        while True:
            cursor, keys = await valkey.scan(cursor=cursor, match=f"{prefix}*", count=100)
            if keys:

                for key in keys:
                    raw = await valkey.hget(_decode(key), "state")
                    if raw is None:
                        continue
                    try:
                        parsed = json.loads(_decode(raw))
                    except (TypeError, ValueError):
                        continue
                    if not isinstance(parsed, dict):
                        continue


                    key_str = _decode(key)
                    user_code = key_str[len(prefix):]
                    out[user_code] = parsed
            if cursor == 0:
                break
    except Exception as exc:
        global_logger.warning(
            f"[gm_player_state] SCAN failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
    return out


async def clear_player_submission(
    valkey: Valkey,
    match_code: str,
    user_code: str,
) -> None:
    if not valkey or not match_code or not user_code:
        return
    try:
        await valkey.delete(gm_player_state_key(match_code, user_code))
    except Exception as exc:
        global_logger.warning(
            f"[gm_player_state] DEL failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )


async def clear_all_player_submissions(valkey: Valkey, match_code: str) -> None:
    if not valkey or not match_code:
        return
    prefix = _match_prefix(match_code)
    try:
        cursor = 0
        while True:
            cursor, keys = await valkey.scan(cursor=cursor, match=f"{prefix}*", count=100)
            if keys:
                await valkey.delete(*[_decode(k) for k in keys])
            if cursor == 0:
                break
        global_logger.debug(
            f"[gm_player_state] Cleared all player submissions for match={match_code!r}"
        )
    except Exception as exc:
        global_logger.warning(
            f"[gm_player_state] clear_all failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


def _decode(value: Any) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)
