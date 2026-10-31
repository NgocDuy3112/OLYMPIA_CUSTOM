from jose import jwt
import bcrypt as _bcrypt
from datetime import datetime, timedelta
import uuid

from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.user import *
from models.user import User
from configs import AppSettings
from datetime import timezone
from logger import global_logger


settings = AppSettings()


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def signup(
    user_data: UserCreate, 
    session: AsyncSession, 
) -> TokenResponse:
    if user_data.user_code:
        user_code = user_data.user_code
    else:
        prefix = settings.USER_PATTERN
        if user_data.role == "admin":
            prefix = f"{settings.USER_PATTERN}_A"
        elif user_data.role == "player":
            prefix = f"{settings.USER_PATTERN}_P03"
        elif user_data.role == "mc":
            prefix = f"{settings.USER_PATTERN}_MC"
        user_code = f"{prefix}{uuid.uuid4().hex[:8].upper()}"

    result = await session.execute(
        select(User).where((User.user_name == user_data.user_name) | (User.user_code == user_code))
    )
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    plain_password = user_data.password

    new_user = User(
        user_name=user_data.user_name,
        user_code=user_code,
        hashed_password=hash_password(plain_password),
        email=user_data.email,
        role=user_data.role
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    token = create_access_token(
        data={
            "sub": new_user.user_code + new_user.user_name,
            "user_name": new_user.user_name,
            "user_code": new_user.user_code,
            "role": new_user.role
        }, 
        expires_delta=access_token_expires
    )
    return TokenResponse(
        access_token=token, 
        role=new_user.role, 
        user_code=new_user.user_code, 
        user_name=new_user.user_name
    )


async def change_password(user_code: str, old_password: str, new_password: str, session: AsyncSession) -> BaseResponse:
    result = await session.execute(
        select(User).where(User.user_code == user_code, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    if not verify_password(old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng.")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự.")
    user.hashed_password = hash_password(new_password)
    await session.commit()
    global_logger.info(f"Password changed for user_code={user_code}.")
    return BaseResponse(status="success", message="Đổi mật khẩu thành công.")


async def login(form_data: OAuth2PasswordRequestForm, session: AsyncSession) -> TokenResponse:
    uname = (form_data.username or "").strip()
    result = await session.execute(
        select(User).where(
            User.is_deleted == False,
            (func.lower(User.user_code) == uname.lower())
            | (func.lower(User.user_name) == uname.lower())
            | (func.lower(User.email) == uname.lower()),
        )
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        data={
            "sub": user.user_code + user.user_name, 
            "user_name": user.user_name, 
            "user_code": user.user_code, 
            "role": user.role
        }, 
        expires_delta=access_token_expires
    )
    return TokenResponse(
        access_token=token,
        role=user.role,
        user_code=user.user_code,
        user_name=user.user_name
    )