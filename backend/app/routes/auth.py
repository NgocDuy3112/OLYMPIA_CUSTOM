from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from logger import global_logger
from core.auth import *
from schemas.user import *
from models.user import *
from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles, get_current_user
from fastapi.security import OAuth2PasswordRequestForm


router = APIRouter(prefix="/auth", tags=["Uỷ Quyền"])


@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=201
)
async def signup_api(user_data: UserCreate, session: AsyncSession = Depends(get_db)):
    try:
        return await signup(user_data, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        global_logger.exception("signup_api failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/change-password",
    response_model=BaseResponse,
    status_code=200,
)
async def change_password_api(
    payload: UserChangePassword,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await change_password(current_user["user_code"], payload.old_password, payload.new_password, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=200,
)
async def login_api(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        return await login(form_data, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")