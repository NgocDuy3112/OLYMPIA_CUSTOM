import pytest
import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from fastapi import HTTPException

from models.user import User, RoleEnum
from models.password_reset_token import PasswordResetToken
from schemas.user import UserCreate, TokenResponse, PasswordResetRequest
from schemas.base import BaseResponse
from core.auth import (
    signup, 
    send_credentials, 
    send_reset_link, 
    reset_password_by_token, 
    login, 
    hash_password, 
    verify_password, 
    create_access_token
)
from core.otp import request_otp, verify_otp
from schemas.otp import OTPRequest, OTPVerifyRequest


@pytest.mark.asyncio
class TestAuthCore:
    """Test cases for the auth core functions."""
    
    async def test_hash_password_and_verify_password(self):
        """Test password hashing and verification."""
        password = "testpassword123"
        hashed = hash_password(password)
        
        assert hashed != password
        assert verify_password(password, hashed)
        assert not verify_password("wrongpassword", hashed)
    
    async def test_create_access_token(self):
        """Test JWT token creation."""
        data = {
            "sub": "OC_U12345678testuser",
            "user_name": "testuser",
            "user_code": "OC_U12345678",
            "role": "player"
        }
        
        token = create_access_token(data, expires_delta=timedelta(minutes=30))
        
        assert isinstance(token, str)
        assert len(token) > 0
        
    async def test_signup_success(self, db_session, mock_user_data):
        """Test successful user signup."""
        user_create = UserCreate(**mock_user_data)
        
        response = await signup(user_create, db_session)
        
        assert isinstance(response, TokenResponse)
        assert response.role == "player"
        assert response.user_code == "OC_U12345678"
        assert response.user_name == "Test User"
        assert len(response.access_token) > 0
        
        # Verify user was created in DB
        result = await db_session.execute(select(User).where(User.user_code == "OC_U12345678"))
        user = result.scalar_one_or_none()
        assert user is not None
        assert user.user_name == "Test User"
        assert user.email == "test@example.com"
        
    async def test_signup_duplicate_username(self, db_session, sample_user):
        """Test signup with duplicate username."""
        duplicate_data = {
            "user_name": sample_user.user_name,
            "user_code": "OC_U99999999",
            "password": "differentpassword",
            "role": "player",
            "email": "different@example.com"
        }
        user_create = UserCreate(**duplicate_data)
        
        with pytest.raises(HTTPException) as exc_info:
            await signup(user_create, db_session)
        
        assert exc_info.value.status_code == 400
        assert "Username already exists" in exc_info.value.detail
        
    async def test_signup_duplicate_user_code(self, db_session, sample_user):
        """Test signup with duplicate user code."""
        duplicate_data = {
            "user_name": "Different User",
            "user_code": sample_user.user_code,
            "password": "differentpassword",
            "role": "player",
            "email": "different@example.com"
        }
        user_create = UserCreate(**duplicate_data)
        
        with pytest.raises(HTTPException) as exc_info:
            await signup(user_create, db_session)
        
        assert exc_info.value.status_code == 400
        assert "Username already exists" in exc_info.value.detail
        
    async def test_signup_auto_generate_user_code(self, db_session, mock_user_data):
        """Test signup with auto-generated user code."""
        mock_user_data_copy = mock_user_data.copy()
        mock_user_data_copy["user_code"] = None  # Should auto-generate
        
        user_create = UserCreate(**mock_user_data_copy)
        response = await signup(user_create, db_session)
        
        assert isinstance(response, TokenResponse)
        assert response.user_code.startswith("OC_U")
        assert len(response.user_code) == 12  # OC_U + 8 chars
        
    async def test_send_credentials_success(self, db_session, sample_user, mock_valkey):
        """Test sending credentials successfully."""
        response = await send_credentials(sample_user.user_code, db_session)
        
        assert isinstance(response, BaseResponse)
        assert response.status == "success"
        assert "Đã đặt lại mật khẩu và gửi thông tin đăng nhập" in response.message
        
        # Verify password was updated in DB
        await db_session.refresh(sample_user)
        assert verify_password(response.message.split()[-1][:-1], sample_user.hashed_password)  # Last word before period
        
    async def test_send_credentials_user_not_found(self, db_session, mock_valkey):
        """Test sending credentials for non-existent user."""
        with pytest.raises(HTTPException) as exc_info:
            await send_credentials("OC_UNONEXISTENT", db_session)
        
        assert exc_info.value.status_code == 404
        assert "Không tìm thấy người dùng" in exc_info.value.detail
        
    async def test_send_credentials_no_email(self, db_session, mock_user_data):
        """Test sending credentials for user without email."""
        mock_user_data_copy = mock_user_data.copy()
        mock_user_data_copy["email"] = None
        
        user_create = UserCreate(**mock_user_data_copy)
        user_response = await signup(user_create, db_session)
        
        with pytest.raises(HTTPException) as exc_info:
            await send_credentials(user_response.user_code, db_session)
        
        assert exc_info.value.status_code == 400
        assert "chưa có địa chỉ email" in exc_info.value.detail
        
    async def test_send_reset_link_success(self, db_session, sample_user, mock_valkey):
        """Test sending reset link successfully."""
        response = await send_reset_link(sample_user.user_code, db_session)
        
        assert isinstance(response, BaseResponse)
        assert response.status == "success"
        assert "Password reset link sent" in response.message
        
        # Verify token was created in DB
        result = await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.user_id == sample_user.id)
        )
        token = result.scalar_one_or_none()
        assert token is not None
        assert token.used == False
        
    async def test_send_reset_link_user_not_found(self, db_session, mock_valkey):
        """Test sending reset link for non-existent user."""
        with pytest.raises(HTTPException) as exc_info:
            await send_reset_link("OC_UNONEXISTENT", db_session)
        
        assert exc_info.value.status_code == 404
        assert "Không tìm thấy người dùng" in exc_info.value.detail
        
    async def test_send_reset_link_no_email(self, db_session, mock_user_data):
        """Test sending reset link for user without email."""
        mock_user_data_copy = mock_user_data.copy()
        mock_user_data_copy["email"] = None
        
        user_create = UserCreate(**mock_user_data_copy)
        user_response = await signup(user_create, db_session)
        
        with pytest.raises(HTTPException) as exc_info:
            await send_reset_link(user_response.user_code, db_session)
        
        assert exc_info.value.status_code == 400
        assert "chưa có địa chỉ email" in exc_info.value.detail
        
    async def test_reset_password_by_token_success(self, db_session, sample_user):
        """Test resetting password with valid token."""
        # Create a reset token
        token = str(uuid.uuid4())
        reset_token = PasswordResetToken(
            token=token,
            user_id=sample_user.id,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        db_session.add(reset_token)
        await db_session.commit()
        
        new_password = "newpassword123"
        response = await reset_password_by_token(token, new_password, db_session)
        
        assert isinstance(response, BaseResponse)
        assert response.status == "success"
        assert "Mật khẩu đã được cập nhật" in response.message
        
        # Verify password was updated and token was used
        await db_session.refresh(sample_user)
        await db_session.refresh(reset_token)
        
        assert verify_password(new_password, sample_user.hashed_password)
        assert reset_token.used == True
        
    async def test_reset_password_by_token_invalid(self, db_session):
        """Test resetting password with invalid token."""
        with pytest.raises(HTTPException) as exc_info:
            await reset_password_by_token("invalidtoken", "newpassword", db_session)
        
        assert exc_info.value.status_code == 400
        assert "Invalid or expired token" in exc_info.value.detail
        
    async def test_reset_password_by_token_expired(self, db_session, sample_user):
        """Test resetting password with expired token."""
        # Create an expired token
        token = str(uuid.uuid4())
        expired_time = datetime.utcnow() - timedelta(hours=1)
        reset_token = PasswordResetToken(
            token=token,
            user_id=sample_user.id,
            expires_at=expired_time
        )
        db_session.add(reset_token)
        await db_session.commit()
        
        with pytest.raises(HTTPException) as exc_info:
            await reset_password_by_token(token, "newpassword", db_session)
        
        assert exc_info.value.status_code == 400
        assert "Invalid or expired token" in exc_info.value.detail
        
    async def test_login_success(self, db_session, sample_user):
        """Test successful login."""
        from fastapi.security import OAuth2PasswordRequestForm
        
        form_data = OAuth2PasswordRequestForm(
            username=sample_user.user_code,
            password="testpassword123",  # Use the original password
            grant_type=None,
            scope=None,
            client_id=None,
            client_secret=None
        )
        
        response = await login(form_data, db_session)
        
        assert isinstance(response, TokenResponse)
        assert response.role == "player"
        assert response.user_code == sample_user.user_code
        assert response.user_name == sample_user.user_name
        assert len(response.access_token) > 0
        
    async def test_login_wrong_password(self, db_session, sample_user):
        """Test login with wrong password."""
        from fastapi.security import OAuth2PasswordRequestForm
        
        form_data = OAuth2PasswordRequestForm(
            username=sample_user.user_code,
            password="wrongpassword",
            grant_type=None,
            scope=None,
            client_id=None,
            client_secret=None
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await login(form_data, db_session)
        
        assert exc_info.value.status_code == 400
        assert "Incorrect username or password" in exc_info.value.detail
        
    async def test_login_wrong_username(self, db_session):
        """Test login with wrong username."""
        from fastapi.security import OAuth2PasswordRequestForm
        
        form_data = OAuth2PasswordRequestForm(
            username="OC_UNONEXISTENT",
            password="testpassword123",
            grant_type=None,
            scope=None,
            client_id=None,
            client_secret=None
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await login(form_data, db_session)
        
        assert exc_info.value.status_code == 400
        assert "Incorrect username or password" in exc_info.value.detail


@pytest.mark.asyncio
class TestOTPFunctions:
    """Test cases for OTP functions."""
    
    async def test_request_otp_success(self, db_session, sample_user, mock_valkey):
        """Test requesting OTP successfully."""
        mock_valkey.get.return_value = None  # No rate limit hit
        
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
        
    async def test_request_otp_by_email_success(self, db_session, sample_user, mock_valkey):
        """Test requesting OTP by email successfully."""
        mock_valkey.get.return_value = None  # No rate limit hit
        
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
        
    async def test_request_otp_user_not_found(self, db_session, mock_valkey):
        """Test requesting OTP for non-existent user."""
        with pytest.raises(ValueError) as exc_info:
            await request_otp(
                user_code="OC_UNONEXISTENT",
                email=None,
                purpose="login",
                session=db_session,
                valkey=mock_valkey
            )
        
        assert "User not found" in str(exc_info.value)
        
    async def test_request_otp_no_email(self, db_session, mock_user_data, mock_valkey):
        """Test requesting OTP for user without email."""
        mock_user_data_copy = mock_user_data.copy()
        mock_user_data_copy["email"] = None
        
        user_create = UserCreate(**mock_user_data_copy)
        user_response = await signup(user_create, db_session)
        
        with pytest.raises(ValueError) as exc_info:
            await request_otp(
                user_code=user_response.user_code,
                email=None,
                purpose="login",
                session=db_session,
                valkey=mock_valkey
            )
        
        assert "User has no email on file" in str(exc_info.value)
        
    async def test_request_otp_rate_limited(self, db_session, sample_user, mock_valkey):
        """Test requesting OTP when rate limited."""
        mock_valkey.get.return_value = "1"  # Rate limit hit
        
        with pytest.raises(ValueError) as exc_info:
            await request_otp(
                user_code=sample_user.user_code,
                email=None,
                purpose="login",
                session=db_session,
                valkey=mock_valkey
            )
        
        assert "OTP recently sent" in str(exc_info.value)
        
    async def test_verify_otp_success(self, db_session, sample_user, mock_valkey):
        """Test verifying OTP successfully."""
        otp = "123456"
        otp_key = f"otp:{sample_user.id}:login"
        
        # Mock valkey to return the OTP
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
        
    async def test_verify_otp_invalid(self, db_session, sample_user, mock_valkey):
        """Test verifying invalid OTP."""
        otp = "123456"
        wrong_otp = "654321"
        otp_key = f"otp:{sample_user.id}:login"
        
        # Mock valkey to return the correct OTP
        async def mock_get(key):
            if key == otp_key:
                return otp
            elif "attempts" in key:
                return "0"
            return None
            
        mock_valkey.get = mock_get
        mock_valkey.incr = AsyncMock(return_value=1)
        
        with pytest.raises(ValueError) as exc_info:
            await verify_otp(
                user_code=sample_user.user_code,
                email=None,
                purpose="login",
                otp=wrong_otp,
                session=db_session,
                valkey=mock_valkey
            )
        
        assert "Invalid OTP" in str(exc_info.value)
        # Verify attempts were incremented
        mock_valkey.incr.assert_called()
        
    async def test_verify_otp_max_attempts(self, db_session, sample_user, mock_valkey):
        """Test verifying OTP after exceeding max attempts."""
        otp = "123456"
        
        # Mock valkey to return max attempts reached
        async def mock_get(key):
            if "attempts" in key:
                return "5"  # Max attempts reached
            return None
            
        mock_valkey.get = mock_get
        
        with pytest.raises(ValueError) as exc_info:
            await verify_otp(
                user_code=sample_user.user_code,
                email=None,
                purpose="login",
                otp=otp,
                session=db_session,
                valkey=mock_valkey
            )
        
        assert "Too many incorrect attempts" in str(exc_info.value)
        
    async def test_verify_otp_not_found(self, db_session, sample_user, mock_valkey):
        """Test verifying non-existent OTP."""
        async def mock_get(key):
            return None  # No OTP found
            
        mock_valkey.get = mock_get
        
        with pytest.raises(ValueError) as exc_info:
            await verify_otp(
                user_code=sample_user.user_code,
                email=None,
                purpose="login",
                otp="123456",
                session=db_session,
                valkey=mock_valkey
            )
        
        assert "No OTP found or it has expired" in str(exc_info.value)