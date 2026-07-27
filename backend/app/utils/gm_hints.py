
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


GM_HINTS_KEY_PREFIX = "gm:hints:"


GM_HINTS_TTL_SECONDS = 600


def gm_hints_key(match_code: str) -> str:
    return f"{GM_HINTS_KEY_PREFIX}{match_code}"


async def get_hints(valkey: Valkey, match_code: str) -> dict[str, dict[str, Any]]:
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(gm_hints_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[gm_hints] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}

    out: dict[str, dict[str, Any]] = {}
    for k, v in raw.items():
        key = _decode(k)
        try:
            parsed = json.loads(_decode(v))
        except (TypeError, ValueError) as exc:
            global_logger.warning(
                f"[gm_hints] JSON decode failed for clue={key!r} match={match_code!r}: {exc}",
            )
            continue
        if isinstance(parsed, dict):
            out[key] = parsed
    return out


async def set_hint(
    valkey: Valkey,
    match_code: str,
    clue_index: int,
    text: str | None,
    media_url: str | None,
    target_players: list[str],
    shown_at: int | None = None,
) -> dict[str, dict[str, Any]]:
    if not valkey or not match_code or not isinstance(clue_index, int):
        return await get_hints(valkey, match_code)

    payload = {
        "text": text or None,
        "media_url": media_url or None,
        "target_players": list(target_players or []),
        "shown_at": int(shown_at) if shown_at is not None else None,
    }


    payload = {k: v for k, v in payload.items() if v is not None}

    key = gm_hints_key(match_code)
    field = str(clue_index)
    try:
        await valkey.hset(key, field, json.dumps(payload))
        await valkey.expire(key, GM_HINTS_TTL_SECONDS)
    except Exception as exc:
        global_logger.warning(
            f"[gm_hints] HSET/EXPIRE failed for match={match_code!r} "
            f"clue={clue_index!r}: {exc}",
            exc_info=True,
        )

    return await get_hints(valkey, match_code)


async def clear_hint(
    valkey: Valkey,
    match_code: str,
    clue_index: int,
) -> dict[str, dict[str, Any]]:
    if not valkey or not match_code or not isinstance(clue_index, int):
        return await get_hints(valkey, match_code)

    key = gm_hints_key(match_code)
    field = str(clue_index)
    try:
        await valkey.hdel(key, field)
        global_logger.debug(
            f"[gm_hints] HDEL match={match_code!r} clue={clue_index!r}"
        )
    except Exception as exc:
        global_logger.warning(
            f"[gm_hints] HDEL failed for match={match_code!r} "
            f"clue={clue_index!r}: {exc}",
            exc_info=True,
        )

    return await get_hints(valkey, match_code)


async def clear_all_hints(valkey: Valkey, match_code: str) -> None:
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(gm_hints_key(match_code))
        global_logger.debug(
            f"[gm_hints] Cleared hints for match={match_code!r}"
        )
    except Exception as exc:
        global_logger.warning(
            f"[gm_hints] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


def _decode(value: Any) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)
