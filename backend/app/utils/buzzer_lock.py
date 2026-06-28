"""Valkey-backed distributed lock for the Về Đích Riêng "first buzzer" race.

Background
----------
``backend/app/core/answer.py::post_answer_to_db`` previously relied on
``get_first_buzzer`` to decide which player published ``buzzer_winner``.
That query uses ``ORDER BY created_at ASC LIMIT 1`` with no lock, so two
near-simultaneous POSTs from different players can both believe they
are the first buzzer and both publish ``buzzer_winner`` — leaving the
room with two ``buzzer_winner`` events for the same ``question_code``.

The client-side dedupe (``lastBuzzerQuestionRef``) eventually converges
on whichever event arrives last over the Valkey channel, but the order
is not deterministic and depends on network timing.

Lock shape
----------
We use ``SET NX EX`` (set-if-not-exists with TTL) on a per-(match,
question) key. The first POST that successfully claims the key is the
authoritative winner; concurrent POSTs see the key already set and
return immediately without touching the DB.

Key format::

    buzzer_lock:{match_code}:{question_code}  →  <owner_token>

TTL is 10 s — long enough to cover a slow DB commit, short enough that
a crashed backend worker doesn't block the next round forever. Owner
token is a random UUID4 returned by ``SET`` (Valkey's NX mode returns
the token string; non-NX returns nil so the caller knows it lost the
race). We store the token so the winner can release the lock safely
(via the standard ``if GET == token then DEL`` Lua script) without
risking a stale-release of someone else's lock.

Why not use ``buzzer_winner:{match_code}`` HASH directly?
--------------------------------------------------------
We could HSETNX on the same HASH used for the reconnect snapshot, but
that would conflate two semantics:

  * "There IS a winner" (reconnect snapshot — survives until cleared)
  * "A buzz is currently being processed" (lock — ephemeral)

Mixing them means a crashed backend worker during a buzz attempt would
permanently block future buzz attempts until the HASH is cleared. With
a separate lock + TTL, the lock self-heals after 10 s and the snapshot
HASH is only written by the winner.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


BUZZER_LOCK_KEY_PREFIX = "buzzer_lock:"

# 10 seconds — generous for a slow DB commit on a hot match, short enough
# that a crashed worker self-heals before the next buzzer window opens.
# The answering window in VDR is 5 s by default, so a 10 s lock outlives
# the legitimate buzz attempt without blocking legitimate retries.
BUZZER_LOCK_TTL_SECONDS = 10


def buzzer_lock_key(match_code: str, question_code: str) -> str:
    """Return the Valkey lock key for a (match, question) buzzer attempt."""
    return f"{BUZZER_LOCK_KEY_PREFIX}{match_code}:{question_code}"


async def try_acquire_buzzer_lock(
    valkey: Valkey,
    match_code: str,
    question_code: str,
) -> str | None:
    """Atomically claim the buzzer lock for ``(match_code, question_code)``.

    Returns the owner token (a random UUID4 string) on success, or
    ``None`` if another player already holds the lock. The caller must
    pass this token back to :func:`release_buzzer_lock` once the buzz
    attempt completes — successful or not — so the next player can
    retry promptly.
    """
    if not valkey or not match_code or not question_code:
        return None

    key = buzzer_lock_key(match_code, question_code)
    token = uuid.uuid4().hex
    try:
        # ``nx=True`` → only set if missing. ``ex=BUZZER_LOCK_TTL_SECONDS``
        # → auto-expire so a crashed holder doesn't block forever. We pass
        # the token as the value so we can verify ownership before DEL.
        acquired = await valkey.set(
            key,
            token,
            nx=True,
            ex=BUZZER_LOCK_TTL_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 — Valkey must never crash the WS loop
        global_logger.warning(
            f"[buzzer_lock] SET NX failed for match={match_code!r} "
            f"question={question_code!r}: {exc}",
            exc_info=True,
        )
        return None

    if acquired:
        return token
    # NX returned falsy → another player already holds the lock.
    return None


# Lua script for safe release: only DEL if the value still matches our
# token. This prevents the classic distributed-lock bug where a slow
# holder expires, a new holder claims the lock, and the old holder
# then blindly DELs the new holder's lock.
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
    """Release the buzzer lock if we still own it.

    Returns ``True`` if the lock was released by this call, ``False`` if
    the lock had already expired or been taken by someone else (in
    which case we did NOT delete their lock).
    """
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
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[buzzer_lock] release failed for match={match_code!r} "
            f"question={question_code!r}: {exc}",
            exc_info=True,
        )
        return False

    # Valkey returns the integer 1 when DEL ran, 0 when the value
    # didn't match (already expired or stolen). Other client wrappers
    # may return the count as bytes/str; normalise to int.
    try:
        return int(result) == 1
    except (TypeError, ValueError):
        return False
