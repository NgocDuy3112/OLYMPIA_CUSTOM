# Test file for OTP core functions
# This file will be run in the proper test environment with pytest
import sys
import os
# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timedelta
from sqlalchemy import select

from models.user import User, RoleEnum
from models.password_reset_token import PasswordResetToken
from schemas.otp import OTPRequest, OTPVerifyRequest
from schemas.base import BaseResponse
from schemas.user import TokenResponse


async def test_request_otp_success(db_session, sample_user):
    """Test requesting OTP successfully."""
    # Create a mock valkey
    mock_valkey = MagicMock()
    mock_valkey.get = AsyncMock(return_value=None)  # No rate limit hit
    mock_valkey.set = AsyncMock()
    mock_valkey.delete = AsyncMock()
    mock_valkey.incr = AsyncMock(return_value=1)
    mock_valkey.publish = AsyncMock()
    
    from core.otp import request_otp
    
    response = await request_otp(
        user_code=sample_user.user_code,
        email=None,
        purpose="login",
        session=db_session,
        valkey=mock_valkey
    )
    
    assert isinstance(response, BaseResponse)
    assert response.status == "success"
    assert "OTP sent to user's email" in response.message
    
    # Verify OTP was stored in valkey
    mock_valkey.set.assert_called()


async def test_request_otp_by_email_success(db_session, sample_user):
    """Test requesting OTP by email successfully."""
    # Create a mock valkey
    mock_valkey = MagicMock()
    mock_valkey.get = AsyncMock(return_value=None)  # No rate limit hit
    mock_valkey.set = AsyncMock()
    mock_valkey.delete = AsyncMock()
    mock_valkey.incr = AsyncMock(return_value=1)
    mock_valkey.publish = AsyncMock()
    
    from core.otp import request_otp
    
    response = await request_otp(
        user_code=None,
        email=sample_user.email,
        purpose="login",
        session=db_session,
        valkey=mock_valkey
    )
    
    assert isinstance(response, BaseResponse)
    assert response.status == "success"
    assert "OTP sent to user's email" in response.message


async def test_request_otp_user_not_found(db_session):
    """Test requesting OTP for non-existent user."""
    # Create a mock valkey
    mock_valkey = MagicMock()
    mock_valkey.get = AsyncMock(return_value=None)
    
    from core.otp import request_otp
    
    try:
        await request_otp(
            user_code="OC_UNONEXISTENT",
            email=None,
            purpose="login",
            session=db_session,
            valkey=mock_valkey
        )
        assert False, "Expected ValueError was not raised"
    except ValueError as e:
        assert "User not found" in str(e)


async def test_request_otp_no_email(db_session, mock_user_data):
    """Test requesting OTP for user without email."""
    # Create user without email
    from core.auth import hash_password
    
    user = User(
        user_name=mock_user_data["user_name"],
        user_code=mock_user_data["user_code"],
        hashed_password=hash_password(mock_user_data["password"]),
        email=None,  # No email
        role=RoleEnum.player
    )
    
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    # Create a mock valkey
    mock_valkey = MagicMock()
    mock_valkey.get = AsyncMock(return_value=None)
    
    from core.otp import request_otp
    
    try:
        await request_otp(
            user_code=user.user_code,
            email=None,
            purpose="login",
            session=db_session,
            valkey=mock_valkey
        )
        assert False, "Expected ValueError was not raised"
    except ValueError as e:
        assert "User has no email on file" in str(e)


async def test_verify_otp_success(db_session, sample_user):
    """Test verifying OTP successfully."""
    from core.otp import verify_otp
    import secrets
    import string
    
    # Generate an OTP
    otp = "".join(secrets.choice(string.digits) for _ in range(6))
    otp_key = f"otp:{sample_user.id}:login"
    
    # Create a mock valkey that returns the OTP
    mock_valkey = MagicMock()
    
    async def mock_get(key):
        if key == otp_key:
            return otp
        elif "attempts" in key:
            return "0"
        return None
    
    mock_valkey.get = mock_get
    mock_valkey.delete = AsyncMock()
    
    response = await verify_otp(
        user_code=sample_user.user_code,
        email=None,
        purpose="login",
        otp=otp,
        session=db_session,
        valkey=mock_valkey
    )
    
    assert isinstance(response, TokenResponse)
    assert response.role == "player"
    assert response.user_code == sample_user.user_code
    assert len(response.access_token) > 0
    
    # Verify OTP was consumed (deleted)
    mock_valkey.delete.assert_called()


async def test_verify_otp_invalid(db_session, sample_user):
    """Test verifying invalid OTP."""
    from core.otp import verify_otp
    
    # Create a mock valkey that returns a different OTP
    otp = "123456"
    wrong_otp = "654321"
    otp_key = f"otp:{sample_user.id}:login"
    
    mock_valkey = MagicMock()
    
    async def mock_get(key):
        if key == otp_key:
            return otp  # Correct OTP stored
        elif "attempts" in key:
            return "0"
        return None
    
    mock_valkey.get = mock_get
    mock_valkey.incr = AsyncMock(return_value=1)
    
    try:
        await verify_otp(
            user_code=sample_user.user_code,
            email=None,
            purpose="login",
            otp=wrong_otp,  # Wrong OTP provided
            session=db_session,
            valkey=mock_valkey
        )
        assert False, "Expected ValueError was not raised"
    except ValueError as e:
        assert "Invalid OTP" in str(e)
        # Verify attempts were incremented
        mock_valkey.incr.assert_called()


async def test_verify_otp_max_attempts(db_session, sample_user):
    """Test verifying OTP after exceeding max attempts."""
    from core.otp import verify_otp
    
    # Create a mock valkey that returns max attempts reached
    mock_valkey = MagicMock()
    
    async def mock_get(key):
        if "attempts" in key:
            return "5"  # Max attempts reached
        return None
    
    mock_valkey.get = mock_get
    
    try:
        await verify_otp(
            user_code=sample_user.user_code,
            email=None,
            purpose="login",
            otp="123456",
            session=db_session,
            valkey=mock_valkey
        )
        assert False, "Expected ValueError was not raised"
    except ValueError as e:
        assert "Too many incorrect attempts" in str(e)


async def test_verify_otp_not_found(db_session, sample_user):
    """Test verifying non-existent OTP."""
    from core.otp import verify_otp
    
    # Create a mock valkey that returns None (no OTP found)
    mock_valkey = MagicMock()
    
    async def mock_get(key):
        return None  # No OTP found
    
    mock_valkey.get = mock_get
    
    try:
        await verify_otp(
            user_code=sample_user.user_code,
            email=None,
            purpose="login",
            otp="123456",
            session=db_session,
            valkey=mock_valkey
        )
        assert False, "Expected ValueError was not raised"
    except ValueError as e:
        assert "No OTP found or it has expired" in str(e)