from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.redis_store import get_redis
from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from core.scoreboard import calculate_score_event, get_scoreboard_for_a_match_from_db, adjust_player_score
from schemas.base import BaseResponse
from schemas.scoreboard import ScoreAdjustRequest, ScoreEventRequest


router = APIRouter(prefix='/scoreboard', tags=['Bảng xếp hạng'])


@router.get(
    "/{match_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_scoreboard_for_match(
    match_code: str,
    redis: Redis = Depends(get_redis),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await get_scoreboard_for_a_match_from_db(match_code, redis, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/calculate",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200,
)
async def calculate_score(
    request: ScoreEventRequest,
    redis: Redis = Depends(get_redis),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    return await calculate_score_event(request, redis, session)


@router.patch(
    "/adjust",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def adjust_score(
    request: ScoreAdjustRequest,
    redis: Redis = Depends(get_redis),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await adjust_player_score(request, redis, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))