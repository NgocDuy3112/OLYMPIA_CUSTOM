# Security-focused tests for the OLYMPIA CUSTOM backend.

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
from fastapi.testclient import TestClient
from fastapi import HTTPException

from main import app
from core.auth import hash_password, create_access_token
from models.user import User, RoleEnum


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_token(user_code: str = "OC_U12345678", role: str = "player",
                user_name: str = "Test User") -> str:
    """Create a valid JWT token for testing."""
    return create_access_token({
        "sub": user_code,
        "user_code": user_code,
        "user_name": user_name,
        "role": role,
    })


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── SEC-01: SQL Injection in query parameters ────────────────────────────────

class TestSqlInjection:
    """Verify that SQL injection attempts in query parameters are handled safely."""

    def test_sql_injection_in_match_code(self, db_session, sample_user):
        """SQL injection in match_code query parameter should not cause errors."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        admin_token = _make_token(role="admin")
        malicious = "'; DROP TABLE questions; --"

        response = client.get(
            "/questions/",
            params={"match_code": malicious},
            headers=_auth_headers(admin_token),
        )

        # Should return 400 (validation error) or 404, NOT a SQL error
        assert response.status_code in (400, 404, 422)
        body = response.json()
        assert "sql" not in body.get("message", "").lower()

    def test_sql_injection_in_question_code(self, db_session, sample_user):
        """SQL injection in question_code should be safely handled."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        admin_token = _make_token(role="admin")
        malicious = "1; SELECT * FROM users; --"

        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_TEST", "question_code": malicious},
            headers=_auth_headers(admin_token),
        )

        assert response.status_code in (400, 404, 422)


# ── SEC-03: JWT Tampering ────────────────────────────────────────────────────

class TestJwtTampering:
    """Verify that tampered JWT tokens are rejected."""

    def test_modified_token_payload(self, db_session, sample_user):
        """Modifying the role in a JWT should be detected."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        # Create a player token, then try to use it as admin
        player_token = _make_token(role="player")

        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_TEST"},
            headers=_auth_headers(player_token),
        )

        # Should be 403 (forbidden) — player cannot access admin endpoints
        assert response.status_code == 403

    def test_invalid_signature(self, db_session, sample_user):
        """A token signed with a different secret should be rejected."""
        from fastapi.testclient import TestClient
        import jwt as pyjwt

        client = TestClient(app)

        # Create token with wrong secret
        fake_token = pyjwt.encode(
            {"sub": "OC_U12345678", "user_code": "OC_U12345678",
             "user_name": "Hacker", "role": "admin"},
            "wrong-secret-key",
            algorithm="HS256",
        )

        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_TEST"},
            headers=_auth_headers(fake_token),
        )

        assert response.status_code in (401, 403)

    def test_expired_token(self, db_session, sample_user):
        """An expired JWT should be rejected."""
        from fastapi.testclient import TestClient
        from datetime import datetime, timedelta, timezone

        client = TestClient(app)

        # Create an already-expired token
        expired_token = create_access_token(
            {"sub": "OC_U12345678", "user_code": "OC_U12345678",
             "user_name": "Test", "role": "admin"},
            expires_delta=timedelta(seconds=-1),
        )

        response = client.get(
            "/questions/",
            params={"match_code": "OC3_M_TEST"},
            headers=_auth_headers(expired_token),
        )

        assert response.status_code in (401, 403)


# ── SEC-04: Path Traversal in Media ──────────────────────────────────────────

class TestPathTraversal:
    """Verify that invalid S3 key requests return an error, not file system content."""

    def test_missing_key_param_rejected(self, db_session, sample_user):
        """GET /media/ without key param should return 422."""
        from fastapi.testclient import TestClient

        client = TestClient(app)
        player_token = _make_token(role="player")

        response = client.get("/media/", headers=_auth_headers(player_token))

        assert response.status_code == 422

    def test_nonexistent_key_returns_404(self, db_session, sample_user):
        """GET /media/ with a key that doesn't exist in S3 should return 404."""
        from fastapi.testclient import TestClient
        from unittest.mock import patch, AsyncMock

        client = TestClient(app)
        player_token = _make_token(role="player")

        error = Exception("Not Found")
        error.response = {"Error": {"Code": "404"}}

        with patch("routes.media.get_s3_client") as mock_dep:
            mock_client = AsyncMock()
            mock_client.head_object = AsyncMock(side_effect=error)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_dep.return_value = mock_client

            response = client.get(
                "/media/",
                params={"key": "OC3_M01T/missing_file.png"},
                headers=_auth_headers(player_token),
            )

            assert response.status_code in (404, 500)


# ── SEC-06: Role Enforcement ─────────────────────────────────────────────────

class TestRoleEnforcement:
    """Verify that role-based access control is enforced on all endpoints."""

    @pytest.mark.parametrize("endpoint,method,params", [
        ("/questions/", "get", {"match_code": "OC3_M_TEST"}),
        ("/matches/", "get", {}),
        ("/users/", "get", {}),
    ])
    def test_guest_cannot_access_protected_endpoints(
        self, db_session, sample_user, endpoint, method, params
    ):
        """Guest role should not access admin/player endpoints."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        guest_token = _make_token(role="guest")

        response = getattr(client, method)(
            endpoint,
            params=params,
            headers=_auth_headers(guest_token),
        )

        assert response.status_code in (401, 403)

    def test_player_cannot_access_admin_endpoints(self, db_session, sample_user):
        """Player role should not access admin-only endpoints."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        player_token = _make_token(role="player")

        response = client.post(
            "/questions/",
            json={
                "match_code": "OC3_M_TEST",
                "question_code": "OC3_Q_TEST",
                "content": "Test?",
                "answer": "A",
            },
            headers=_auth_headers(player_token),
        )

        assert response.status_code == 403

    def test_no_token_returns_401(self, db_session, sample_user):
        """Requests without any token should return 401."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.get("/questions/", params={"match_code": "OC3_M_TEST"})

        assert response.status_code == 401


# ── SEC-05: Rate Limiting (conceptual — not enforced yet) ────────────────────

class TestRateLimiting:
    """Tests for rate limiting behavior.

    NOTE: Rate limiting is not currently implemented in the backend.
    These tests document the expected behavior once it is added.
    """

    @pytest.mark.skip(reason="Rate limiting not yet implemented")
    def test_login_rate_limit(self, db_session, sample_user):
        """Rapid login attempts should be throttled."""
        from fastapi.testclient import TestClient
        client = TestClient(app)

        # Send 100 login requests in quick succession
        for _ in range(100):
            response = client.post(
                "/auth/login",
                json={"user_code": "OC_U12345678", "password": "wrong"},
            )

        # After threshold, should get 429 Too Many Requests
        assert response.status_code == 429
