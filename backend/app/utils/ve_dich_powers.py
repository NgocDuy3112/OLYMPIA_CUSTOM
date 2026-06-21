"""Valkey helpers for the Về Đích "Quyền năng" power state.

A player may use at most one Quyền năng (Star or Shield) across both
Về Đích Chung and Về Đích Riêng. The state lives in a single per-match
HASH so it survives reloads, matches the existing per-match localStorage
cache on the frontend, and is cheap to hydrate on player (re)connect.

Key format
----------
``vedich:powers:{match_code}``  →  HASH { user_code: "star" | "shield" }

The frontend already mirrors this map under the localStorage key
``veDich_powers_{match_code}``; the admin broadcasts ``vd_powers_used``
after every power pick so the local cache stays in sync. This module
just makes the backend the source of truth so a fresh browser tab or
cleared cache cannot bypass the one-use rule.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    # Imported only for type hints. The actual client is passed in by the
    # caller (the WS receive loop in main.py), so this module itself has
    # no runtime dependency on the `valkey` package — keeping it cheap to
    # import in tests and any future non-Valkey path.
    from valkey.asyncio import Valkey


POWER_KEY_PREFIX = "vedich:powers:"

VALID_POWERS = ("star", "shield")


def powers_key(match_code: str) -> str:
    """Return the Valkey HASH key for the given match."""
    return f"{POWER_KEY_PREFIX}{match_code}"


async def get_used_powers(valkey: Valkey, match_code: str) -> dict[str, str]:
    """Return the full ``{user_code: power}`` map for a match.

    Empty dict means nobody has used a power yet. We defensively drop
    any value that isn't one of the known powers, so a future schema
    change or a corrupted write cannot poison the eligibility check.
    """
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(powers_key(match_code))
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
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
) -> dict[str, str]:
    """Record a player's power pick and return the updated full map.

    The map is returned so the caller can broadcast ``vd_powers_used``
    without an extra round-trip. Idempotent: re-using the same power is
    a no-op; switching powers after the fact is rejected (we keep the
    first pick to preserve audit history).
    """
    if not valkey or not match_code or not user_code:
        return await get_used_powers(valkey, match_code)
    if power not in VALID_POWERS:
        global_logger.warning(
            f"[ve_dich_powers] Ignoring set_used_power with invalid power={power!r} "
            f"match={match_code!r} user={user_code!r}",
        )
        return await get_used_powers(valkey, match_code)

    key = powers_key(match_code)
    try:
        # HSETNX-style guard: only set if the field is missing. If the
        # player already has a power, we keep the first choice.
        await valkey.hsetnx(key, user_code, power)
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[ve_dich_powers] HSET failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )

    return await get_used_powers(valkey, match_code)


def compute_eligible_user_codes(
    candidate_user_codes: list[str],
    used_powers: dict[str, str],
) -> list[str]:
    """Return the subset of connected players who have NOT used a power yet.

    Order is preserved so the admin/MC UI sees a stable list. Returns
    an empty list when everyone has used their power — the client is
    expected to no-op on an empty list.
    """
    return [code for code in candidate_user_codes if code not in used_powers]
