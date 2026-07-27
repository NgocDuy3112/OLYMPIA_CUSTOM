"""Valkey helpers for the Về Đích "buzzer winner" snapshot.

When a player hits the buzzer first in a VĐC/VĐR question, the backend
(`backend/app/core/answer.py` `post_answer_to_db`) publishes a
``buzzer_winner`` WS event so every client can show the lightning icon on
the winner's card. That state is otherwise lost on player reconnect — a
fresh browser tab / refresh would clear the player page's
``buzzerWinnerCode`` state and the Zap icon (rendered in
``frontend/src/components/player/PPlayerRec.tsx``) would disappear.

To keep the icon alive across reconnects, we mirror the
``vedich:powers:{match_code}`` snapshot pattern from
``utils/ve_dich_powers.py`` and store a per-match HASH keyed by
``question_code`` → ``user_code``. The player reconnect handler
(``handle_player_reconnect`` in ``utils/ws_message_processor.py``)
re-broadcasts every entry as a fresh ``buzzer_winner`` event, and the
player-side dedupe on ``lastBuzzerQuestionRef`` keeps this idempotent.

Key format
----------
``buzzer_winner:{match_code}``  →  HASH { question_code: user_code }

TTL backstop
------------
Each HSET gets ``ex=600`` (10 minutes) as a backstop. The primary
clear path is server-side handling of the ``clear_buzz`` event
(``ws_message_processor.apply_buzzer_clear``), so a TTL is only needed
if the admin tab dies mid-question without sending ``clear_buzz``.

Why per-match HASH (not per-(match, question) string)?
-----------------------------------------------------
Atomic ``HGETALL`` for snapshot, atomic ``DEL`` for clear, no SCAN
needed. Matches the storage shape used by ``ve_dich_powers.py``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


BUZZER_WINNER_KEY_PREFIX = "buzzer_winner:"

# 10 minutes — generous for a single question's lifecycle. The primary
# clear path is the server-side ``clear_buzz`` handler, so a longer TTL
# only matters if the admin tab dies without ever sending ``clear_buzz``.
BUZZER_WINNER_TTL_SECONDS = 600


def buzzer_winner_key(match_code: str) -> str:
    """Return the Valkey HASH key for the given match."""
    return f"{BUZZER_WINNER_KEY_PREFIX}{match_code}"


async def get_buzzer_winners(valkey: Valkey, match_code: str) -> dict[str, str]:
    """Return the ``{question_code: user_code}`` map for a match.

    Empty dict means nobody has buzzed (yet) in this match. Values are
    user_codes (validated by the caller — typically a small set of
    connected players), so we do not need a per-value whitelist the way
    ``ve_dich_powers.get_used_powers`` does.
    """
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(buzzer_winner_key(match_code))
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[buzzer_winners] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}
    # Valkey's HGETALL returns bytes in some client configurations and
    # str in others — normalise so callers can use string keys directly.
    return {(_decode(k)): _decode(v) for k, v in raw.items()}


async def set_buzzer_winner(
    valkey: Valkey,
    match_code: str,
    question_code: str,
    user_code: str,
) -> dict[str, str]:
    """Record the buzzer winner for a question and return the full map.

    Idempotent: ``HSETNX`` only writes if the question_code field is
    missing, so a duplicate POST (e.g. a player double-tapping the buzz
    button) cannot overwrite the original winner. The TTL is refreshed
    on every write so the HASH does not vanish mid-question if the
    round has been running for a long time.
    """
    if not valkey or not match_code or not question_code or not user_code:
        return await get_buzzer_winners(valkey, match_code)

    key = buzzer_winner_key(match_code)
    try:
        # HSETNX keeps the first winner authoritative even if a second
        # POST for the same question arrives later.
        await valkey.hsetnx(key, question_code, user_code)
        # Refresh the TTL so an admin who leaves the tab open past the
        # previous TTL does not lose recovery state mid-round.
        await valkey.expire(key, BUZZER_WINNER_TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[buzzer_winners] HSETNX/EXPIRE failed for match={match_code!r} "
            f"question={question_code!r} user={user_code!r}: {exc}",
            exc_info=True,
        )

    return await get_buzzer_winners(valkey, match_code)


async def clear_buzzer_winners(valkey: Valkey, match_code: str) -> None:
    """Delete the per-match buzzer-winner HASH.

    Called from the server-side ``clear_buzz`` handler so that the next
    ``buzzer_winner`` reconnect snapshot starts from a clean slate. The
    HASH is also TTL-bounded, so a missed call is recoverable.
    """
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(buzzer_winner_key(match_code))
        global_logger.debug(
            f"[buzzer_winners] Cleared buzzer winners for match={match_code!r}"
        )
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[buzzer_winners] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


def _decode(value: Any) -> str:
    """Best-effort decode for Valkey return values (bytes or str)."""
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)
