
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger
from configs import RedisSettings

if TYPE_CHECKING:
    from redis.asyncio import Redis


GM_ADMIN_STATE_KEY_PREFIX = "gm:admin_state:"


GM_ADMIN_STATE_TTL_SECONDS = RedisSettings().REDIS_STATE_TTL_SECONDS


def gm_admin_state_key(match_code: str) -> str:
    return f"{GM_ADMIN_STATE_KEY_PREFIX}{match_code}"


async def set_admin_field(
    redis: Redis,
    match_code: str,
    field: str,
    value: Any,
) -> None:
    if not redis or not match_code or not field:
        return
    if value is None:
        return
    try:
        await redis.hset(
            gm_admin_state_key(match_code),
            field,
            json.dumps(value, ensure_ascii=False),
        )
        await redis.expire(gm_admin_state_key(match_code), GM_ADMIN_STATE_TTL_SECONDS)
    except Exception as exc:
        global_logger.warning(
            f"[gm_admin_state] HSET failed for match={match_code!r} "
            f"field={field!r}: {exc}",
            exc_info=True,
        )


async def get_admin_state(
    redis: Redis,
    match_code: str,
) -> dict[str, Any]:
    if not redis or not match_code:
        return {}
    try:
        raw = await redis.hgetall(gm_admin_state_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[gm_admin_state] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}

    out: dict[str, Any] = {}
    for k, v in raw.items():
        key = _decode(k)
        try:
            out[key] = json.loads(_decode(v))
        except (TypeError, ValueError) as exc:
            global_logger.warning(
                f"[gm_admin_state] JSON decode failed for "
                f"field={key!r} match={match_code!r}: {exc}",
            )
            continue
    return out


async def clear_admin_state(redis: Redis, match_code: str) -> None:
    if not redis or not match_code:
        return
    try:
        await redis.delete(gm_admin_state_key(match_code))
        global_logger.debug(
            f"[gm_admin_state] Cleared admin state for match={match_code!r}"
        )
    except Exception as exc:
        global_logger.warning(
            f"[gm_admin_state] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


def _decode(value: Any) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)
