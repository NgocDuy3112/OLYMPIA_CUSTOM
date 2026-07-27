"""Valkey helpers for the Giải Mã (Decode) per-clue hint snapshot.

When the admin reveals a hint for a clue in the GM phase (a question card
in the 4×2 grid), the event is published to every connected client over
WebSocket. Without server-side persistence, those hint payloads are lost
on player reconnect — a fresh browser tab / refresh would clear the
player page's ``revealedHints`` map and the hint text/media on the
affected clue card would disappear, even though the admin still has it
visible on their tab.

To keep the hint grid alive across reconnects, we mirror the
``buzzer_winner:{match_code}`` snapshot pattern from
``utils/buzzer_winners.py`` and store a per-match HASH keyed by
``clue_index`` → JSON-encoded payload. The player reconnect handler
(``handle_player_reconnect`` in ``utils/ws_message_processor.py``)
re-broadcasts every entry as a fresh ``show_hint`` event with
``clue_index`` populated. Receivers dedupe by ``clue_index`` (the player
page's ``revealedHints`` is a ``Record<number, RevealedHint>`` keyed by
clue index), so multiple replays are idempotent.

Key format
----------
``gm:hints:{match_code}``  →  HASH { clue_index: JSON-encoded payload }

Where ``payload`` is::

    {
        "text": str | None,
        "media_url": str | None,
        "target_players": list[str],
        "shown_at": int  # epoch ms, useful for tie-breaking / audit
    }

TTL backstop
------------
Each HSET gets ``ex=600`` (10 minutes). The primary clear paths are
server-side handling of ``hide_hint`` (per-clue HDEL) and
``clear_question`` / ``round_start`` (full HASH DEL), so the TTL is only
needed if the admin tab dies mid-round without sending the cleanup event.

Why per-match HASH (not per-(match, clue) string)?
--------------------------------------------------
Atomic ``HGETALL`` for snapshot, atomic ``HDEL`` for per-clue hide,
atomic ``DEL`` for full clear. Matches the storage shape used by
``buzzer_winners.py`` and ``ve_dich_powers.py``.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


GM_HINTS_KEY_PREFIX = "gm:hints:"

# 10 minutes — generous for a single GM round's lifecycle. The primary
# clear paths are the server-side ``hide_hint`` / ``clear_question`` /
# ``round_start`` handlers, so a longer TTL only matters if the admin
# tab dies without ever sending any of those cleanup events.
GM_HINTS_TTL_SECONDS = 600


def gm_hints_key(match_code: str) -> str:
    """Return the Valkey HASH key for the given match."""
    return f"{GM_HINTS_KEY_PREFIX}{match_code}"


async def get_hints(valkey: Valkey, match_code: str) -> dict[str, dict[str, Any]]:
    """Return the ``{clue_index: payload}`` map for a match.

    Empty dict means no hints have been revealed (yet) for this match.
    ``clue_index`` is returned as a string per Valkey HASH semantics —
    callers should coerce with ``int(...)`` if they need it as an int.
    Each value is a dict (parsed from the JSON we stored).
    """
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(gm_hints_key(match_code))
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[gm_hints] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}

    out: dict[str, dict[str, Any]] = {}
    for k, v in raw.items():
        key = _decode(k)
        try:
            parsed = json.loads(_decode(v))
        except (TypeError, ValueError) as exc:
            global_logger.warning(
                f"[gm_hints] JSON decode failed for clue={key!r} match={match_code!r}: {exc}",
            )
            continue
        if isinstance(parsed, dict):
            out[key] = parsed
    return out


async def set_hint(
    valkey: Valkey,
    match_code: str,
    clue_index: int,
    text: str | None,
    media_url: str | None,
    target_players: list[str],
    shown_at: int | None = None,
) -> dict[str, dict[str, Any]]:
    """Persist a hint payload and return the full snapshot.

    Idempotent on ``clue_index`` — re-revealing the same clue overwrites
    the prior payload (HSET, not HSETNX), so a refreshed player sees the
    *latest* hint text/media, not a stale one. The TTL is refreshed on
    every write so a long-running round does not lose state mid-game.
    """
    if not valkey or not match_code or not isinstance(clue_index, int):
        return await get_hints(valkey, match_code)

    payload = {
        "text": text or None,
        "media_url": media_url or None,
        "target_players": list(target_players or []),
        "shown_at": int(shown_at) if shown_at is not None else None,
    }
    # Drop None-valued fields so the JSON stays small and the
    # reconstruct-on-replay path doesn't have to deal with explicit nulls
    # when a field was never set.
    payload = {k: v for k, v in payload.items() if v is not None}

    key = gm_hints_key(match_code)
    field = str(clue_index)
    try:
        await valkey.hset(key, field, json.dumps(payload))
        await valkey.expire(key, GM_HINTS_TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_hints] HSET/EXPIRE failed for match={match_code!r} "
            f"clue={clue_index!r}: {exc}",
            exc_info=True,
        )

    return await get_hints(valkey, match_code)


async def clear_hint(
    valkey: Valkey,
    match_code: str,
    clue_index: int,
) -> dict[str, dict[str, Any]]:
    """Delete a single clue's hint from the snapshot.

    Called from the server-side ``hide_hint`` handler so the next
    reconnect replay does not re-show a hint the admin has hidden. The
    HASH itself is also TTL-bounded, so a missed call is recoverable.
    """
    if not valkey or not match_code or not isinstance(clue_index, int):
        return await get_hints(valkey, match_code)

    key = gm_hints_key(match_code)
    field = str(clue_index)
    try:
        await valkey.hdel(key, field)
        global_logger.debug(
            f"[gm_hints] HDEL match={match_code!r} clue={clue_index!r}"
        )
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_hints] HDEL failed for match={match_code!r} "
            f"clue={clue_index!r}: {exc}",
            exc_info=True,
        )

    return await get_hints(valkey, match_code)


async def clear_all_hints(valkey: Valkey, match_code: str) -> None:
    """Delete the per-match hint HASH.

    Called from the server-side ``clear_question`` and ``round_start``
    handlers so the next ``show_hint`` reconnect replay starts from a
    clean slate. The HASH is also TTL-bounded, so a missed call is
    recoverable.
    """
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(gm_hints_key(match_code))
        global_logger.debug(
            f"[gm_hints] Cleared hints for match={match_code!r}"
        )
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_hints] DEL failed for match={match_code!r}: {exc}",
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
