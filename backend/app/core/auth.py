from jose import jwt
import bcrypt as _bcrypt
from datetime import datetime, timedelta
import uuid

from fastapi import HTTPException, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.user import *
from models.user import User
from configs import AppSettings
from utils.email import send_credentials_email_safe, send_password_reset_email_safe
from models.password_reset_token import PasswordResetToken
from datetime import timezone
from logger import global_logger, mask_email


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
    background_tasks: BackgroundTasks
) -> TokenResponse:
    if user_data.user_code:
        user_code = user_data.user_code
    else:
        prefix = "OC_U"
        if user_data.role == "admin":
            prefix = "OC_U_A"
        elif user_data.role == "player":
            prefix = "OC_U_P03"
        elif user_data.role == "mc":
            prefix = "OC_U_MC"
        user_code = f"{prefix}{uuid.uuid4().hex[:8].upper()}"

    result = await session.execute(
        select(User).where((User.user_name == user_data.user_name) | (User.user_code == user_code))
    )
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    if getattr(user_data, 'password', None):
        plain_password = user_data.password
    else:
        import secrets
        import string
        alphabet = string.ascii_letters + string.digits
        plain_password = "".join(secrets.choice(alphabet) for _ in range(8))

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
    if new_user.email:
        background_tasks.add_task(
            send_credentials_email_safe,
            to=new_user.email,
            user_name=new_user.user_name,
            user_code=new_user.user_code,
            password=plain_password,
        )
    return TokenResponse(
        access_token=token, 
        role=new_user.role, 
        user_code=new_user.user_code, 
        user_name=new_user.user_name
    )


async def send_credentials(user_code: str, session: AsyncSession) -> BaseResponse:
    import secrets
    import string

    result = await session.execute(
        select(User).where(User.user_code == user_code, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng với mã {user_code}.")

    alphabet = string.ascii_letters + string.digits
    new_password = "".join(secrets.choice(alphabet) for _ in range(8))

    user.hashed_password = hash_password(new_password)
    await session.commit()

    email_note = ""
    if user.email:
        await send_credentials_email_safe(
            to=user.email,
            user_name=user.user_name,
            user_code=user.user_code,
            password=new_password,
        )
        email_note = f" và gửi email đến {user.email}"

    log_email_note = f" và gửi email đến {mask_email(user.email)}" if user.email else ""
    global_logger.info(f"Credentials reset{log_email_note} for user_code={user_code}.")
    return BaseResponse(
        status="success",
        message=f"Đã đặt lại mật khẩu{email_note}.",
        data={"plain_password": new_password, "user_code": user.user_code},
    )


async def send_reset_link(user_code: str, session: AsyncSession, expires_minutes: int = 60) -> BaseResponse:
    result = await session.execute(
        select(User).where(User.user_code == user_code, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng với mã {user_code}.")
    if not user.email:
        raise HTTPException(status_code=400, detail=f"Người dùng {user_code} chưa có địa chỉ email.")

    token = uuid.uuid4().hex
    expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
    prt = PasswordResetToken(token=token, user_id=user.id, expires_at=expires_at)
    session.add(prt)
    await session.commit()

    try:
        from configs import EmailSettings
        fe = EmailSettings()
        reset_link = f"{fe.FRONTEND_URL}/auth/reset-password?token={token}"
    except Exception:
        reset_link = f"{settings.APP_URL}/auth/reset-password?token={token}"

    await send_password_reset_email_safe(to=user.email, user_name=user.user_name, reset_link=reset_link)
    return BaseResponse(status="success", message=f"Password reset link sent to {user.email}.")


async def reset_password_by_token(token: str, new_password: str, session: AsyncSession) -> BaseResponse:
    now = datetime.utcnow()
    result = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == token,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > now,
        )
    )
    prt = result.scalar_one_or_none()
    if prt is None:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    result2 = await session.execute(select(User).where(User.id == prt.user_id, User.is_deleted == False))
    user = result2.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(new_password)
    prt.used = True
    await session.commit()

    return BaseResponse(status="success", message="Mật khẩu đã được cập nhật.")


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