from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from schemas.match import *
from models.match import *
from core.match import *



router = APIRouter(prefix='/matches', tags=['Trận đấu'])


@router.post(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=201
)
async def post_match(
    request: MatchInfoPostRequest,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to create a new match in the system.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await post_match_to_db(request, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch(
    "/{match_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def patch_match(
    match_code: str,
    request: MatchUpdateRequest,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Update a match. Accessible only by admin.
    """
    return await patch_match_to_db(match_code, request, session)


@router.delete(
    "/{match_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def delete_match(
    match_code: str,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to delete a match based on the provided match code.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await delete_match_from_db(match_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'mc']))],
    response_model=MatchRoomResponse,
    status_code=200
)
async def get_match_by_match_code(
    match_code: str,
    session: AsyncSession = Depends(get_db)
) -> MatchRoomResponse:
    """
    Endpoint to fetch matches by their match code.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await get_match_by_match_code_from_db(match_code, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")



@router.get(
    "/all",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_all_matches(
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """Endpoint to fetch all non-deleted matches. Accessible only by admin."""
    try:
        return await get_all_matches_from_db(session)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/{match_code}/room",
    dependencies=[Depends(require_roles(['admin', 'player', 'mc']))],
    response_model=MatchRoomResponse,
    status_code=200
)
async def get_match_room_for_players(
    match_code: str,
    session: AsyncSession = Depends(get_db)
) -> MatchRoomResponse:
    """Room info (match_name + players) accessible by player/mc/admin."""
    try:
        return await get_match_by_match_code_from_db(match_code, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/{match_code}/players",
    dependencies=[Depends(require_roles(['admin', 'mc']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_players_for_match(
    match_code: str,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """Endpoint to fetch players of a match by match code."""
    try:
        return await get_players_by_match_from_db(match_code, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch(
    "/{match_code}/finish",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def finish_match(
    match_code: str,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """Mark a match as finished. Only admin can do this."""
    try:
        return await finish_match_in_db(match_code, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")