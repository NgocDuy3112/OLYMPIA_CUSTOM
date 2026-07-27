"""Valkey helpers for the Giải Mã admin-state snapshot.

When the admin tab drives the Giải Mã (Decode) round, every action that
changes which clue is active, which hint is revealed, which player has
submitted a keyword, etc. — is currently captured only in React
``useState`` on the admin tab. If the admin refreshes their browser, the
local state resets to defaults and the operator sees a blank round
("nothing happened" symptom) even though the server-side room state
already contains every event the admin had broadcast.

To make the admin tab survive a refresh, every admin-driven WS event is
intercepted here on the WS receive loop and the relevant slice of
admin state is persisted into a per-match HASH. The admin tab re-hydrates
from this snapshot on mount via ``GET /gm/admin-state`` (or via the
``gm_admin_state_snapshot`` event fired on admin (re)connect). Player
and MC tabs do not need the snapshot — they receive their own live
broadcasts — but the snapshot doubles as a debug surface: the admin
state is the canonical "what is the operator's view right now".

Key format
----------
``gm:admin_state:{match_code}``  →  HASH { field: JSON-encoded value }

Where the canonical fields are::

    {
        "clue_states":           ["idle","active","used", ...],  // 8 entries
        "revealed_hints":        {"0": {"text":..., "media_url":...}, ...},
        "active_clue_index":     int | null,
        "current_question":      {question_code, content, media_url} | null,
        "timer":                 int | 0,
        "timer_started_at":      int | 0,
        "total_opened_clues_count": int,
        "keyword_phase_active":  bool,
        "keyword_clues_locked":  bool,
        "keyword_submissions":   {"OC_U001": {"text":..., "timestamp":..., "cluesOpened":...}, ...},
        "keyword_revealed_codes": ["OC_U001", ...],
        "keyword_answer_revealed": bool,
        "keyword_answer":        str | null,
        "keyword_banner":        str,
        "hidden_question_content": bool,
        "is_keyword_timer_running": bool,
        "has_added_keyword_score":  bool,
        "pending_clue_action":   bool,
        "hint_hidden":           bool,
        "correct_clues":         [int, ...],
        "shown_hint_content":    str | null,
    }

TTL backstop
------------
HASH TTL is 600 s (10 minutes), same as ``buzzer_winner`` /
``gm:hints``. The primary clear paths are the server-side intercept of
``round_start`` (full DEL) and ``clear_question`` (also full DEL), so
the TTL is only a backstop for an admin tab that dies mid-round.

Why HASH (not per-field string)?
--------------------------------
Atomic ``HGETALL`` for the full snapshot (one round-trip per admin
mount). Atomic per-field ``HSET`` so each admin WS event only writes
the slice it changes (avoid the round-trip cost of re-serialising the
whole document on every click). Atomic ``DEL`` for the full clear path
on round transition.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


GM_ADMIN_STATE_KEY_PREFIX = "gm:admin_state:"

# 10 minutes — generous for a single GM round's lifecycle. The primary
# clear path is the server-side ``round_start`` / ``clear_question``
# handlers, so a longer TTL only matters if the admin tab dies without
# ever sending any cleanup event.
GM_ADMIN_STATE_TTL_SECONDS = 600


def gm_admin_state_key(match_code: str) -> str:
    """Return the Valkey HASH key for the given match."""
    return f"{GM_ADMIN_STATE_KEY_PREFIX}{match_code}"


async def set_admin_field(
    valkey: Valkey,
    match_code: str,
    field: str,
    value: Any,
) -> None:
    """Persist a single admin-state field to the snapshot HASH.

    No-op if the value is ``None`` — admins sometimes clear optional
    fields (e.g. ``active_clue_index`` when no clue is open), and we
    don't want a stale ``"null"`` JSON string in the HASH. The full
    clear path (``clear_admin_state``) is responsible for removing the
    field instead.
    """
    if not valkey or not match_code or not field:
        return
    if value is None:
        return
    try:
        await valkey.hset(
            gm_admin_state_key(match_code),
            field,
            json.dumps(value, ensure_ascii=False),
        )
        await valkey.expire(gm_admin_state_key(match_code), GM_ADMIN_STATE_TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[gm_admin_state] HSET failed for match={match_code!r} "
            f"field={field!r}: {exc}",
            exc_info=True,
        )


async def get_admin_state(
    valkey: Valkey,
    match_code: str,
) -> dict[str, Any]:
    """Return the full admin-state snapshot as a parsed dict.

    Empty dict means no admin action has happened (yet) for this match
    — the admin tab should treat this as a fresh round (the ``useState``
    defaults already match the empty state). Field values are decoded
    from their JSON storage; corrupt or non-JSON values are skipped
    with a warning rather than crashing the admin mount path.
    """
    if not valkey or not match_code:
        return {}
    try:
        raw = await valkey.hgetall(gm_admin_state_key(match_code))
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_admin_state] HGETALL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return {}

    out: dict[str, Any] = {}
    for k, v in raw.items():
        key = _decode(k)
        try:
            out[key] = json.loads(_decode(v))
        except (TypeError, ValueError) as exc:
            global_logger.warning(
                f"[gm_admin_state] JSON decode failed for "
                f"field={key!r} match={match_code!r}: {exc}",
            )
            continue
    return out


async def clear_admin_state(valkey: Valkey, match_code: str) -> None:
    """Delete the per-match admin-state HASH.

    Called from the server-side intercept of ``round_start`` and
    ``clear_question`` so the next round starts with a clean slate.
    The HASH is also TTL-bounded, so a missed call is recoverable.
    """
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(gm_admin_state_key(match_code))
        global_logger.debug(
            f"[gm_admin_state] Cleared admin state for match={match_code!r}"
        )
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[gm_admin_state] DEL failed for match={match_code!r}: {exc}",
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
