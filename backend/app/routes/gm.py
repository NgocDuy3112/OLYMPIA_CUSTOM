
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.redis_store import get_redis
from dependencies.user_auth import require_roles
from schemas.base import BaseResponse
from utils.gm_admin_state import get_admin_state


router = APIRouter(prefix="/gm", tags=["Giải Mã"])


@router.get(
    "/admin-state",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
)
async def get_gm_admin_state(
    match_code: str = Query(..., description="Match code to fetch the GM admin-state snapshot for"),
    redis=Depends(get_redis),
) -> BaseResponse:
    if not match_code:
        raise HTTPException(status_code=400, detail="match_code is required")

    snapshot = await get_admin_state(redis, match_code)
    return BaseResponse(
        status="success",
        message="GM admin-state snapshot fetched",
        data=snapshot or {},
    )
