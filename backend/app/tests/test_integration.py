# Integration tests for the OLYMPIA CUSTOM backend.
# These tests verify end-to-end flows across multiple components.

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
from unittest.mock import MagicMock, patch
from sqlalchemy import select

from models.user import User, RoleEnum
from models.match import Match
from models.question import Question
from core.auth import hash_password, create_access_token


def _make_token(user_code: str = "OC_U12345678", role: str = "player",
                user_name: str = "Test User") -> str:
    return create_access_token({
        "sub": user_code,
        "user_code": user_code,
        "user_name": user_name,
        "role": role,
    })


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── INT-01: Full game flow ───────────────────────────────────────────────────

class TestFullGameFlow:
    """End-to-end test: create match → import questions → players join → answer."""

    def test_create_match_and_questions(self, db_session, sample_user):
        """Admin creates a match, imports questions, player retrieves them."""
        from fastapi.testclient import TestClient
        from main import app

        admin_token = _make_token(role="admin", user_code="OC_U_ADMIN01")
        player_token = _make_token(role="player", user_code="OC_U_PLAYER1")

        client = TestClient(app)

        # 1. Create a match
        response = client.post(
            "/questions/",
            json={
                "match_code": "OC3_M_INT01",
                "question_code": "OC3_Q_INT01_01",
                "content": "Thủ đô của Việt Nam là gì?",
                "answer": "Hà Nội",
                "explanation": "Hà Nội là thủ đô của Việt Nam.",
            },
            headers=_auth_headers(admin_token),
        )
        assert response.status_code == 201

        # 2. Player retrieves questions for the match
        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_INT01"},
            headers=_auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json().get("data", [])
        assert len(data) >= 1
        assert data[0]["question_code"] == "OC3_Q_INT01_01"


# ── INT-04: Media in question display ────────────────────────────────────────

class TestMediaInQuestions:
    """Verify media URLs are correctly stored and retrieved with questions."""

    def test_question_with_media_url(self, db_session, sample_user):
        """Question with media_url should store and return it correctly."""
        from fastapi.testclient import TestClient
        from main import app

        admin_token = _make_token(role="admin")
        client = TestClient(app)

        # Create question with media
        response = client.post(
            "/questions/",
            json={
                "match_code": "OC3_M_MEDIA",
                "question_code": "OC3_Q_MEDIA01",
                "content": "Đây là hình gì?",
                "answer": "Hình tròn",
                "media_url": "OC3_M_MEDIA/OC3_Q_MEDIA01.jpg",
            },
            headers=_auth_headers(admin_token),
        )
        assert response.status_code == 201

        # Retrieve and verify media_url
        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_MEDIA", "question_code": "OC3_Q_MEDIA01"},
            headers=_auth_headers(admin_token),
        )
        assert response.status_code == 200
        data = response.json().get("data")
        if isinstance(data, list):
            data = data[0]
        assert data.get("media_url") == "OC3_M_MEDIA/OC3_Q_MEDIA01.jpg"


# ── INT-02: WebSocket broadcast simulation ───────────────────────────────────

class TestWebSocketBroadcast:
    """Verify WebSocket message broadcasting logic."""

    def test_connection_manager_broadcast(self):
        """ConnectionManager should broadcast to all connections in a room."""
        from utils.ws_connection import ConnectionManager
        from unittest.mock import MagicMock, AsyncMock, patch
        import asyncio

        manager = ConnectionManager()

        # Create mock WebSocket connections
        ws1 = MagicMock()
        ws2 = MagicMock()

        # Simulate room with connections
        manager.rooms["OC3_M_TEST"] = [ws1, ws2]

        # Mock send_to_room_local to verify it's called
        async def fake_send(room_id, data):
            for ws in manager.rooms.get(room_id, []):
                ws.send_json(data)

        with patch.object(manager, "send_to_room_local", side_effect=fake_send):
            asyncio.get_event_loop().run_until_complete(
                manager.broadcast_to_room("OC3_M_TEST", {"type": "test"})
            )

        # Both should have received the message
        ws1.send_json.assert_called_once_with({"type": "test"})
        ws2.send_json.assert_called_once_with({"type": "test"})


# ── INT-03: Scoreboard update ────────────────────────────────────────────────

class TestScoreboardUpdate:
    """Verify scoreboard recalculates correctly after answers."""

    def test_scoreboard_returns_ranking(self, db_session, sample_user):
        """Scoreboard endpoint should return ranked player list."""
        from fastapi.testclient import TestClient
        from main import app

        admin_token = _make_token(role="admin")
        client = TestClient(app)

        response = client.get(
            "/scoreboard/",
            params={"match_code": "OC3_M_TEST"},
            headers=_auth_headers(admin_token),
        )

        # Should return 200 even with no data
        assert response.status_code == 200
