from valkey import Valkey as ValkeyCache

from logger import global_logger
from models.record import Record
from models.user import User, RoleEnum
from models.question import Question
from models.match import Match
from schemas.record import *




async def get_leaderboard_from_cache(
    match_code: str,
    cache: ValkeyCache
) -> BaseResponse:
    log_message = f"GET request received to fetch leaderboard for match_code: {match_code}."
    global_logger.info(log_message)
    try:
        leaderboard_key = f"leaderboard:{match_code}"
        if not await cache.exists(leaderboard_key):
            log_message = f"No leaderboard found in cache for match_code={match_code}."
            global_logger.warning(log_message)
            return BaseResponse(
                status='error',
                message=log_message,
                data=[]
            )
        leaderboard_data = await cache.zrevrange(leaderboard_key, 0, -1, withscores=True)
        formatted_leaderboard = [
            {
                "match_code": match_code,
                "player_code": player_code,
                "points": int(points)
            }
            for player_code, points in leaderboard_data
        ]
        log_message = f"Fetched leaderboard from cache for match_code={match_code} with {len(formatted_leaderboard)} entries."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=formatted_leaderboard
        )
    except Exception as e:
        global_logger.exception()
        return BaseResponse(
            status='error',
            message=log_message,
            exception=e
        )