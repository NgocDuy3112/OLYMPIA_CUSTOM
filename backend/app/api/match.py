from fastapi import APIRouter, Depends, Query
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_match_by_match_code(
    match_code: str,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to fetch matches by their match code.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await get_match_by_match_code_from_db(match_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")