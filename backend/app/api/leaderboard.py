from fastapi import APIRouter, Depends

from dependencies.valkey_store import get_valkey
from dependencies.user_auth import require_roles
from models.record import *
from schemas.record import *
from core.leaderboard import *



router = APIRouter(prefix='/leaderboard', tags=['Bảng xếp hạng'])



@router.get(
    "/{match_code}/{player_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_leaderboard(
    match_code: str,
    player_code: str,
    valkey: Valkey = Depends(get_valkey),
) -> BaseResponse:
    """
    Endpoint to fetch the leaderboard.
    Accessible by users with 'admin' roles.
    """
    try:
        return await get_leaderboard_from_valkey(match_code, player_code, valkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")