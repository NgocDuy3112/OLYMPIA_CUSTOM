
from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


TURN_KEY_PREFIX = "vd:turn:"
OLD_TURN_KEY_PREFIX = "vedich:turn:"


def turn_key(match_code: str) -> str:
    return f"{TURN_KEY_PREFIX}{match_code}"


def old_turn_key(match_code: str) -> str:
    return f"{OLD_TURN_KEY_PREFIX}{match_code}"


async def migrate_turn_key(valkey: Valkey, match_code: str) -> None:
    new_key = turn_key(match_code)
    old_key = old_turn_key(match_code)
    if await valkey.exists(new_key) or not await valkey.exists(old_key):
        return
    await valkey.rename(old_key, new_key)


def _decode(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)


async def set_turn_player(valkey: Valkey, match_code: str, user_code: str | None) -> None:
    if not valkey or not match_code:
        return
    if not user_code:
        await clear_turn_player(valkey, match_code)
        return
    try:
        await migrate_turn_key(valkey, match_code)
        await valkey.set(turn_key(match_code), user_code)
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_turn] SET failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


async def get_turn_player(valkey: Valkey, match_code: str) -> str | None:
    if not valkey or not match_code:
        return None
    try:
        await migrate_turn_key(valkey, match_code)
        raw = await valkey.get(turn_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_turn] GET failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return None
    value = _decode(raw)
    return value or None


async def clear_turn_player(valkey: Valkey, match_code: str) -> None:
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(turn_key(match_code), old_turn_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_turn] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
