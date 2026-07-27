"""Valkey helpers for per-player Giải Mã keyword submission state.

When a player submits their keyword in the GM round, the player page
flips ``hasSubmittedKeyword`` to true and disables the textbox so a
double-submit is impossible. Without server-side persistence, a
refresh of the player's browser resets ``hasSubmittedKeyword`` to false
and the textbox becomes editable again — even though the server-side
room state already has the player's submission. This module makes the
backend the source of truth so a refresh re-hydrates the disabled state
via the existing ``handle_player_reconnect`` replay path.

Key format
----------
``gm:player_state:{match_code}:{user_code}`` → HASH { field: JSON value }

Where the canonical fields are::

    {
        "has_submitted_keyword": true,
        "keyword_text":           "HÒA BÌNH",
        "clues_opened":            3,
        "timestamp":               0,
        "submitted_at":            1718901234567,   // epoch ms
    }

Per-player HASH (not per-round)
------------------------------
The key includes the user_code so each player has their own slot and
``handle_player_reconnect`` only needs to ``HGETALL`` one key to
replay one player's submission. The companion handles round/clear
via ``SCAN``-free ``KEYS gm:player_state:{match_code}:*`` + ``DEL``
on round transition.

TTL backstop
------------
HASH TTL is 600 s (10 minutes), same as the other GM snapshots. The
primary clear path is the server-side intercept of ``round_start`` and
``clear_question`` (full prefix DEL).
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


GM_PLAYER_STATE_KEY_PREFIX = "gm:player_state:"

# 10 minutes — generous for a single GM round's lifecycle. The primary
# clear path is the server-side ``round_start`` / ``clear_question``
# handlers, so a longer TTL only matters if the admin tab dies without
# ever sending any cleanup event.
GM_PLAYER_STATE_TTL_SECONDS = 600


def gm_player_state_key(match_code: str, user_code: str) -> str:
    """Return the per-player Valkey HASH key."""
    return f"{GM_PLAYER_STATE_KEY_PREFIX}{match_code}:{user_code}"


def _match_prefix(match_code: str) -> str:
    """Return the Valkey key prefix for all players in a match."""
    return f"{GM_PLAYER_STATE_KEY_PREFIX}{match_code}:"


async def set_player_keyword_submission(
    valkey: Valkey,
    match_code: str,
    user_code: str,
    keyword_text: str,
    clues_opened: int | None,
    timestamp: int | None,
    submitted_at: int | None = None,
) -> None:
    """Persist a player's keyword submission to their per-player HASH.

    Idempotent — re-submitting overwrites prior fields (the player is
    never supposed to submit twice in practice, but the
    backend persists defensively in case a stale double-submit slips
    through after a refresh).
    """
    if not valkey or not match_code or not user_code:
        return
    payload: dict[str, Any] = {
        "has_submitted_keyword": True,
        "keyword_text": keyword_text or "",
        "clues_opened": clues_opened,
        "timestamp": timestamp,
    }
    if submitted_at is not None:
        payload["submitted_at"] = int(submitted_at)

    # Drop None-valued optional fields so the JSON stays small and the
    # reconstruct-on-replay path doesn't have to deal with explicit nulls.
    payload = {k: v for k, v in payload.items() if v is not None}

    key = gm_player_state_key(match_code, user_code)
    try:
        await valkey.hset(key, "state", json.dumps(payload, ensure_ascii=False))
        await valkey.expire(key, GM_PLAYER_STATE_TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[gm_player_state] HSET failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )


async def get_player_keyword_submission(
    valkey: Valkey,
    match_code: str,
    user_code: str,
) -> dict[str, Any] | None:
    """Return the player's keyword-submission snapshot, or ``None``.

    ``None`` means the player has not yet submitted their keyword for
    the current round (or the round has been cleared and the snapshot
    was DEL'd).
    """
    if not valkey or not match_code or not user_code:
        return None
    try:
        raw = await valkey.hget(gm_player_state_key(match_code, user_code), "state")
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_player_state] HGET failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )
        return None
    if raw is None:
        return None
    try:
        parsed = json.loads(_decode(raw))
    except (TypeError, ValueError) as exc:
        global_logger.warning(
            f"[gm_player_state] JSON decode failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
        )
        return None
    return parsed if isinstance(parsed, dict) else None


async def list_player_submissions(
    valkey: Valkey,
    match_code: str,
) -> dict[str, dict[str, Any]]:
    """Return every player's submission for a match as ``{user_code: payload}``.

    Used by ``handle_player_reconnect`` (single player) and by the
    admin GM page (all players — for the "đã nộp Từ khoá" indicator on
    the player cards). Empty dict means no player has submitted yet.

    Implementation: ``SCAN`` over the per-match key prefix. ``SCAN``
    (not ``KEYS``) is non-blocking — Valkey iterates in cursor pages and
    each round's key count is bounded by the number of connected
    players (typically < 16), so the scan cost is trivial.
    """
    if not valkey or not match_code:
        return {}
    prefix = _match_prefix(match_code)
    out: dict[str, dict[str, Any]] = {}
    try:
        # ``match`` returns (cursor, keys) tuples; iterate until cursor is 0.
        cursor = 0
        while True:
            cursor, keys = await valkey.scan(cursor=cursor, match=f"{prefix}*", count=100)
            if keys:
                # Pipeline-style: fetch the ``state`` field for each key.
                for key in keys:
                    raw = await valkey.hget(_decode(key), "state")
                    if raw is None:
                        continue
                    try:
                        parsed = json.loads(_decode(raw))
                    except (TypeError, ValueError):
                        continue
                    if not isinstance(parsed, dict):
                        continue
                    # Extract user_code from the key (last segment after the
                    # ``:`` separator). The prefix shape is guaranteed by
                    # ``gm_player_state_key`` above.
                    key_str = _decode(key)
                    user_code = key_str[len(prefix):]
                    out[user_code] = parsed
            if cursor == 0:
                break
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_player_state] SCAN failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
    return out


async def clear_player_submission(
    valkey: Valkey,
    match_code: str,
    user_code: str,
) -> None:
    """Delete a single player's submission HASH.

    Reserved for future per-player unlock paths; the current player
    flow clears everything via ``clear_all_player_submissions`` on
    ``round_start`` / ``clear_question``.
    """
    if not valkey or not match_code or not user_code:
        return
    try:
        await valkey.delete(gm_player_state_key(match_code, user_code))
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_player_state] DEL failed for match={match_code!r} "
            f"user={user_code!r}: {exc}",
            exc_info=True,
        )


async def clear_all_player_submissions(valkey: Valkey, match_code: str) -> None:
    """Delete every per-player submission HASH for a match.

    Called from the server-side intercept of ``round_start`` and
    ``clear_question`` so the next round starts with a clean slate.
    Implementation: ``SCAN`` the per-match prefix + ``DEL`` each key.
    """
    if not valkey or not match_code:
        return
    prefix = _match_prefix(match_code)
    try:
        cursor = 0
        while True:
            cursor, keys = await valkey.scan(cursor=cursor, match=f"{prefix}*", count=100)
            if keys:
                await valkey.delete(*[_decode(k) for k in keys])
            if cursor == 0:
                break
        global_logger.debug(
            f"[gm_player_state] Cleared all player submissions for match={match_code!r}"
        )
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_player_state] clear_all failed for match={match_code!r}: {exc}",
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
