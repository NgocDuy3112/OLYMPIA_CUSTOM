from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from valkey.asyncio import Valkey
import secrets
import string
from datetime import datetime, timedelta

from logger import global_logger, mask_email
from models.user import User
from schemas.base import BaseResponse
from schemas.user import TokenResponse
from core.auth import create_access_token, hash_password, settings


DEFAULT_OTP_LENGTH = 6
DEFAULT_OTP_TTL = 300  # seconds
DEFAULT_RATE_LIMIT_SECONDS = 30
DEFAULT_MAX_ATTEMPTS = 5


async def request_otp(
    user_code: str | None,
    email: str | None,
    purpose: str,
    session: AsyncSession,
    valkey: Valkey,
    length: int = DEFAULT_OTP_LENGTH,
    ttl: int = DEFAULT_OTP_TTL,
    rate_limit_seconds: int = DEFAULT_RATE_LIMIT_SECONDS,
):
    """Generate an OTP for a user and send via email. Rate-limited."""
    # Resolve user
    if user_code:
        result = await session.execute(select(User).where(User.user_code == user_code, User.is_deleted == False))
    elif email:
        result = await session.execute(select(User).where(User.email == email, User.is_deleted == False))
    else:
        raise ValueError("Either user_code or email must be provided")

    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError("User not found")
    if not user.email:
        raise ValueError("User has no email on file")

    rate_key = f"otp:sent:{user.id}:{purpose}"
    existing = await valkey.get(rate_key)
    if existing is not None:
        raise ValueError("OTP recently sent; please wait before requesting again")

    # generate numeric OTP
    otp = "".join(secrets.choice(string.digits) for _ in range(length))

    otp_key = f"otp:{user.id}:{purpose}"
    attempts_key = f"otp:attempts:{user.id}:{purpose}"

    try:
        await valkey.set(otp_key, otp, ex=ttl)
        await valkey.set(rate_key, "1", ex=rate_limit_seconds)
        await valkey.set(attempts_key, "0", ex=ttl)
    except Exception as e:
        global_logger.exception("Failed to set OTP in valkey")
        raise

    # send email (use a simple template)
    try:
        from utils.email import send_otp_email_safe

        await send_otp_email_safe(to=user.email, user_name=user.user_name, otp=otp, purpose=purpose)
    except Exception:
        global_logger.exception("Failed to queue OTP email")

    return BaseResponse(status="success", message="OTP sent to user's email")


async def verify_otp(
    user_code: str | None,
    email: str | None,
    purpose: str,
    otp: str,
    session: AsyncSession,
    valkey: Valkey,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> TokenResponse:
    # Resolve user
    if user_code:
        result = await session.execute(select(User).where(User.user_code == user_code, User.is_deleted == False))
    elif email:
        result = await session.execute(select(User).where(User.email == email, User.is_deleted == False))
    else:
        raise ValueError("Either user_code or email must be provided")

    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError("User not found")

    otp_key = f"otp:{user.id}:{purpose}"
    attempts_key = f"otp:attempts:{user.id}:{purpose}"

    stored = await valkey.get(otp_key)
    attempts = await valkey.get(attempts_key)
    try:
        attempts_int = int(attempts) if attempts is not None else 0
    except Exception:
        attempts_int = 0

    if stored is None:
        raise ValueError("No OTP found or it has expired")
    if attempts_int >= max_attempts:
        raise ValueError("Too many incorrect attempts")

    if stored != otp:
        # increment attempts
        try:
            await valkey.incr(attempts_key)
        except Exception:
            # fallback: read-then-set
            try:
                await valkey.set(attempts_key, str(attempts_int + 1))
            except Exception:
                pass
        raise ValueError("Invalid OTP")

    # success: consume otp
    try:
        await valkey.delete(otp_key)
        await valkey.delete(attempts_key)
    except Exception:
        pass

    # issue JWT
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        data={
            "sub": user.user_code + user.user_name,
            "user_name": user.user_name,
            "user_code": user.user_code,
            "role": user.role,
        },
        expires_delta=access_token_expires,
    )

    return TokenResponse(access_token=token, role=user.role, user_code=user.user_code, user_name=user.user_name)
