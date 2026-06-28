"""Valkey-backed per-user-per-match lock for Về Đích "Quyền năng" picks.

Background
----------
``backend/app/utils/ve_dich_powers.py::set_used_power`` already uses
``HSETNX`` to enforce the "one Quyền năng per player per match" rule:
``HSETNX vedich:powers:{match_code} {user_code} {power}`` is a no-op if
the field is already set, so a duplicate POST cannot overwrite the
original choice.

But ``HSETNX`` is not enough to defend against every race:

  1. **Same-player double-tap**: a player spam-clicks Star then Shield
     within ~50 ms. ``HSETNX`` saves us — only the first one wins.
     This is already handled.

  2. **Cross-player replay**: player A picks Star, then later (after
     admin reopens the window or after a reconnect) player A's client
     sends ``vd_player_power { power: shield }``. ``HSETNX`` saves us
     again — the field still exists. Also handled.

  3. **Network burst / page-refresh race**: player A refreshes mid-click,
     the in-flight ``vd_player_power`` for Star from the OLD tab AND
     a fresh one from the NEW tab both arrive at the backend. The
     first one acquires ``HSETNX``; the second one is a no-op. Same
     outcome.

So why this lock at all?
------------------------
The actual gap is performance + log noise, not correctness. Without a
short lock, every duplicate ``vd_player_power`` still:

  * Reaches the WS receive loop (cost: 1 round-trip from frontend to
    backend, plus role check)
  * Calls ``set_used_power`` → ``HGETALL`` (cost: O(N) hash read)
  * Calls ``HSETNX`` → no-op (still 1 Valkey command)
  * Calls ``HGETALL`` again to build the broadcast payload (another
    O(N) read)
  * Publishes a fresh ``vd_powers_used`` to the entire room (every
    client re-renders the power badge — even though nothing changed)

For a 5-second window on a 4-player round this is fine. For a 50-player
qualifier round or a multi-buzz retry storm it adds up.

This lock short-circuits steps 1–4: if the same user POSTs twice in
quick succession, the second call hits the lock and returns early
without touching the HASH. ``HSETNX`` remains the correctness
guarantee — this lock is just a fast-path.

Why 60-second TTL?
------------------
A legitimate power pick takes <1 s end-to-end. 60 s is comfortably
long enough to cover a slow client + slow DB + network blip, while
short enough that a crashed holder doesn't lock a player out for the
rest of the round. We DEL on success via the same Lua-script token
pattern used in ``buzzer_lock.py``.

Key format
----------
``vd:power_lock:{match_code}:{user_code}``  →  STRING <owner_token>
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


POWER_LOCK_KEY_PREFIX = "vd:power_lock:"

# 60 seconds — comfortably longer than a normal ``vd_player_power``
# round-trip (typically <1 s) so a slow client / slow DB / network blip
# can't expire the lock mid-call. Short enough that a crashed holder
# self-heals within a minute, well before the round ends.
POWER_LOCK_TTL_SECONDS = 60


def power_lock_key(match_code: str, user_code: str) -> str:
    """Return the Valkey lock key for a (match, user) power pick."""
    return f"{POWER_LOCK_KEY_PREFIX}{match_code}:{user_code}"


async def try_acquire_power_lock(
    valkey: Valkey,
    match_code: str,
    user_code: str,
) -> str | None:
    """Atomically claim the power-pick lock for ``(match_code, user_code)``.

    Returns the owner token (UUID4) on success, ``None`` if the same
    user already has a power pick in flight. Caller must pass the
    token back to :func:`release_power_lock` once the HASH write
    completes — success or failure — so the next legitimate retry
    can run promptly.
    """
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
    except Exception as exc:  # noqa: BLE001 — Valkey must never crash the WS loop
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
    """Release the power-pick lock if we still own it.

    Returns ``True`` if the lock was released by this call, ``False``
    if the lock had already expired or been taken by someone else.
    The Lua script prevents the classic distributed-lock bug where a
    slow holder expires and a new holder claims the lock, then the
    old holder blindly DELs the new holder's lock.
    """
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
    except Exception as exc:  # noqa: BLE001
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
