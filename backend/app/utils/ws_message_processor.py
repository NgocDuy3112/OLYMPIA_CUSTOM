from __future__ import annotations

from typing import Any

from logger import global_logger
from utils.buzzer_winners import (
    clear_buzzer_winners,
    get_buzzer_winners,
)
from utils.gm_hints import (
    clear_all_hints as clear_all_gm_hints,
    clear_hint as clear_gm_hint,
    get_hints as get_gm_hints,
    set_hint as set_gm_hint,
)
from utils.gm_admin_state import (
    clear_admin_state,
    get_admin_state,
    set_admin_field,
)
from utils.gm_player_state import (
    clear_all_player_submissions,
    get_player_keyword_submission,
    set_player_keyword_submission,
)
from utils.ve_dich_powers import (
    compute_eligible_user_codes,
    get_used_powers,
    set_used_power,
)
from utils.ve_dich_turn import (
    clear_turn_player as clear_ve_dich_turn_player,
    get_turn_player,
    set_turn_player,
)
from utils.ws_connection import ConnectionManager


PLAYER_ALLOWED_TYPES: frozenset[str] = frozenset({
    "answer",
    "player_answer",
    "buzz",
    "player_heartbeat",
    "player_online",
    "mc_online",
    "request_presence",
    "keyword_submit",
    "vd_player_power",
    "vd_power_window_closed",
    "vd_questions_meta_request",
    "pong_latency",
})

MC_ALLOWED_TYPES: frozenset[str] = frozenset({
    "answer",
    "buzz",
    "mc_online",
    "player_heartbeat",
    "player_online",
    "request_presence",
    "send_question",
    "clear_question",
    "start_the_timer",
    "send_answers_to_players",
    "clear_answers",
    "round_start",
    "round_end",
    "navigate",
    "play_video",
    "pause_video",
    "send_players_info",
    "player_score_updated",
    "player_offline",
    "answering_window_activated",
    "vd_power_activated",
    "vdc_questions_meta",
    "vdc_question_state",
    "vdr_questions_meta",
    "vdr_question_state",
    "vd_questions_selected",
    "vd_selection_update",
    "bp_dung",
    "bp_chon_cau_hoi",
    "wrong",
    "skip",
    "game_end",
    "open_match",
    "end_match",
    "finish_match",
    "show_hint",
    "introduce_players",
    "show_scoreboard",
    "keyword_submit",
    "keyword_locked",
    "buzzer_winner",
    "blocked_buzz",
    "vd_power_window_open",
})


def is_allowed_by_role(user_role: str, msg_type: str) -> bool:
    """Return True if ``user_role`` may broadcast ``msg_type``.

    Admin is unrestricted. Players and MCs are restricted to their
    respective allow-lists.
    """
    if user_role == "player":
        return msg_type in PLAYER_ALLOWED_TYPES
    if user_role == "mc":
        return msg_type in MC_ALLOWED_TYPES
    return True  # admin (or any unknown role treated as unrestricted)


async def handle_player_reconnect(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
) -> None:
    """Re-hydrate state for a reconnecting player.

    Mirrors ``handle_mc_reconnect`` — both delegate the snapshot
    replay to ``_replay_role_state`` so the per-role entry-point
    stays tiny (just picks the right ``*_reconnected`` event name
    and the right subset of snapshot types).

    Sends five messages:
    1. ``player_reconnected`` — asks the admin to re-push current game
       state (timer/question events) so the player doesn't miss anything.
    2. ``vd_powers_used`` — the authoritative Valkey snapshot, so a fresh
       browser tab / cleared localStorage cannot bypass the one-use
       Quyền năng rule. Only sent when somebody has actually used a power.
    3. ``buzzer_winner`` — one event per active question, replayed from
       the ``buzzer_winner:{match_code}`` Valkey HASH so a player who
       refreshes the page mid-question still sees the Zap icon on the
       winner's card. The player-side ``lastBuzzerQuestionRef`` keeps
       the re-broadcast idempotent.
    4. ``show_hint`` × N — the Giải Mã per-clue hint snapshot, so a
       player who refreshes the page mid-round still sees the hint
       text/media on each already-revealed clue card.
    5. ``keyword_submit`` — the reconnecting player's own Giải Mã
       keyword submission (if any), replayed from the per-player
       ``gm:player_state:{match_code}:{user_code}`` HASH so the
       player's textbox stays locked after a refresh.
    """
    await _replay_role_state(
        ws_manager=ws_manager,
        match_code=match_code,
        user_code=user_code,
        event_name="player_reconnected",
        include_powers=True,
        log_prefix="player",
    )

    # 5) Re-hydrate the player's own Giải Mã keyword submission (if
    # any). We re-broadcast the original ``keyword_submit`` event to
    # the room — the player's own handler will see ``user_code ===
    # playerCode`` and flip ``hasSubmittedKeyword`` to true on the
    # client. Without this, a refreshed player tab would lose the
    # "đã nộp Từ khoá" lock and the textbox would re-enable. The
    # other players' ``keyword_submit`` events are NOT replayed here
    # because the per-player broadcast already reaches everyone in
    # the room; if a different player is missing a submission on
    # their tab, their own reconnect will replay it.
    if ws_manager.valkey:
        try:
            submission = await get_player_keyword_submission(
                ws_manager.valkey, match_code, user_code,
            )
            if submission:
                await ws_manager.broadcast_to_room(match_code, {
                    "type": "keyword_submit",
                    "user_code": user_code,
                    "keyword_text": submission.get("keyword_text", ""),
                    "timestamp": submission.get("timestamp", 0),
                    "clues_opened": submission.get("clues_opened"),
                })
                # Demoted to DEBUG — same reasoning as other reconnect
                # replay logs (fires on every player refresh).
                global_logger.debug(
                    f"[WS] Replayed keyword_submit for {user_code!r}"
                )
        except Exception as e:
            global_logger.warning(
                f"[WS] Failed to replay keyword_submit for {user_code!r}: {e}",
                exc_info=True,
            )


async def handle_mc_reconnect(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
) -> None:
    """Re-hydrate state for a reconnecting MC.

    Symmetric to ``handle_player_reconnect``: when an MC's WebSocket
    reconnects (refresh / new tab / network blip), the server asks
    the admin tab to re-push current game state via an ``mc_reconnected``
    event, then replays the same snapshot set the player would see.

    MC does NOT get the ``vd_powers_used`` snapshot — that snapshot is
    only relevant to the player page's "Bạn đã dùng Quyền năng" badge
    (MC renders used powers from the ``vd_player_power`` event stream
    already). Buzzer winner and GM hint snapshots ARE relevant because
    the MC page renders them in operator view.

    Sends three messages:
    1. ``mc_reconnected`` — asks the admin to re-push current game state.
    2. ``buzzer_winner`` × N — see ``handle_player_reconnect``.
    3. ``show_hint`` × N — see ``handle_player_reconnect``.

    MC also receives the live ``vd_powers_used`` if a later round ever
    changes that policy; today the MC tab picks up power state from
    the ``vd_player_power`` broadcast path, so we skip it on reconnect
    to keep the WS loop tight.
    """
    await _replay_role_state(
        ws_manager=ws_manager,
        match_code=match_code,
        user_code=user_code,
        event_name="mc_reconnected",
        include_powers=False,
        log_prefix="mc",
    )


async def _replay_role_state(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
    event_name: str,
    include_powers: bool,
    log_prefix: str,
) -> None:
    """Shared snapshot replay used by player and MC reconnect handlers.

    Splits the per-role entry-point from the snapshot-replay logic so
    we don't have to keep two near-identical copies in sync. The
    snapshot set today is ``buzzer_winner`` + ``gm:hints`` for both
    roles, plus ``vd_powers_used`` for players only.

    All four sub-replays are wrapped in their own try/except — a
    failure in one snapshot MUST NOT block the others (the reconnect
    loop must stay best-effort).
    """
    # 1) Announce the reconnect to the room so the admin can re-push
    # the per-round WS state (question / timer / clue grid / board
    # metadata). The event name carries the role so admin handlers can
    # group with their respective ``*_online`` case if desired.
    try:
        await ws_manager.broadcast_to_room(match_code, {
            "type": event_name,
            "user_code": user_code,
        })
        # Demoted to DEBUG — reconnect happens on every page refresh for
        # every player, so this line fired dozens of times per minute on
        # a busy match. Keep INFO for actual error/warning.
        global_logger.debug(
            f"[WS] {log_prefix!r} reconnected, requesting state: {user_code!r}"
        )
    except Exception as e:
        global_logger.warning(
            f"[WS] Failed to request state for reconnected {log_prefix}: {e}"
        )

    # 2) Re-hydrate the per-player "power already used" cache. Player-only
    # because the badge it backs ("Bạn đã dùng Quyền năng") lives on the
    # player page; MC tab picks up the same state from the live
    # ``vd_player_power`` broadcast path.
    if include_powers:
        try:
            used_powers = await get_used_powers(ws_manager.valkey, match_code) if ws_manager.valkey else {}
            if used_powers:
                await ws_manager.send_to_room_local(match_code, {
                    "type": "vd_powers_used",
                    "used_powers": used_powers,
                })
                # Demoted to DEBUG for the same reason as the reconnect
                # announcement — fires on every player refresh.
                global_logger.debug(
                    f"[WS] Sent vd_powers_used snapshot to {user_code!r}: "
                    f"{list(used_powers.keys())}"
                )
        except Exception as e:
            global_logger.warning(
                f"[WS] Failed to send vd_powers_used snapshot on reconnect: {e}",
                exc_info=True,
            )

    # 3) Re-hydrate the Về Đích buzzer-winner snapshot so the Zap icon
    # (rendered in PPlayerRec.tsx from `isBuzzerWinner` and on the MC
    # operator view) survives a page refresh. Receivers dedupe by
    # ``question_code``.
    try:
        buzzer_winners = await get_buzzer_winners(ws_manager.valkey, match_code) if ws_manager.valkey else {}
        if buzzer_winners:
            for question_code, winner_user_code in buzzer_winners.items():
                await ws_manager.send_to_room_local(match_code, {
                    "type": "buzzer_winner",
                    "user_code": winner_user_code,
                    "match_code": match_code,
                    "question_code": question_code,
                })
            # Demoted to DEBUG — same reasoning as reconnect snapshot.
            global_logger.debug(
                f"[WS] Sent buzzer_winner snapshot to {user_code!r}: "
                f"{list(buzzer_winners.keys())}"
            )
    except Exception as e:
        global_logger.warning(
            f"[WS] Failed to send buzzer_winner snapshot on reconnect: {e}",
            exc_info=True,
        )

    # 4) Re-hydrate the Giải Mã per-clue hint snapshot so a client
    # who refreshes mid-round still sees the hint text/media on each
    # already-revealed clue card. Receivers dedupe by ``clue_index``.
    try:
        gm_hints = await get_gm_hints(ws_manager.valkey, match_code) if ws_manager.valkey else {}
        if gm_hints:
            for clue_index_str, hint_payload in gm_hints.items():
                # Best-effort int coercion: keys come back as strings
                # from HGETALL. Skip (with a warning) anything that
                # cannot be parsed so a corrupt entry cannot crash the
                # reconnect flow.
                try:
                    clue_index_int = int(clue_index_str)
                except (TypeError, ValueError):
                    global_logger.warning(
                        f"[WS] Skipping non-int GM hint key "
                        f"{clue_index_str!r} on reconnect for "
                        f"match={match_code!r}"
                    )
                    continue
                await ws_manager.send_to_room_local(match_code, {
                    "type": "show_hint",
                    "user_code": "",
                    # ``clue_index`` lets receivers key the hint by
                    # clue even if ``activeClueIdxRef`` was lost on
                    # the client (e.g. after a refresh).
                    "clue_index": clue_index_int,
                    "hint_content": hint_payload.get("text", ""),
                    "hint_media_source": hint_payload.get("media_url", ""),
                    "target_players": hint_payload.get("target_players", []),
                })
            # Demoted to DEBUG — same reasoning as reconnect snapshot.
            global_logger.debug(
                f"[WS] Sent GM hint snapshot to {user_code!r}: "
                f"{sorted(gm_hints.keys())}"
            )
    except Exception as e:
        global_logger.warning(
            f"[WS] Failed to send GM hint snapshot on reconnect: {e}",
            exc_info=True,
        )


async def apply_vedich_turn_player(
    ws_manager: ConnectionManager,
    match_code: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Server-side companion for the VDR turn-player pick.

    When admin clicks a contestant on ``AVeDichPickQuestionPage`` (Riêng
    round), the WS receive loop receives a ``vd_questions_selected``
    carrying ``selected_player_code``. We persist that value in Valkey
    under ``vedich:turn:{match_code}`` so the subsequent
    ``vd_power_window_open`` rewrite can filter ``eligible_user_codes``
    to just that one player — instead of the previous behaviour where
    every connected player who hadn't used a power was eligible.

    For VDC (``msg.round == "chung"``), there is no turn player, so we
    DEL the key. For any other event type we leave the key alone.

    Returns the payload unchanged so the WS receive loop still
    broadcasts it as a normal event.
    """
    msg_type = data.get("type", "")

    # Round lifecycle events clear the VDR turn slot so a stale value
    # from a previous round can't leak forward into the next round's
    # power-window filter.
    if msg_type in ("round_start", "round_end", "clear_question"):
        await clear_ve_dich_turn_player(ws_manager.valkey, match_code)
        global_logger.debug(
            f"[VD TURN] VDR turn player cleared on {msg_type!r} "
            f"for match={match_code!r}"
        )
        return data

    if msg_type != "vd_questions_selected":
        return data

    round_kind = data.get("round")
    picked = data.get("selected_player_code")

    # VDR (riêng): store the turn player; None / admin codes are rejected
    # by the admin tab before broadcast (defence-in-depth — we re-check
    # here so a future bug in the admin UI can't bypass the filter).
    if round_kind == "rieng" and picked and not str(picked).startswith("ADMIN"):
        await set_turn_player(ws_manager.valkey, match_code, picked)
        global_logger.info(
            f"[VD TURN] VDR turn player set to {picked!r} for match={match_code!r}"
        )
    else:
        # VDC or VDR with no pick — clear so a stale value from a
        # previous VDR round doesn't leak forward.
        await clear_ve_dich_turn_player(ws_manager.valkey, match_code)
        if round_kind == "rieng":
            global_logger.debug(
                f"[VD TURN] VDR turn player cleared for match={match_code!r} "
                f"(picked={picked!r})"
            )

    return data


async def apply_vedich_power_gating(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Apply server-authoritative Về Đích power gating to an inbound message.

    - ``vd_player_power``: persist the player's pick to the per-match Valkey
      HASH and broadcast the updated ``vd_powers_used`` snapshot so admin
      and MC UI badges stay in sync without admin having to send a
      follow-up message.
    - ``vd_power_window_open``: rewrite the payload to include
      ``eligible_user_codes`` (players who haven't used a power yet),
      ``all_user_codes`` (everyone connected, for admin/MC display), and
      ``used_powers`` (the full map). Player clients only react when their
      own code is in ``eligible_user_codes``.

    Returns the payload to broadcast (unchanged for non-VĐ messages).
    """
    msg_type = data.get("type", "")

    if msg_type == "vd_player_power":
        chosen_power = data.get("power")
        if chosen_power in ("star", "shield"):
            # Power-pick is a contestant action — loud INFO so ops can
            # replay match timeline from logs alone (per the "log only
            # answer/ping" rule).
            global_logger.info(
                f"[VD POWER] Player {user_code!r} picked {chosen_power!r} "
                f"in match={match_code!r}"
            )
            try:
                used_powers, changed = await set_used_power(
                    ws_manager.valkey, match_code, user_code, chosen_power,
                )
            except Exception as exc:
                global_logger.warning(
                    f"[WS] set_used_power failed: {exc}", exc_info=True,
                )
                used_powers, changed = {}, False

            # Broadcast the updated snapshot to everyone so admin and
            # MC UI badges stay in sync without admin having to send
            # a follow-up `vd_powers_used` themselves. Skip the broadcast
            # when ``changed`` is False — a duplicate pick from the same
            # player (network burst, double-tap) didn't actually update
            # the HASH, so re-broadcasting would just spam every client
            # with a no-op render.
            if changed:
                try:
                    await ws_manager.broadcast_to_room(match_code, {
                        "type": "vd_powers_used",
                        "used_powers": used_powers,
                    })
                except Exception as exc:
                    global_logger.warning(
                        f"[WS] Failed to broadcast vd_powers_used after pick: {exc}",
                        exc_info=True,
                    )
            else:
                global_logger.debug(
                    f"[VD POWER] Skipping vd_powers_used broadcast — "
                    f"player {user_code!r} already had a power for "
                    f"match={match_code!r}"
                )
        return data

    if msg_type == "vd_power_window_open":
        # Build the eligible-players list from the authoritative
        # Valkey state, intersected with the currently-connected players
        # in the room. Anyone not on the list will not see the pick UI
        # appear, even if their local cache was wiped.
        #
        # Eligibility = (turn player ∩ connected ∩ not-used-power).
        #   * turn player = the contestant admin picked on
        #     ``AVeDichPickQuestionPage`` (VDR only); VDC has no turn
        #     player so every connected player is candidate.
        #   * connected = currently in this match room
        #     (``manager.user_codes_in_room``)
        #   * not-used-power = not yet in the per-match powers HASH
        #
        # The previous behaviour filtered on connected ∩ not-used, which
        # opened the VDR power window to every player who hadn't used
        # their power. The turn-player filter below fixes that.
        try:
            used_powers = await get_used_powers(ws_manager.valkey, match_code)
        except Exception as exc:
            global_logger.warning(
                f"[WS] get_used_powers failed: {exc}", exc_info=True,
            )
            used_powers = {}

        turn_player = await get_turn_player(ws_manager.valkey, match_code)
        connected_codes = ws_manager.user_codes_in_room(match_code)
        # Restrict the candidate pool to the VDR turn player when one is
        # recorded. ``None`` means "no turn player" — fall back to the
        # full connected set so VDC (which doesn't set a turn player)
        # still works.
        if turn_player is not None:
            candidate_codes = [turn_player]
        else:
            candidate_codes = connected_codes
        eligible = compute_eligible_user_codes(candidate_codes, used_powers)
        # Always include the full connected list for admin/MC so they
        # can show who was skipped (useful for the "đã dùng" badge on
        # player cards). Player clients only react when their own code
        # is in `eligible_user_codes`.
        rewritten = {
            **data,
            "eligible_user_codes": eligible,
            "all_user_codes": connected_codes,
            "turn_player_code": turn_player,
            "used_powers": used_powers,
        }
        # Demoted to DEBUG — vd_power_window_open fires once per question
        # activation (admin-driven), so the volume is low, but it's an
        # admin action, not a contestant action. Keep INFO for the
        # downstream contestant response (vd_player_power).
        global_logger.debug(
            f"[WS] vd_power_window_open in match={match_code!r}: "
            f"turn={turn_player!r} eligible={eligible} used={list(used_powers.keys())}"
        )
        return rewritten

    return data


async def apply_buzzer_clear(
    ws_manager: ConnectionManager,
    match_code: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Server-side companion to the admin's ``clear_buzz`` event.

    Clears the ``buzzer_winner:{match_code}`` Valkey HASH so a player
    who (re)connects right after a round transition does not see a
    stale winner from the previous question. This is the primary
    clear path — the HASH is also TTL-bounded (see
    ``utils/buzzer_winners.py``) as a backstop.

    The admin tab still sends the plain ``clear_buzz`` WS event to
    every other client, so the player-side dedupe in
    ``PVeDichRiengPage.tsx`` (resetting ``buzzerWinnerCode`` and
    ``lastBuzzerQuestionRef``) runs as before. This function only
    touches the server-side state.

    Returns the original payload unchanged so the WS receive loop
    broadcasts it as a normal event.
    """
    if data.get("type") != "clear_buzz":
        return data

    try:
        await clear_buzzer_winners(ws_manager.valkey, match_code)
        global_logger.debug(
            f"[WS] Cleared buzzer winners for match={match_code!r} on clear_buzz"
        )
    except Exception as exc:  # noqa: BLE001 — never let Valkey fail the WS loop
        global_logger.warning(
            f"[WS] clear_buzzer_winners failed for match={match_code!r}: {exc}",
            exc_info=True,
        )
    return data


async def apply_gm_hint_store(
    ws_manager: ConnectionManager,
    match_code: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Server-side companion for Giải Mã per-clue hint persistence.

    Mirrors the ``apply_buzzer_clear`` pattern so the
    ``gm:hints:{match_code}`` Valkey HASH stays in sync with what the
    admin has already shown / hidden. The player reconnect handler
    (``handle_player_reconnect``) reads this HASH to replay every
    currently-visible hint so a refreshed player does not lose state.

    Handles three event types:
    - ``show_hint``: HSET the clue's hint payload (text, media_url,
      target_players, shown_at). Overwrites any prior value for the
      same ``clue_index`` so a refreshed player sees the *latest*
      hint, not a stale one. No-op when ``clue_index`` is missing.
    - ``hide_hint``: HDEL the clue's field so a hidden hint is not
      replayed on reconnect. No-op when ``clue_index`` is missing.
    - ``clear_question`` / ``round_start``: full HASH DEL — the next
      round starts with a clean slate.

    The original payload is returned unchanged so the WS receive loop
    broadcasts it as a normal event. Clients that already key by
    ``clue_index`` (player / MC pages) benefit immediately; clients
    that don't yet (older builds) keep working — the ``clue_index``
    field is additive, not breaking.
    """
    msg_type = data.get("type", "")

    if msg_type == "show_hint":
        try:
            clue_index_raw = data.get("clue_index")
            clue_index = int(clue_index_raw) if clue_index_raw is not None else None
        except (TypeError, ValueError):
            clue_index = None

        if clue_index is None:
            # Legacy shape (no clue_index) — admin is broadcasting a
            # hint for the currently-active clue. We still want to
            # capture the hint in the snapshot so a refreshed player
            # sees it, but we cannot key by clue_index. Skip the
            # snapshot in that case rather than corrupt the HASH with
            # a string field.
            global_logger.debug(
                "[WS] apply_gm_hint_store: show_hint without clue_index — "
                "skipping snapshot (legacy hint)"
            )
            return data

        try:
            await set_gm_hint(
                ws_manager.valkey,
                match_code,
                clue_index,
                text=data.get("hint_content") or None,
                media_url=data.get("hint_media_source") or None,
                target_players=list(data.get("target_players") or []),
                shown_at=None,
            )
        except Exception as exc:  # noqa: BLE001
            global_logger.warning(
                f"[WS] set_gm_hint failed for match={match_code!r} "
                f"clue={clue_index!r}: {exc}",
                exc_info=True,
            )
        return data

    if msg_type == "hide_hint":
        try:
            clue_index_raw = data.get("clue_index")
            clue_index = int(clue_index_raw) if clue_index_raw is not None else None
        except (TypeError, ValueError):
            clue_index = None

        if clue_index is None:
            return data

        try:
            await clear_gm_hint(ws_manager.valkey, match_code, clue_index)
        except Exception as exc:  # noqa: BLE001
            global_logger.warning(
                f"[WS] clear_gm_hint failed for match={match_code!r} "
                f"clue={clue_index!r}: {exc}",
                exc_info=True,
            )
        return data

    if msg_type in ("clear_question", "round_start"):
        try:
            await clear_all_gm_hints(ws_manager.valkey, match_code)
        except Exception as exc:  # noqa: BLE001
            global_logger.warning(
                f"[WS] clear_all_gm_hints failed for match={match_code!r}: {exc}",
                exc_info=True,
            )
        return data

    return data


async def apply_gm_admin_state(
    ws_manager: ConnectionManager,
    match_code: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Server-authoritative snapshot of the Giải Mã admin-tab state.

    Every admin-driven WS event in the GM phase carries the slice of
    state it changes. We persist that slice into ``gm:admin_state:{match_code}``
    so a refreshed admin tab can re-hydrate via
    ``GET /gm/admin-state`` on mount (see ``backend/app/routes/gm.py``).
    Without this, a tab refresh resets every ``useState`` to its
    default and the operator sees a blank round even though the
    server-side room state already has every event the admin had
    broadcast.

    Intercepts (admin-only — the role filter in
    ``MC_ALLOWED_TYPES`` already gates non-admin sends of these events,
    so a player/MC accidentally sending them is a no-op upstream of us):

    - ``send_question`` — captures ``active_clue_index`` (0-based),
      ``current_question`` (code + content + media_url), and replaces
      ``clue_states[idx]`` with ``"active"`` while turning any
      previously ``"active"`` slot into ``"used"``. Increments
      ``total_opened_clues_count`` only when the slot was previously
      ``"idle"`` (mirrors the admin handler logic in
      ``AGiaiMaPage.handleRevealClue``).

    - ``show_hint`` — captures ``revealed_hints[idx]`` (text + media_url).
      The ``clue_states[idx]`` transitions to ``"used"`` (mirror of the
      per-clue / bulk-reveal admin handler).

    - ``hide_hint`` — removes ``revealed_hints[idx]``.

    - ``start_the_timer`` — captures ``timer``, ``timer_started_at``,
      and the boolean ``is_keyword_timer_running`` derived from
      ``phase == "gm_keyword"``.

    - ``keyword_locked`` — captures ``keyword_phase_active = True`` (the
      admin UI flips it on when the keyword timer expires or all
      players submit; the persisted snapshot replays the locked state).

    - ``keyword_clues_locked`` — captures ``keyword_clues_locked = True``.

    - ``keyword_submit`` — captures ``keyword_submissions[user_code]``.

    - ``send_keyword_answers`` — captures ``keyword_revealed_codes``.

    - ``reveal_keyword_answer`` — captures ``keyword_answer_revealed = True``,
      ``keyword_answer``, ``keyword_banner``.

    - ``send_keyword_info`` — captures ``keyword_banner``.

    - ``round_start`` / ``clear_question`` — full DEL (handled in
      ``apply_gm_hint_store`` above via the early-return path; same key
      family).

    The original payload is returned unchanged so the WS receive loop
    broadcasts it as a normal event. Clients that don't yet call
    ``GET /gm/admin-state`` continue to work — the snapshot is purely
    additive.
    """
    msg_type = data.get("type", "")
    valkey = ws_manager.valkey

    # Common early-out: no Valkey means we can't persist anything; just
    # pass the payload through. The admin's local ``useState`` will
    # still work for the current session.
    if not valkey:
        return data

    try:
        if msg_type == "send_question":
            # 0-based clue index from trailing digits of question_code
            # (matches the player-side extraction in useQuestionState.ts).
            code = str(data.get("question_code") or "")
            m = code.split("_")[-1] if code else ""
            try:
                idx = int(m) - 1
            except ValueError:
                idx = None

            if idx is not None and 0 <= idx < 8:
                await set_admin_field(valkey, match_code, "active_clue_index", idx)
                # Read previous state to compute the next clue_states
                # array (idle → active, previously-active → used). HGETALL
                # is the only atomic way to read-then-write without a
                # WATCH/MULTI block; the volume per round is tiny so the
                # round-trip cost is negligible.
                prev = await get_admin_state(valkey, match_code)
                prev_states = prev.get("clue_states") or ["idle"] * 8
                if not isinstance(prev_states, list) or len(prev_states) != 8:
                    prev_states = ["idle"] * 8
                next_states = [
                    ("active" if i == idx else ("used" if s == "active" else s))
                    for i, s in enumerate(prev_states)
                ]
                await set_admin_field(valkey, match_code, "clue_states", next_states)
                if prev_states[idx] == "idle":
                    prev_total = int(prev.get("total_opened_clues_count") or 0)
                    await set_admin_field(
                        valkey, match_code, "total_opened_clues_count", prev_total + 1
                    )
                # Capture current question so the admin tab re-hydrates
                # the right QuestionBoard content on refresh.
                await set_admin_field(
                    valkey,
                    match_code,
                    "current_question",
                    {
                        "question_code": code,
                        "content": data.get("content") or "",
                        "media_url": data.get("media_source") or None,
                    },
                )
                # Reset per-question hint-showing flag when a new clue opens.
                await set_admin_field(valkey, match_code, "pending_clue_action", True)
                await set_admin_field(valkey, match_code, "hidden_question_content", False)
                await set_admin_field(valkey, match_code, "hint_hidden", False)
                await set_admin_field(valkey, match_code, "shown_hint_content", None)
            return data

        if msg_type == "show_hint":
            try:
                idx = int(data.get("clue_index"))
            except (TypeError, ValueError):
                idx = None
            if idx is not None and 0 <= idx < 8:
                hint_content = data.get("hint_content") or ""
                hint_media = data.get("hint_media_source") or None
                prev = await get_admin_state(valkey, match_code)
                prev_hints = prev.get("revealed_hints") or {}
                if not isinstance(prev_hints, dict):
                    prev_hints = {}
                prev_hints[str(idx)] = {
                    "text": hint_content or None,
                    "media_url": hint_media,
                }
                await set_admin_field(valkey, match_code, "revealed_hints", prev_hints)
                prev_states = prev.get("clue_states") or ["idle"] * 8
                if not isinstance(prev_states, list) or len(prev_states) != 8:
                    prev_states = ["idle"] * 8
                next_states = list(prev_states)
                if next_states[idx] != "used":
                    next_states[idx] = "used"
                await set_admin_field(valkey, match_code, "clue_states", next_states)
                await set_admin_field(valkey, match_code, "hidden_question_content", True)
                await set_admin_field(valkey, match_code, "pending_clue_action", False)
                await set_admin_field(
                    valkey, match_code, "shown_hint_content", hint_content or None
                )
            return data

        if msg_type == "hide_hint":
            try:
                idx = int(data.get("clue_index"))
            except (TypeError, ValueError):
                idx = None
            if idx is not None and 0 <= idx < 8:
                prev = await get_admin_state(valkey, match_code)
                prev_hints = prev.get("revealed_hints") or {}
                if isinstance(prev_hints, dict):
                    prev_hints.pop(str(idx), None)
                await set_admin_field(valkey, match_code, "revealed_hints", prev_hints)
                await set_admin_field(valkey, match_code, "hidden_question_content", True)
                await set_admin_field(valkey, match_code, "hint_hidden", True)
            return data

        if msg_type == "start_the_timer":
            await set_admin_field(valkey, match_code, "timer", int(data.get("time_limit") or 0))
            try:
                await set_admin_field(
                    valkey, match_code, "timer_started_at", int(data.get("started_at") or 0)
                )
            except (TypeError, ValueError):
                pass
            await set_admin_field(
                valkey,
                match_code,
                "is_keyword_timer_running",
                bool(data.get("phase") == "gm_keyword"),
            )
            return data

        if msg_type == "keyword_locked":
            await set_admin_field(valkey, match_code, "keyword_phase_active", True)
            return data

        if msg_type == "keyword_clues_locked":
            await set_admin_field(valkey, match_code, "keyword_clues_locked", True)
            return data

        if msg_type == "keyword_submit":
            user_code = data.get("user_code")
            if user_code:
                prev = await get_admin_state(valkey, match_code)
                prev_subs = prev.get("keyword_submissions") or {}
                if not isinstance(prev_subs, dict):
                    prev_subs = {}
                prev_subs[str(user_code)] = {
                    "text": data.get("keyword_text") or "",
                    "timestamp": int(data.get("timestamp") or 0),
                    "cluesOpened": data.get("clues_opened"),
                }
                await set_admin_field(valkey, match_code, "keyword_submissions", prev_subs)
            return data

        if msg_type == "send_keyword_answers":
            answers = data.get("answers") or []
            if isinstance(answers, list):
                revealed_codes = sorted(
                    {str(a.get("user_code")) for a in answers if a.get("user_code")}
                )
                await set_admin_field(valkey, match_code, "keyword_revealed_codes", revealed_codes)
            return data

        if msg_type == "reveal_keyword_answer":
            await set_admin_field(valkey, match_code, "keyword_answer_revealed", True)
            await set_admin_field(valkey, match_code, "keyword_answer", data.get("answer"))
            await set_admin_field(valkey, match_code, "keyword_banner", data.get("keyword_banner"))
            return data

        if msg_type == "send_keyword_info":
            banner = data.get("banner")
            if banner:
                await set_admin_field(valkey, match_code, "keyword_banner", banner)
            return data

        if msg_type in ("round_start", "clear_question"):
            # Round transition / clear-question wipes the admin-state
            # snapshot so the next round starts with a clean slate.
            # Idempotent — same path is also reachable via the
            # ``apply_gm_hint_store`` companion which clears the
            # ``gm:hints:{match_code}`` HASH. Both companions handle the
            # clear in their own scope; the WS receive loop in
            # ``main.py`` can call them in either order.
            try:
                await clear_admin_state(valkey, match_code)
            except Exception as exc:  # noqa: BLE001
                global_logger.warning(
                    f"[WS] clear_admin_state failed for match={match_code!r}: {exc}",
                    exc_info=True,
                )
            return data

        return data
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[WS] apply_gm_admin_state failed for match={match_code!r} "
            f"type={msg_type!r}: {exc}",
            exc_info=True,
        )
        return data


async def apply_gm_player_state(
    ws_manager: ConnectionManager,
    match_code: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Server-authoritative snapshot of per-player Giải Mã state.

    Today this only persists the player's keyword submission, but the
    pattern is the same as ``apply_gm_admin_state`` — every per-player
    GM event the WS receive loop sees writes the relevant slice to the
    player's per-player HASH so a reconnecting / refreshed player tab
    can re-hydrate via the ``handle_player_reconnect`` replay path.

    Without this, a refreshed player tab would lose the
    ``hasSubmittedKeyword`` flag and the keyword textbox would re-enable
    even though the server already has the submission. The bug:
    ``handleConfirmKeyword`` sets ``hasSubmittedKeyword`` locally and
    the player broadcasts ``keyword_submit`` to the room, but nothing
    in the chain re-derives the flag on a fresh page mount.

    Intercepts:

    - ``keyword_submit`` — persists ``has_submitted_keyword``, the
      submitted text, ``clues_opened``, and ``timestamp`` to the
      per-player HASH. The original payload is returned unchanged so
      the WS receive loop broadcasts it normally; the persistence is
      a side-effect.

    - ``round_start`` / ``clear_question`` — full prefix DEL via
      ``clear_all_player_submissions`` so the next round starts
      fresh. Idempotent with the other GM companions
      (``apply_gm_hint_store`` and ``apply_gm_admin_state``) which
      also DEL their respective keys on these events.

    The original payload is returned unchanged so the WS receive loop
    broadcasts it as a normal event.
    """
    msg_type = data.get("type", "")
    valkey = ws_manager.valkey

    if not valkey:
        return data

    try:
        if msg_type == "keyword_submit":
            user_code = data.get("user_code")
            if not user_code:
                return data
            try:
                clues_opened_int: int | None = (
                    int(data.get("clues_opened"))
                    if data.get("clues_opened") is not None
                    else None
                )
            except (TypeError, ValueError):
                clues_opened_int = None
            try:
                timestamp_int: int | None = (
                    int(data.get("timestamp"))
                    if data.get("timestamp") is not None
                    else None
                )
            except (TypeError, ValueError):
                timestamp_int = None
            await set_player_keyword_submission(
                valkey,
                match_code,
                str(user_code),
                keyword_text=str(data.get("keyword_text") or ""),
                clues_opened=clues_opened_int,
                timestamp=timestamp_int,
                submitted_at=None,
            )
            return data

        if msg_type in ("round_start", "clear_question"):
            try:
                await clear_all_player_submissions(valkey, match_code)
            except Exception as exc:  # noqa: BLE001
                global_logger.warning(
                    f"[WS] clear_all_player_submissions failed for match={match_code!r}: {exc}",
                    exc_info=True,
                )
            return data

        return data
    except Exception as exc:  # noqa: BLE001 — Valkey must never break the WS loop
        global_logger.warning(
            f"[WS] apply_gm_player_state failed for match={match_code!r} "
            f"type={msg_type!r}: {exc}",
            exc_info=True,
        )
        return data