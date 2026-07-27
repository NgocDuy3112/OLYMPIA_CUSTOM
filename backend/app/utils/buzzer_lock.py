
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


BUZZER_LOCK_KEY_PREFIX = "buzzer_lock:"


BUZZER_LOCK_TTL_SECONDS = 10


def buzzer_lock_key(match_code: str, question_code: str) -> str:
    return f"{BUZZER_LOCK_KEY_PREFIX}{match_code}:{question_code}"


async def try_acquire_buzzer_lock(
    valkey: Valkey,
    match_code: str,
    question_code: str,
) -> str | None:
    if not valkey or not match_code or not question_code:
        return None

    key = buzzer_lock_key(match_code, question_code)
    token = uuid.uuid4().hex
    try:


        acquired = await valkey.set(
            key,
            token,
            nx=True,
            ex=BUZZER_LOCK_TTL_SECONDS,
        )
    except Exception as exc:
        global_logger.warning(
            f"[buzzer_lock] SET NX failed for match={match_code!r} "
            f"question={question_code!r}: {exc}",
            exc_info=True,
        )
        return None

    if acquired:
        return token

    return None


_RELEASE_SCRIPT = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
"""


async def release_buzzer_lock(
    valkey: Valkey,
    match_code: str,
    question_code: str,
    token: str,
) -> bool:
    if not valkey or not match_code or not question_code or not token:
        return False

    key = buzzer_lock_key(match_code, question_code)
    try:
        result = await valkey.eval(
            _RELEASE_SCRIPT,
            1,
            key,
            token,
        )
    except Exception as exc:
        global_logger.warning(
            f"[buzzer_lock] release failed for match={match_code!r} "
            f"question={question_code!r}: {exc}",
            exc_info=True,
        )
        return False


    try:
        return int(result) == 1
    except (TypeError, ValueError):
        return False
