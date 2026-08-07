from utils.round_snapshot import apply_round_snapshot
from utils.ws_connection import ConnectionManager
from utils.ws_message_processor import (
    apply_buzzer_clear,
    apply_gm_admin_state,
    apply_gm_hint_store,
    apply_gm_player_state,
    apply_vedich_power_gating,
    apply_vedich_turn_player,
)


async def prepare_round_ui_payload(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
    msg_type: str,
    data: dict,
) -> dict:
    if msg_type == "vd_power_window_open":
        return await apply_vedich_power_gating(ws_manager, match_code, user_code, data)
    return data


async def persist_round_state(
    ws_manager: ConnectionManager,
    match_code: str,
    user_code: str,
    msg_type: str,
    data: dict,
) -> None:
    persisted_data = await apply_vedich_turn_player(ws_manager, match_code, data)
    if msg_type != "vd_power_window_open":
        persisted_data = await apply_vedich_power_gating(ws_manager, match_code, user_code, persisted_data)
    persisted_data = await apply_buzzer_clear(ws_manager, match_code, persisted_data)
    persisted_data = await apply_giai_ma_state(ws_manager, match_code, persisted_data)
    await apply_round_snapshot(ws_manager.valkey, match_code, persisted_data)


async def apply_giai_ma_state(
    ws_manager: ConnectionManager,
    match_code: str,
    data: dict,
) -> dict:
    persisted_data = await apply_gm_hint_store(ws_manager, match_code, data)
    persisted_data = await apply_gm_admin_state(ws_manager, match_code, persisted_data)
    return await apply_gm_player_state(ws_manager, match_code, persisted_data)
