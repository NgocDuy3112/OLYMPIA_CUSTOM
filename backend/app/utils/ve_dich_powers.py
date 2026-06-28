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

from utils.power_lock import (
    POWER_LOCK_TTL_SECONDS,
    release_power_lock,
    try_acquire_power_lock,
)


POWER_KEY_PREFIX = "vedich:powers:"

# 24 hours — generous enough to cover a full match day, short enough
# that a Valkey flush / container restart mid-tournament doesn't leave
# stale power picks behind. We refresh this TTL on every HSETNX so an
# actively-running match never has its power HASH expire mid-round.
POWER_HASH_TTL_SECONDS = 24 * 60 * 60

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
) -> tuple[dict[str, str], bool]:
    """Record a player's power pick and return the updated full map + changed flag.

    Two layers of protection:

      1. **Per-user-per-match Valkey lock** (``vd:power_lock:{match}:{user}``,
         ``SET NX EX`` with ``POWER_LOCK_TTL_SECONDS``) — short-circuits
         duplicate POSTs from a single player (network burst, double-tap,
         page-refresh race). Released in the ``finally`` block on every
         exit path. ``HSETNX`` below is the *correctness* guarantee; this
         lock is just a fast-path that avoids a useless HGETALL → HSETNX
         → HGETALL → publish round-trip on duplicates.

      2. **HSETNX on the powers HASH** — the actual "one power per
         player per match" guarantee. First POST writes, every
         subsequent POST is a no-op, so the field is locked in forever
         (until admin explicitly clears it).

    The HASH TTL is refreshed on every successful write so an actively
    running match can't have its powers forgotten mid-round.

    Returns ``(used_powers_map, changed)`` where ``changed`` is True
    iff this call actually wrote a new entry (i.e. the player had no
    power before). Callers can use ``changed`` to decide whether to
    broadcast ``vd_powers_used`` — for duplicates it's wasted bandwidth.
    """
    if not valkey or not match_code or not user_code:
        return await get_used_powers(valkey, match_code), False
    if power not in VALID_POWERS:
        global_logger.warning(
            f"[ve_dich_powers] Ignoring set_used_power with invalid power={power!r} "
            f"match={match_code!r} user={user_code!r}",
        )
        return await get_used_powers(valkey, match_code), False

    # Layer 1: per-user lock. Fast-path early-return on duplicates.
    lock_token = await try_acquire_power_lock(valkey, match_code, user_code)
    if lock_token is None:
        # Another pick from the same user is already in flight (network
        # burst, double-tap, etc.). Return current map with changed=False
        # so the caller skips the ``vd_powers_used`` broadcast — the
        # in-flight call will publish the authoritative state when it
        # finishes. HSETNX below would have done the right thing anyway,
        # but skipping the publish saves a round-trip to every client.
        global_logger.debug(
            f"[ve_dich_powers] Skipping concurrent vd_player_power for "
            f"match={match_code!r} user={user_code!r} (lock held)"
        )
        return await get_used_powers(valkey, match_code), False

    changed = False
    try:
        key = powers_key(match_code)
        try:
            # Layer 2: HSETNX is the correctness guarantee. Even if the
            # lock above somehow let two writers through (e.g. lock
            # TTL expired mid-call), only the first HSETNX wins.
            changed = await valkey.hsetnx(key, user_code, power)
            if changed:
                # Refresh TTL on the HASH so an actively running match
                # can't have its powers forgotten mid-round. Only set
                # the TTL when we actually wrote — a no-op HSETNX means
                # the HASH already existed with a fresh TTL from a
                # previous write, no need to refresh.
                try:
                    await valkey.expire(key, POWER_HASH_TTL_SECONDS)
                except Exception as exc:  # noqa: BLE001
                    global_logger.warning(
                        f"[ve_dich_powers] EXPIRE failed for match={match_code!r}: {exc}",
                        exc_info=True,
                    )
        except Exception as exc:  # noqa: BLE001
            global_logger.warning(
                f"[ve_dich_powers] HSET failed for match={match_code!r} "
                f"user={user_code!r}: {exc}",
                exc_info=True,
            )

        return await get_used_powers(valkey, match_code), changed
    finally:
        # Always release the lock — even on Valkey error — so a crashed
        # path doesn't lock the player out for the full TTL. The Lua
        # release script is a no-op if the TTL already expired or the
        # lock was stolen, so this is safe to call unconditionally.
        await release_power_lock(valkey, match_code, user_code, lock_token)


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
