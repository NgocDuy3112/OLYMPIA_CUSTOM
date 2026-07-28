from __future__ import annotations

from typing import Any

from fastapi import WebSocket

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
    "qualifier_standings",
    "send_room_info",
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
    "qualifier_standings",
    "send_room_info",
})


def is_allowed_by_role(user_role: str, msg_type: str) -> bool:
    if user_role == "player":
        return msg_type in PLAYER_ALLOWED_TYPES
    if user_role == "mc":
        return msg_type in MC_ALLOWED_TYPES
    if user_role == "guest":
        return False
    return True


KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY"


async def send_initial_snapshot(
    ws_manager: ConnectionManager,
    websocket: WebSocket,
    match_code: str,
    user_code: str,
    user_role: str,
) -> None:
    from dependencies.postgresql_db import AsyncSessionLocal
    from core.match import get_match_by_match_code_from_db
    from core.scoreboard import get_scoreboard_for_a_match_from_db
    from core.qualifier import get_qualifier_standings
    from core.question import get_question_from_request_from_db

    try:
        async with AsyncSessionLocal() as session:
            try:
                room_resp = await get_match_by_match_code_from_db(match_code, session)
                room_data = room_resp.data if isinstance(room_resp.data, dict) else {}
            except Exception as e:
                global_logger.warning(f"[SNAPSHOT] room fetch failed for {match_code!r}: {e}")
                room_data = {}

            try:
                score_resp = await get_scoreboard_for_a_match_from_db(match_code, session, ws_manager.valkey)
                scoreboard_list = (score_resp.data or {}).get("scoreboard", []) if isinstance(score_resp.data, dict) else []
            except Exception as e:
                global_logger.warning(f"[SNAPSHOT] scoreboard fetch failed for {match_code!r}: {e}")
                scoreboard_list = []

            room_players = room_data.get("players", []) if isinstance(room_data, dict) else []

            try:
                await websocket.send_json({
                    "type": "send_room_info",
                    "match_code": match_code,
                    "match_name": room_data.get("match_name", ""),
                    "match_status": room_data.get("match_status", ""),
                    "players": room_players,
                })
            except Exception as e:
                global_logger.warning(f"[SNAPSHOT] send_room_info failed: {e}")

            try:
                await websocket.send_json({
                    "type": "send_players_info",
                    "players": room_players,
                    "scoreboard": scoreboard_list,
                    "profiles": [
                        {"user_code": p.get("user_code", ""), "user_name": p.get("user_name", "")}
                        for p in room_players
                    ],
                })
            except Exception as e:
                global_logger.warning(f"[SNAPSHOT] send_players_info failed: {e}")

            if match_code.startswith("OC3_VL"):
                try:
                    standings_resp = await get_qualifier_standings(match_code, 1, session, ws_manager.valkey)
                    standings = (standings_resp.data or {}).get("standings", []) if isinstance(standings_resp.data, dict) else []
                    if user_role == "player":
                        standings = [s for s in standings if s.get("user_code") == user_code]
                    await websocket.send_json({
                        "type": "qualifier_standings",
                        "standings": standings,
                    })
                except Exception as e:
                    global_logger.warning(f"[SNAPSHOT] standings fetch failed for {match_code!r}: {e}")

            try:
                kw_resp = await get_question_from_request_from_db(match_code, KEYWORD_QUESTION_CODE, session)
                kw_data = kw_resp.data if isinstance(kw_resp.data, dict) else {}
                kw_answer = kw_data.get("answer", "") if kw_data else ""
                if kw_answer:
                    await websocket.send_json({
                        "type": "send_keyword_info",
                        "banner": _build_keyword_banner(kw_answer),
                    })
            except Exception as e:
                global_logger.warning(f"[SNAPSHOT] keyword fetch failed for {match_code!r}: {e}")
    except Exception as e:
        global_logger.warning(f"[SNAPSHOT] send_initial_snapshot failed for {match_code!r}: {e}", exc_info=True)


def _build_keyword_banner(answer: str) -> str:
    trimmed_len = len(answer.replace(" ", ""))
    no_space = answer.replace(" ", "")
    if no_space.isalpha():
        return f"TỪ KHOÁ GỒM CÓ {trimmed_len} CHỮ CÁI"
    if no_space.isdigit():
        return f"TỪ KHOÁ GỒM CÓ {trimmed_len} CHỮ SỐ"
    return f"TỪ KHOÁ GỒM CÓ {trimmed_len} KÝ TỰ"


async def handle_player_reconnect(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
) -> None:
    await _replay_role_state(
        ws_manager=ws_manager,
        match_code=match_code,
        user_code=user_code,
        event_name="player_reconnected",
        include_powers=True,
        log_prefix="player",
    )


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


    try:
        await ws_manager.broadcast_to_room(match_code, {
            "type": event_name,
            "user_code": user_code,
        })


        global_logger.debug(
            f"[WS] {log_prefix!r} reconnected, requesting state: {user_code!r}"
        )
    except Exception as e:
        global_logger.warning(
            f"[WS] Failed to request state for reconnected {log_prefix}: {e}"
        )


    if include_powers:
        try:
            used_powers = await get_used_powers(ws_manager.valkey, match_code) if ws_manager.valkey else {}
            if used_powers:
                await ws_manager.send_to_room_local(match_code, {
                    "type": "vd_powers_used",
                    "used_powers": used_powers,
                })


                global_logger.debug(
                    f"[WS] Sent vd_powers_used snapshot to {user_code!r}: "
                    f"{list(used_powers.keys())}"
                )
        except Exception as e:
            global_logger.warning(
                f"[WS] Failed to send vd_powers_used snapshot on reconnect: {e}",
                exc_info=True,
            )


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

            global_logger.debug(
                f"[WS] Sent buzzer_winner snapshot to {user_code!r}: "
                f"{list(buzzer_winners.keys())}"
            )
    except Exception as e:
        global_logger.warning(
            f"[WS] Failed to send buzzer_winner snapshot on reconnect: {e}",
            exc_info=True,
        )


    try:
        gm_hints = await get_gm_hints(ws_manager.valkey, match_code) if ws_manager.valkey else {}
        if gm_hints:
            for clue_index_str, hint_payload in gm_hints.items():


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


                    "clue_index": clue_index_int,
                    "hint_content": hint_payload.get("text", ""),
                    "hint_media_source": hint_payload.get("media_url", ""),
                    "target_players": hint_payload.get("target_players", []),
                })

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
    msg_type = data.get("type", "")


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


    if round_kind == "rieng" and picked and not str(picked).startswith("ADMIN"):
        await set_turn_player(ws_manager.valkey, match_code, picked)
        global_logger.info(
            f"[VD TURN] VDR turn player set to {picked!r} for match={match_code!r}"
        )
    else:


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
    msg_type = data.get("type", "")

    if msg_type == "vd_player_power":
        chosen_power = data.get("power")
        if chosen_power in ("star", "shield"):


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


        try:
            used_powers = await get_used_powers(ws_manager.valkey, match_code)
        except Exception as exc:
            global_logger.warning(
                f"[WS] get_used_powers failed: {exc}", exc_info=True,
            )
            used_powers = {}

        turn_player = await get_turn_player(ws_manager.valkey, match_code)
        connected_codes = ws_manager.user_codes_in_room(match_code)


        if turn_player is not None:
            candidate_codes = [turn_player]
        else:
            candidate_codes = connected_codes
        eligible = compute_eligible_user_codes(candidate_codes, used_powers)


        rewritten = {
            **data,
            "eligible_user_codes": eligible,
            "all_user_codes": connected_codes,
            "turn_player_code": turn_player,
            "used_powers": used_powers,
        }


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
    if data.get("type") != "clear_buzz":
        return data

    try:
        await clear_buzzer_winners(ws_manager.valkey, match_code)
        global_logger.debug(
            f"[WS] Cleared buzzer winners for match={match_code!r} on clear_buzz"
        )
    except Exception as exc:
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
    msg_type = data.get("type", "")

    if msg_type == "show_hint":
        try:
            clue_index_raw = data.get("clue_index")
            clue_index = int(clue_index_raw) if clue_index_raw is not None else None
        except (TypeError, ValueError):
            clue_index = None

        if clue_index is None:


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
        except Exception as exc:
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
        except Exception as exc:
            global_logger.warning(
                f"[WS] clear_gm_hint failed for match={match_code!r} "
                f"clue={clue_index!r}: {exc}",
                exc_info=True,
            )
        return data

    if msg_type in ("clear_question", "round_start"):
        try:
            await clear_all_gm_hints(ws_manager.valkey, match_code)
        except Exception as exc:
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
    msg_type = data.get("type", "")
    valkey = ws_manager.valkey


    if not valkey:
        return data

    try:
        if msg_type == "send_question":


            code = str(data.get("question_code") or "")
            m = code.split("_")[-1] if code else ""
            try:
                idx = int(m) - 1
            except ValueError:
                idx = None

            if idx is not None and 0 <= idx < 8:
                await set_admin_field(valkey, match_code, "active_clue_index", idx)


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


            try:
                await clear_admin_state(valkey, match_code)
            except Exception as exc:
                global_logger.warning(
                    f"[WS] clear_admin_state failed for match={match_code!r}: {exc}",
                    exc_info=True,
                )
            return data

        return data
    except Exception as exc:
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
            except Exception as exc:
                global_logger.warning(
                    f"[WS] clear_all_player_submissions failed for match={match_code!r}: {exc}",
                    exc_info=True,
                )
            return data

        return data
    except Exception as exc:
        global_logger.warning(
            f"[WS] apply_gm_player_state failed for match={match_code!r} "
            f"type={msg_type!r}: {exc}",
            exc_info=True,
        )
        return data