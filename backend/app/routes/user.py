from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from models.user import *
from schemas.user import *
from core.user import *

router = APIRouter(prefix='/users', tags=['Người dùng'])


@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'mc']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_user_from_request(
    user_code: Annotated[str | None, Query(description="The unique code of the user to fetch.")] = None,
    user_role: Annotated[Role | None, Query(description="Filter users by role: guest|player|admin")] = None,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    try:
        return await get_user_from_request_from_db(user_code, user_role, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete(
    "/{user_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def delete_user(
    user_code: str,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    try:
        return await delete_user_from_db(user_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch(
    "/{user_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def patch_user(
    user_code: str,
    request: UserUpdateRequest,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    return await patch_user_to_db(user_code, request, session)
