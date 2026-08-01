
from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


BUZZER_WINNER_KEY_PREFIX = "buzzer_winner:"


BUZZER_WINNER_TTL_SECONDS = 30


def buzzer_winner_key(match_code: str) -> str:
    return f"{BUZZER_WINNER_KEY_PREFIX}{match_code}"


async def get_buzzer_winners(valkey: Valkey, match_code: str) -> dict[str, str]:
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(buzzer_winner_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[buzzer_winners] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}


    return {(_decode(k)): _decode(v) for k, v in raw.items()}


async def set_buzzer_winner(
    valkey: Valkey,
    match_code: str,
    question_code: str,
    user_code: str,
) -> dict[str, str]:
    if not valkey or not match_code or not question_code or not user_code:
        return await get_buzzer_winners(valkey, match_code)

    key = buzzer_winner_key(match_code)
    try:


        await valkey.hsetnx(key, question_code, user_code)


        await valkey.expire(key, BUZZER_WINNER_TTL_SECONDS)
    except Exception as exc:
        global_logger.warning(
            f"[buzzer_winners] HSETNX/EXPIRE failed for match={match_code!r} "
            f"question={question_code!r} user={user_code!r}: {exc}",
            exc_info=True,
        )

    return await get_buzzer_winners(valkey, match_code)


async def clear_buzzer_winners(valkey: Valkey, match_code: str) -> None:
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(buzzer_winner_key(match_code))
        global_logger.debug(
            f"[buzzer_winners] Cleared buzzer winners for match={match_code!r}"
        )
    except Exception as exc:
        global_logger.warning(
            f"[buzzer_winners] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


def _decode(value: Any) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)
