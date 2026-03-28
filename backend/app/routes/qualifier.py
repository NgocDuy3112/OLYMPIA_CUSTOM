from fastapi import APIRouter, Depends
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.valkey_store import get_valkey
from dependencies.user_auth import require_roles
from schemas.qualifier import QualifierScoreRequest
from schemas.base import BaseResponse
from core.qualifier import calculate_and_apply_qualifier_scores, get_qualifier_standings, process_end_of_round, get_qualifier_advancements
from core.qualifier import process_end_of_round
from schemas.qualifier import EndRoundRequest
from sqlalchemy.ext.asyncio import AsyncSession
from valkey.asyncio import Valkey
from fastapi import HTTPException


router = APIRouter(prefix="/qualifier", tags=["Vòng Loại"])


@router.post(
    "/calculate-scores",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
    status_code=200,
)
async def post_qualifier_calculate_scores(
    request: QualifierScoreRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    valkey: Annotated[Valkey, Depends(get_valkey)],
) -> BaseResponse:
    """Calculate and apply qualifier scores for all players who answered the given question."""
    try:
        return await calculate_and_apply_qualifier_scores(request, session, valkey)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.post(
    "/end-round",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
    status_code=200,
)
async def post_end_round(
    request: EndRoundRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    valkey: Annotated[Valkey, Depends(get_valkey)],
) -> BaseResponse:
    """Admin endpoint to finalize a qualifier round. Marks reserves and advances top N players."""
    try:
        return await process_end_of_round(request.match_code, request.round_number, session, valkey, request.advance_count)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.get(
    "/advancements/{match_code}",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
    status_code=200,
)
async def get_advancements(
    match_code: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BaseResponse:
    try:
        return await get_qualifier_advancements(match_code, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.get(
    "/standings/{match_code}",
    dependencies=[Depends(require_roles(["admin", "player"]))],
    response_model=BaseResponse,
    status_code=200,
)
async def get_standings(
    match_code: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    valkey: Annotated[Valkey, Depends(get_valkey)],
) -> BaseResponse:
    """Return current qualifier standings for the match, sorted by ranking rules."""
    try:
        return await get_qualifier_standings(match_code, session, valkey)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
