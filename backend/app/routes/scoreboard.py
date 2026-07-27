from fastapi import APIRouter, Depends, HTTPException
from valkey.asyncio import Valkey
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.valkey_store import get_valkey
from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from core.scoreboard import get_scoreboard_for_a_match_from_db, adjust_player_score
from schemas.base import BaseResponse
from schemas.scoreboard import ScoreAdjustRequest


router = APIRouter(prefix='/scoreboard', tags=['Bảng xếp hạng'])


@router.get(
    "/{match_code}",
    dependencies=[Depends(require_roles(['admin', 'player', 'mc']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_scoreboard_for_match(
    match_code: str,
    valkey: Valkey = Depends(get_valkey),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await get_scoreboard_for_a_match_from_db(match_code, valkey, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch(
    "/adjust",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def adjust_score(
    request: ScoreAdjustRequest,
    valkey: Valkey = Depends(get_valkey),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await adjust_player_score(request, valkey, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))