from fastapi import APIRouter, Query, Depends

from dependencies.postgresql_db import get_db
from dependencies.valkey_store import get_valkey
from dependencies.user_auth import require_roles
from schemas.record import *
from models.record import *
from core.record import *



router = APIRouter(prefix='/records', tags=['Bản ghi'])


@router.post(
    "/",
    dependencies=[Depends(require_roles(['admin', 'player']))],
    response_model=BaseResponse,
    status_code=201
)
async def post_record(
    request: RecordPostRequest,
    session: AsyncSession = Depends(get_db),
    valkey: Valkey = Depends(get_valkey)
) -> BaseResponse:
    """
    Endpoint to create a new record in the system.
    Accessible by users with 'admin' or 'player' roles.
    """
    try:
        return await post_record_to_db(request, session, valkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'player']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_records(
    match_code: str = Query(..., description="Mã trận đấu, phải bắt đầu với 'OC3_M'"),
    player_code: str = Query(..., description="Mã người chơi, phải bắt đầu với 'OC_U'"),
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to retrieve records based on match_code and player_code.
    Accessible by users with 'admin' or 'player' roles.
    """
    try:
        return await get_records_from_db(match_code, player_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")