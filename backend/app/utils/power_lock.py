
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


POWER_LOCK_KEY_PREFIX = "vd:power_lock:"


POWER_LOCK_TTL_SECONDS = 60


def power_lock_key(match_code: str, user_code: str) -> str:
    return f"{POWER_LOCK_KEY_PREFIX}{match_code}:{user_code}"


async def try_acquire_power_lock(
    valkey: Valkey,
    match_code: str,
    user_code: str,
) -> str | None:
    if not valkey or not match_code or not user_code:
        return None

    key = power_lock_key(match_code, user_code)
    token = uuid.uuid4().hex
    try:
        acquired = await valkey.set(
            key,
            token,
            nx=True,
            ex=POWER_LOCK_TTL_SECONDS,
        )
    except Exception as exc:
        global_logger.warning(
            f"[power_lock] SET NX failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )
        return None

    return token if acquired else None


_RELEASE_SCRIPT = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
"""


async def release_power_lock(
    valkey: Valkey,
    match_code: str,
    user_code: str,
    token: str,
) -> bool:
    if not valkey or not match_code or not user_code or not token:
        return False

    key = power_lock_key(match_code, user_code)
    try:
        result = await valkey.eval(
            _RELEASE_SCRIPT,
            1,
            key,
            token,
        )
    except Exception as exc:
        global_logger.warning(
            f"[power_lock] release failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )
        return False

    try:
        return int(result) == 1
    except (TypeError, ValueError):
        return False
