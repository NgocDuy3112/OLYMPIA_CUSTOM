
from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from redis.asyncio import Redis


TURN_KEY_PREFIX = "vd:turn:"
OLD_TURN_KEY_PREFIX = "vedich:turn:"


def turn_key(match_code: str) -> str:
    return f"{TURN_KEY_PREFIX}{match_code}"


def old_turn_key(match_code: str) -> str:
    return f"{OLD_TURN_KEY_PREFIX}{match_code}"


async def migrate_turn_key(redis: Redis, match_code: str) -> None:
    new_key = turn_key(match_code)
    old_key = old_turn_key(match_code)
    if await redis.exists(new_key) or not await redis.exists(old_key):
        return
    await redis.rename(old_key, new_key)


def _decode(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)


async def set_turn_player(redis: Redis, match_code: str, user_code: str | None) -> None:
    if not redis or not match_code:
        return
    if not user_code:
        await clear_turn_player(redis, match_code)
        return
    try:
        await migrate_turn_key(redis, match_code)
        await redis.set(turn_key(match_code), user_code)
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_turn] SET failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


async def get_turn_player(redis: Redis, match_code: str) -> str | None:
    if not redis or not match_code:
        return None
    try:
        await migrate_turn_key(redis, match_code)
        raw = await redis.get(turn_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_turn] GET failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return None
    value = _decode(raw)
    return value or None


async def clear_turn_player(redis: Redis, match_code: str) -> None:
    if not redis or not match_code:
        return
    try:
        await redis.delete(turn_key(match_code), old_turn_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_turn] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
