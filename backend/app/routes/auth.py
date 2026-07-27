from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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
async def signup_api(user_data: UserCreate, background_tasks: BackgroundTasks, session: AsyncSession = Depends(get_db)):
    try:
        return await signup(user_data, session, background_tasks)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        global_logger.exception("signup_api failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/send-credentials/{user_code}",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
    status_code=200,
)
async def send_credentials_api(
    user_code: str,
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await send_credentials(user_code, session)
    except HTTPException:
        raise
    except Exception as e:
        global_logger.exception("send_credentials_api failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/send-reset/{user_code}",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
    status_code=200,
)
async def send_reset_api(
    user_code: str,
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await send_reset_link(user_code, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/reset-password",
    response_model=BaseResponse,
    status_code=200,
)
async def reset_password_api(
    payload: PasswordResetRequest,
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    try:
        return await reset_password_by_token(payload.token, payload.new_password, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/test-email",
    response_model=BaseResponse,
    status_code=200,
    dependencies=[Depends(require_roles(["admin"]))],
)
async def test_email_api(
    to: str,
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    from utils.email import send_credentials_email_safe, _get_settings
    try:
        cfg = _get_settings()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"EmailSettings load failed — check SMTP_USER, SMTP_PASSWORD in .env: {e}",
        )
    await send_credentials_email_safe(
        to=to,
        user_name="Test User",
        user_code="OC_U_TEST",
        password="test-password-123",
    )
    return BaseResponse(
        status="success",
        message=f"Test email queued to {to} via {cfg.SMTP_HOST}:{cfg.SMTP_PORT} (user={cfg.SMTP_USER})",
    )


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