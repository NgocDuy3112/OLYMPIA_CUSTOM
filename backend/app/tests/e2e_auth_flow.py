"""Simple E2E-like test script that runs locally without network by
mocking email sending and using an in-memory SQLite DB and a mock Valkey.

Run with: python -m backend.app.tests.e2e_auth_flow
"""
import asyncio
import time
import sys
import os
from datetime import datetime

# Ensure backend/app is on sys.path so imports like `dependencies` resolve when run as a script
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, ROOT)

# Set minimal environment variables required by pydantic settings used in the app
os.environ.setdefault("POSTGRES_DB_USER", "test")
os.environ.setdefault("POSTGRES_DB_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB_HOST", "localhost")
os.environ.setdefault("POSTGRES_DB_PORT", "5432")
os.environ.setdefault("POSTGRES_DB_NAME", "testdb")
os.environ.setdefault("APP_HOST", "localhost")
os.environ.setdefault("APP_PORT", "8000")
os.environ.setdefault("SECRET_KEY", "secretkeyforlocaldev")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")

import types

# Inject a minimal fake utils.email module into sys.modules to avoid importing aiosmtplib
fake_email = types.ModuleType("utils.email")
async def _fake_send(*args, **kwargs):
    return None
fake_email.send_password_reset_email_safe = _fake_send
fake_email.send_otp_email_safe = _fake_send
fake_email.send_credentials_email_safe = _fake_send
sys.modules["utils.email"] = fake_email

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from dependencies.postgresql_db import Base
from models.user import User, RoleEnum
from models.password_reset_token import PasswordResetToken

import core.auth as auth
import core.otp as otp
import utils.email as email_utils


class MockValkey:
    def __init__(self):
        self.store = {}

    async def set(self, key, value, ex=None):
        expire_at = (time.time() + ex) if ex else None
        self.store[key] = (value, expire_at)

    async def get(self, key):
        v = self.store.get(key)
        if v is None:
            return None
        value, exp = v
        if exp is not None and time.time() > exp:
            del self.store[key]
            return None
        return value

    async def delete(self, key):
        self.store.pop(key, None)

    async def incr(self, key):
        cur = await self.get(key)
        try:
            val = int(cur) if cur is not None else 0
        except Exception:
            val = 0
        val += 1
        # keep no expiry for simplicity
        self.store[key] = (str(val), None)
        return val

    async def publish(self, channel, message):
        # noop for tests
        return None


async def main():
    # Patch email senders to no-op to avoid network
    async def _noop_send(*args, **kwargs):
        return None

    email_utils.send_password_reset_email_safe = lambda *a, **k: asyncio.create_task(_noop_send())
    email_utils.send_otp_email_safe = lambda *a, **k: asyncio.create_task(_noop_send())
    email_utils.send_credentials_email_safe = lambda *a, **k: asyncio.create_task(_noop_send())

    # Create in-memory SQLite DB and create tables from models' metadata
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as session:
        # Create a user
        u = User(
            user_code="OC_UTEST01",
            user_name="Test User",
            hashed_password=auth.hash_password("oldpass123"),
            email="test@example.com",
            role=RoleEnum.player,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        print("Created user:", u.user_code, u.email)

        # Admin sends reset link
        print("Calling send_reset_link (should create token)")
        # call send_reset_link which will create PasswordResetToken and attempt to email (no-op patched)
        resp = await auth.send_reset_link(u.user_code, session)
        print("send_reset_link response:", resp)

        # Query the token
        res = await session.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == u.id))
        prt = res.scalars().first()
        if not prt:
            print("ERROR: no PasswordResetToken created")
            return
        print("PasswordResetToken token:", prt.token)

        # Simulate user opening link and resetting password
        new_password = "newpass123"
        print("Calling reset_password_by_token...")
        await auth.reset_password_by_token(prt.token, new_password, session)
        await session.refresh(u)
        ok = auth.verify_password(new_password, u.hashed_password)
        print("Password reset success?", ok)

        # Request OTP
        valkey = MockValkey()
        print("Requesting OTP via core.otp.request_otp")
        resp2 = await otp.request_otp(user_code=u.user_code, email=None, purpose="login", session=session, valkey=valkey)
        print("request_otp response:", resp2)

        # Read OTP from valkey store
        otp_key = f"otp:{u.id}:login"
        otp_val = await valkey.get(otp_key)
        print("OTP in valkey:", otp_val)

        # Verify OTP
        print("Verifying OTP...")
        token_resp = await otp.verify_otp(user_code=u.user_code, email=None, purpose="login", otp=otp_val, session=session, valkey=valkey)
        print("verify_otp returned access token length:", len(token_resp.access_token))

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
