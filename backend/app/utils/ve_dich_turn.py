"""Valkey helpers for the Về Đích Riêng "turn player" (current contestant).

VDR has a per-round rule: only the contestant the admin picked on
``AVeDichPickQuestionPage`` may use a Quyền năng during the 5-second
power window. The pick is sent over WS as ``vd_questions_selected
{ selected_player_code }``; the backend stores the value here so the
``vd_power_window_open`` rewrite (``ws_message_processor.apply_vedich_power_gating``)
can filter ``eligible_user_codes`` down to a single player.

Key format
----------
``vedich:turn:{match_code}``  →  STRING <user_code> | empty

Why a STRING (not HASH)?
------------------------
There's exactly one turn player per VDR round. A STRING is cheaper to
write, read, and delete than a single-field HASH, and avoids HSET-vs-GET
semantics confusion.

Why not store this only in admin's React state?
-----------------------------------------------
A malicious or stale admin tab (e.g. refreshed mid-question, network
hiccup) could broadcast ``vd_power_window_open`` without the current
turn player, opening the power window to every connected player. By
storing the turn player server-side we get a single source of truth
that survives admin reconnects and is independent of any admin-side
state hydration lag.

Why no TTL?
-----------
The turn player is cleared by ``clear_turn_player`` on
``round_end`` / ``round_start`` / ``clear_question``. If the admin tab
crashes mid-round the value stays put; the worst case is the next
``round_start`` overwrites it with the new pick (or clears it).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from logger import global_logger

if TYPE_CHECKING:
    from valkey.asyncio import Valkey


TURN_KEY_PREFIX = "vedich:turn:"


def turn_key(match_code: str) -> str:
    """Return the Valkey STRING key holding the VDR turn player for ``match_code``."""
    return f"{TURN_KEY_PREFIX}{match_code}"


def _decode(value: object) -> str | None:
    """Best-effort decode for Valkey STRING return values (bytes | str | None)."""
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)


async def set_turn_player(valkey: Valkey, match_code: str, user_code: str | None) -> None:
    """Record the VDR turn player for ``match_code``.

    Pass ``user_code=None`` (or empty string) to clear the slot. We
    use ``DEL`` instead of ``SET ""`` so subsequent ``get_turn_player``
    returns ``None`` (distinguishable from an empty value).
    """
    if not valkey or not match_code:
        return
    if not user_code:
        await clear_turn_player(valkey, match_code)
        return
    try:
        await valkey.set(turn_key(match_code), user_code)
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[ve_dich_turn] SET failed for match={match_code!r}: {exc}",
            exc_info=True,
        )


async def get_turn_player(valkey: Valkey, match_code: str) -> str | None:
    """Return the VDR turn ``user_code`` for ``match_code`` or ``None``.

    ``None`` means either the round hasn't started yet, the admin
    hasn't picked a contestant, or the pick was cleared on
    ``round_end``. Either way the power-window filter should fall back
    to "no eligible players" rather than "everyone connected".
    """
    if not valkey or not match_code:
        return None
    try:
        raw = await valkey.get(turn_key(match_code))
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[ve_dich_turn] GET failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
        return None
    value = _decode(raw)
    return value or None


async def clear_turn_player(valkey: Valkey, match_code: str) -> None:
    """Delete the VDR turn player key. Idempotent."""
    if not valkey or not match_code:
        return
    try:
        await valkey.delete(turn_key(match_code))
    except Exception as exc:  # noqa: BLE001
        global_logger.warning(
            f"[ve_dich_turn] DEL failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
