from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.base import BaseResponse
from core.record import get_records_from_db


router = APIRouter(prefix='/records', tags=['Bản ghi'])


@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'mc']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_records(
    match_code: Annotated[str, Query(..., description="Mã trận đấu, phải bắt đầu với 'OC3_M'")],
    user_code: Annotated[str | None, Query(description="Mã người chơi. Nếu bỏ qua, trả về tất cả records trong match.")] = None,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    try:
        return await get_records_from_db(match_code, user_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")