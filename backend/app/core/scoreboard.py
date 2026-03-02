from valkey.asyncio import Valkey
import json
from fastapi import HTTPException

from logger import global_logger
from schemas.base import BaseResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.match import Match, MatchPlayerPosition


def _safe_convert_score(value) -> int:
    """Helper function to safely convert score from Valkey to int."""
    if value is None:
        return 0
    try:
        return int(value)
    except (ValueError, TypeError):
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return 0


async def get_scoreboard_for_a_match_from_db(
    match_code: str,
    valkey: Valkey,
    session: AsyncSession,
) -> BaseResponse:
    """Return full scoreboard for a match. Prioritizes Valkey cache."""
    log_message = f"GET request received to fetch scoreboard for match_code: {match_code}."
    global_logger.info(log_message)
    
    try:
        leaderboard_key = f"leaderboard:{match_code}"
        
        # Step 1: Query DB to get player info
        query = (
            select(Match)
            .options(selectinload(Match.players_position).joinedload(MatchPlayerPosition.user))
            .where(Match.match_code == match_code, Match.is_deleted == False)
        )
        result = await session.execute(query)
        match = result.scalar_one_or_none()
        if not match:
            log_message = f"Match with code {match_code} not found"
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        # Step 2: Build players data and sort by position
        players_data = [
            {
                "user_code": pp.user.user_code,
                "user_name": pp.user.user_name,
                "position": pp.position,
            }
            for pp in match.players_position
        ]
        players_data.sort(key=lambda x: x["position"])
        
        # Step 3: Fetch all scores from Valkey in one operation
        player_codes = [p["user_code"] for p in players_data]
        
        if await valkey.exists(leaderboard_key):
            scores = await valkey.mget(player_codes) if player_codes else []
            scoreboard_list = [
                {
                    "user_code": p["user_code"],
                    "user_name": p["user_name"],
                    "cummulative_score": _safe_convert_score(scores[i] if i < len(scores) else None),
                }
                for i, p in enumerate(players_data)
            ]
            global_logger.info(f"Fetched scoreboard from cache for match_code={match_code}.")
        else:
            # No leaderboard in cache -> return zeros for all players
            scoreboard_list = [
                {
                    "user_code": p["user_code"],
                    "user_name": p["user_name"],
                    "cummulative_score": 0,
                }
                for p in players_data
            ]
            global_logger.info(f"No leaderboard cache found; returning zeroed scoreboard for match_code={match_code}.")

        return BaseResponse(
            status="success",
            message=log_message,
            data={"scoreboard": scoreboard_list},
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Error fetching scoreboard for match_code={match_code}: {str(e)}"
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)