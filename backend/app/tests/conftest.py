import asyncio
import sys
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

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
os.environ.setdefault("SMTP_HOST", "smtp.test.com")
os.environ.setdefault("SMTP_USER", "test@test.com")
os.environ.setdefault("SMTP_PASSWORD", "testpassword")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test-key-id")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("S3_REGION", "us-east-1")
os.environ.setdefault("VALKEY_USER", "default")
os.environ.setdefault("VALKEY_PASSWORD", "testpassword")
os.environ.setdefault("VALKEY_HOST", "localhost")
os.environ.setdefault("VALKEY_PORT", "6379")

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from dependencies.postgresql_db import Base
from models.user import User, RoleEnum
from models.password_reset_token import PasswordResetToken


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_engine():
    """Create an in-memory SQLite database engine for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        echo=False
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    await engine.dispose()


@pytest.fixture(scope="function")
async def db_session(db_engine):
    """Create a database session for testing."""
    async with AsyncSession(bind=db_engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def mock_valkey():
    """Mock valkey instance for testing."""
    mock = MagicMock()
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock()
    mock.delete = AsyncMock()
    mock.incr = AsyncMock(return_value=1)
    mock.publish = AsyncMock()
    return mock


@pytest.fixture
def mock_user_data():
    """Sample user data for testing."""
    return {
        "user_name": "Test User",
        "user_code": "OC_U12345678",
        "password": "testpassword123",
        "role": "player",
        "email": "test@example.com"
    }


@pytest.fixture
async def sample_user(db_session, mock_user_data):
    """Create a sample user in the database."""
    from core.auth import hash_password
    
    user = User(
        user_name=mock_user_data["user_name"],
        user_code=mock_user_data["user_code"],
        hashed_password=hash_password(mock_user_data["password"]),
        email=mock_user_data["email"],
        role=RoleEnum.player
    )
    
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    return user


@pytest.fixture
def mock_email_utils():
    """Mock email utilities for testing."""
    from unittest.mock import AsyncMock
    
    class MockEmailUtils:
        def __init__(self):
            self.send_credentials_email_safe = AsyncMock()
            self.send_password_reset_email_safe = AsyncMock()
            self.send_otp_email_safe = AsyncMock()
    
    return MockEmailUtils()


@pytest.fixture
def override_email_dependencies(mock_email_utils):
    """Override email dependencies with mocks."""
    import sys
    from unittest.mock import AsyncMock
    
    # Create a mock module
    mock_email_module = MagicMock()
    mock_email_module.send_credentials_email_safe = AsyncMock()
    mock_email_module.send_password_reset_email_safe = AsyncMock()
    mock_email_module.send_otp_email_safe = AsyncMock()
    
    # Inject the mock into sys.modules to override real imports
    sys.modules['utils.email'] = mock_email_module
    
    yield mock_email_module
    
    # Clean up
    if 'utils.email' in sys.modules:
        del sys.modules['utils.email']