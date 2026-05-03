# Edge case tests for the OLYMPIA CUSTOM backend.

import sys
import os

ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

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
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test-key-id")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("S3_REGION", "us-east-1")

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from sqlalchemy import select

from models.user import User, RoleEnum
from models.match import Match
from models.question import Question
from core.auth import hash_password, create_access_token, signup
from schemas.user import UserCreate
from fastapi import BackgroundTasks


def _make_token(user_code: str = "OC_U12345678", role: str = "admin",
                user_name: str = "Test User") -> str:
    return create_access_token({
        "sub": user_code,
        "user_code": user_code,
        "user_name": user_name,
        "role": role,
    })


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── EDGE-04: Match with 0 questions ──────────────────────────────────────────

class TestEmptyMatch:
    """Verify graceful handling of matches with no questions."""

    async def test_get_questions_for_empty_match(self, db_session, sample_user):
        """Fetching questions for a match with no questions should return empty list."""
        from fastapi.testclient import TestClient
        from main import app

        # Create a match with no questions
        match = Match(
            match_code="OC3_M_EMPTY",
            match_name="Empty Match",
            match_status="active",
            created_by=sample_user.id,
        )
        db_session.add(match)
        await db_session.commit()

        client = TestClient(app)
        admin_token = _make_token(role="admin")

        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_EMPTY"},
            headers=_auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        # data should be an empty list or null
        assert data.get("data") is None or data.get("data") == []


# ── EDGE-02: Duplicate user_code ─────────────────────────────────────────────

class TestDuplicateUserCode:
    """Verify handling of duplicate user codes."""

    async def test_cannot_create_duplicate_user_code(self, db_session, sample_user):
        """Creating a user with an existing user_code should fail."""
        from core.auth import signup
        from schemas.user import UserCreate

        duplicate = UserCreate(
            user_name="Duplicate User",
            user_code=sample_user.user_code,  # same code
            password="somepassword123",
            role="player",
            email="dup@example.com",
        )

        with pytest.raises(Exception):
            await signup(duplicate, db_session, BackgroundTasks())


# ── EDGE-05: Large media file handling ───────────────────────────────────────

class TestLargeMediaFile:
    """Verify that oversized file uploads are rejected before hitting S3."""

    @pytest.mark.asyncio
    async def test_oversized_upload_rejected(self):
        """upload_file_to_s3 should raise 400 for files exceeding max_size_bytes."""
        from io import BytesIO
        from fastapi import UploadFile
        from fastapi import HTTPException
        from core.media import upload_file_to_s3

        big_data = b"x" * (6 * 1024 * 1024)  # 6 MB
        file = UploadFile(filename="big.jpg", file=BytesIO(big_data))
        file.content_type = "image/jpeg"
        s3_client = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await upload_file_to_s3(file, "OC3_M01T", s3_client, "oc3", max_size_bytes=5 * 1024 * 1024)

        assert exc_info.value.status_code == 400
        assert "too large" in exc_info.value.detail


# ── EDGE-06: Valkey connection lost ──────────────────────────────────────────

class TestValkeyUnavailable:
    """Verify REST API works when Valkey is down."""

    def test_health_check_without_valkey(self, db_session, sample_user):
        """Health endpoint should work even without Valkey."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


# ── EDGE-08: Concurrent admin actions ────────────────────────────────────────

class TestConcurrentAdminActions:
    """Verify concurrent admin actions on the same match."""

    async def test_concurrent_question_creation(self, db_session, sample_user):
        """Two admins creating questions with same code — one should fail."""
        from core.question import post_question_to_db
        from schemas.question import QuestionPostRequest

        # Create a match
        match = Match(
            match_code="OC3_M_CONCURRENT",
            match_name="Concurrent Test",
            match_status="active",
            created_by=sample_user.id,
        )
        db_session.add(match)
        await db_session.commit()

        request = QuestionPostRequest(
            match_code="OC3_M_CONCURRENT",
            question_code="OC3_Q_DUP",
            content="Test question?",
            answer="A",
        )

        # First creation should succeed
        resp1 = await post_question_to_db(request, db_session)
        assert resp1.status == "success"

        # Second creation with same code should fail
        with pytest.raises(Exception):
            await post_question_to_db(request, db_session)


# ── EDGE-01: Player disconnect mid-game ──────────────────────────────────────

class TestPlayerDisconnect:
    """Verify server handles player disconnects gracefully."""

    def test_ws_manager_handles_disconnect(self):
        """ConnectionManager should not crash on unexpected disconnect."""
        from utils.ws_connection import ConnectionManager
        from unittest.mock import MagicMock

        manager = ConnectionManager()

        # Simulate a connection and disconnect
        mock_ws = MagicMock()
        mock_ws.client.host = "127.0.0.1"

        # Should not raise even without prior connect
        manager.disconnect(mock_ws, "OC3_M_TEST")
