
from __future__ import annotations

import json
from typing import TYPE_CHECKING

from logger import global_logger
from configs import ValkeySettings

if TYPE_CHECKING:


    from valkey.asyncio import Valkey

from utils.power_lock import (
    POWER_LOCK_TTL_SECONDS,
    release_power_lock,
    try_acquire_power_lock,
)


POWER_KEY_PREFIX = "vd:powers:"
OLD_POWER_KEY_PREFIX = "vedich:powers:"


POWER_HASH_TTL_SECONDS = ValkeySettings().VALKEY_STATE_TTL_SECONDS

VALID_POWERS = ("star", "shield")


def powers_key(match_code: str) -> str:
    return f"{POWER_KEY_PREFIX}{match_code}"


def old_powers_key(match_code: str) -> str:
    return f"{OLD_POWER_KEY_PREFIX}{match_code}"


async def migrate_powers_key(valkey: Valkey, match_code: str) -> None:
    new_key = powers_key(match_code)
    old_key = old_powers_key(match_code)
    if await valkey.exists(new_key) or not await valkey.exists(old_key):
        return
    await valkey.rename(old_key, new_key)


async def get_used_power_records(valkey: Valkey, match_code: str) -> dict[str, dict[str, str | None]]:
    if not valkey or not match_code:
        return {}
    try:
        await migrate_powers_key(valkey, match_code)
        raw = await valkey.hgetall(powers_key(match_code))
    except Exception as exc:
        global_logger.warning(
            f"[ve_dich_powers] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}

    cleaned: dict[str, dict[str, str | None]] = {}
    for user_code, value in raw.items():
        try:
            record = json.loads(value) if isinstance(value, str) else value
        except (TypeError, json.JSONDecodeError):
            record = {"power": value, "question_code": None}
        if isinstance(record, dict) and record.get("power") in VALID_POWERS:
            cleaned[user_code] = {
                "power": record["power"],
                "question_code": record.get("question_code"),
            }
    return cleaned


async def get_used_powers(valkey: Valkey, match_code: str) -> dict[str, str]:
    records = await get_used_power_records(valkey, match_code)
    return {user_code: record["power"] for user_code, record in records.items() if record["power"]}


async def set_used_power(
    valkey: Valkey,
    match_code: str,
    user_code: str,
    power: str,
    question_code: str | None = None,
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
        await migrate_powers_key(valkey, match_code)
        key = powers_key(match_code)
        try:


            value = json.dumps({"power": power, "question_code": question_code}, separators=(",", ":"))
            changed = await valkey.hsetnx(key, user_code, value)
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
