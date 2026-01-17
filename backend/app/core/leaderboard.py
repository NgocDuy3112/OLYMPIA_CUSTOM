from valkey.asyncio import Valkey
import json

from logger import global_logger
from schemas.record import *




async def get_leaderboard_from_valkey(
    match_code: str,
    player_code: str,
    valkey: Valkey,
) -> BaseResponse:
    log_message = f"GET request received to fetch leaderboard for match_code: {match_code} with player_code: {player_code}."
    global_logger.info(log_message)
    try:
        leaderboard_key = f"leaderboard:{match_code}"
        if not await valkey.exists(leaderboard_key):
            log_message = f"No leaderboard found in cache for match_code={match_code} with player_code={player_code}."
            global_logger.warning(log_message)
            return BaseResponse(
                status='error',
                message=log_message,
                exception=HTTPException(status_code=404)
            )
        player_score = await valkey.zscore(leaderboard_key, player_code)
        formatted_data = {
            "match_code": match_code,
            "player_code": player_code,
            "player_score": int(player_score)
        }
        await valkey.publish(channel=match_code, message=json.dumps(formatted_data))
        log_message = f"Fetched leaderboard from cache for match_code={match_code} with player_code={player_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=formatted_data
        )
    except Exception as e:
        log_message = f"Error fetching leaderboard from cache for match_code={match_code} with player_code={player_code}: {str(e)}"
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=e
        )