
from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:


    from valkey.asyncio import Valkey

from utils.power_lock import (
    POWER_LOCK_TTL_SECONDS,
    release_power_lock,
    try_acquire_power_lock,
)


POWER_KEY_PREFIX = "vedich:powers:"


POWER_HASH_TTL_SECONDS = 24 * 60 * 60

VALID_POWERS = ("star", "shield")


def powers_key(match_code: str) -> str:
    return f"{POWER_KEY_PREFIX}{match_code}"


async def get_used_powers(valkey: Valkey, match_code: str) -> dict[str, str]:
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(powers_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_powers] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}

    cleaned: dict[str, str] = {}
    for user_code, power in raw.items():
        if power in VALID_POWERS:
            cleaned[user_code] = power
    return cleaned


async def set_used_power(
    valkey: Valkey,
    match_code: str,
    user_code: str,
    power: str,
) -> tuple[dict[str, str], bool]:
    if not valkey or not match_code or not user_code:
        return await get_used_powers(valkey, match_code), False
    if power not in VALID_POWERS:
        global_logger.warning(
            f"[ve_dich_powers] Ignoring set_used_power with invalid power={power!r} "
            f"match={match_code!r} user={user_code!r}",
        )
        return await get_used_powers(valkey, match_code), False


    lock_token = await try_acquire_power_lock(valkey, match_code, user_code)
    if lock_token is None:


        global_logger.debug(
            f"[ve_dich_powers] Skipping concurrent vd_player_power for "
            f"match={match_code!r} user={user_code!r} (lock held)"
        )
        return await get_used_powers(valkey, match_code), False

    changed = False
    try:
        key = powers_key(match_code)
        try:


            changed = await valkey.hsetnx(key, user_code, power)
            if changed:


                try:
                    await valkey.expire(key, POWER_HASH_TTL_SECONDS)
                except Exception as exc:
                    global_logger.warning(
                        f"[ve_dich_powers] EXPIRE failed for match={match_code!r}: {exc}",
                        exc_info=True,
                    )
        except Exception as exc:
            global_logger.warning(
                f"[ve_dich_powers] HSET failed for match={match_code!r} "
                f"user={user_code!r}: {exc}",
                exc_info=True,
            )

        return await get_used_powers(valkey, match_code), changed
    finally:


        await release_power_lock(valkey, match_code, user_code, lock_token)


def compute_eligible_user_codes(
    candidate_user_codes: list[str],
    used_powers: dict[str, str],
) -> list[str]:
    return [code for code in candidate_user_codes if code not in used_powers]
