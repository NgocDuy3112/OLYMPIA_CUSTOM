from jose import jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta

from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from sqlalchemy import select, func, cast, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.user import *
from models.user import User
from configs import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def signup(user_data: UserCreate, session: AsyncSession) -> TokenResponse:
    result = await session.execute(select(User).where(User.user_name == user_data.user_name))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    new_user = User(
        user_name=user_data.user_name,
        user_code=user_data.user_code,
        hashed_password=hash_password(user_data.password),
        role=user_data.role
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    token = create_access_token(
        data={"sub": new_user.user_code + new_user.user_name, "role": new_user.role}, 
        expires_delta=access_token_expires
    )
    return TokenResponse(access_token=token, role=new_user.role)


async def login(form_data: OAuth2PasswordRequestForm, session: AsyncSession) -> TokenResponse:
    # Check both username and password
    result = await session.execute(select(User).where(User.user_code == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        return BaseResponse(
            status='error',
            message="Incorrect username or password",
            exception=HTTPException(status_code=401)
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        data={"sub": user.user_code + user.user_name, "role": user.role}, 
        expires_delta=access_token_expires
    )
    return TokenResponse(
        access_token=token,
        role=user.role,
        user_code=user.user_code,
        user_name=user.user_name
    )