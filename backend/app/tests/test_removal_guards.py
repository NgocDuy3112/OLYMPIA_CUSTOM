"""
Removal guards.

These tests exist to stop deleted features from being reintroduced by accident.
Each one asserts an ABSENCE, which is unusual but deliberate: the guard fails the
moment someone re-adds email sending, password generation, the reset flow, or the
old Valkey client.

Covers:
  · EmailSettings            — removed (email sending dropped)
  · utils.email              — module deleted
  · models.password_reset_token — model deleted
  · /auth/* endpoints        — only signup, change-password, login remain
  · UserCreate.password      — now REQUIRED (no auto-generation fallback)
  · core.auth.signup         — no background_tasks parameter any more
  · valkey → redis           — old client package must not come back
"""

from __future__ import annotations

import importlib.util
import inspect
import os
import pathlib
import sys

import pytest

# Settings classes are instantiated at import time, so the environment must be
# populated before anything from the app is imported.
os.environ.setdefault("POSTGRES_DB_USER", "test")
os.environ.setdefault("POSTGRES_DB_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB_HOST", "localhost")
os.environ.setdefault("POSTGRES_DB_PORT", "5432")
os.environ.setdefault("POSTGRES_DB_NAME", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("APP_HOST", "127.0.0.1")
os.environ.setdefault("APP_PORT", "8000")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test-key")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("REDIS_USER", "default")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")

_BACKEND_APP = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_APP))


# ── Email / password-generation removal ─────────────────────────────────────

def test_email_settings_class_is_gone():
    import configs

    assert not hasattr(configs, "EmailSettings"), (
        "EmailSettings was removed with the email sender — do not reintroduce it "
        "without also restoring SMTP configuration and the credentials-email flow."
    )


def test_email_module_is_gone():
    assert importlib.util.find_spec("utils.email") is None, (
        "utils/email.py was deleted; email sending is no longer part of the app."
    )


def test_password_reset_token_model_is_gone():
    assert importlib.util.find_spec("models.password_reset_token") is None, (
        "models/password_reset_token.py was deleted with the reset flow."
    )


def test_auth_router_exposes_only_the_three_surviving_endpoints():
    import routes.auth as auth_routes

    paths = sorted(route.path for route in auth_routes.router.routes)

    assert paths == ["/auth/change-password", "/auth/login", "/auth/signup"], (
        f"unexpected /auth endpoints: {paths}. The reset/credentials endpoints "
        f"were removed deliberately."
    )

    for removed in ("send-credentials", "send-reset", "reset-password", "test-email"):
        assert not any(removed in p for p in paths), (
            f"'{removed}' endpoint reappeared — it was removed with the email sender."
        )


def test_signup_requires_a_password():
    from schemas.user import UserCreate

    with pytest.raises(Exception):
        UserCreate(user_name="no-password", role="player")

    user = UserCreate(user_name="with-password", password="secret123", role="player")
    assert user.password == "secret123", (
        "UserCreate must carry the caller-supplied password through unchanged."
    )


def test_signup_does_not_accept_background_tasks():
    from core.auth import signup

    params = list(inspect.signature(signup).parameters)
    assert params == ["user_data", "session"], (
        f"signup signature changed to {params}. It must no longer take "
        f"background_tasks — there is nothing left to send in the background."
    )


# ── Valkey → Redis ──────────────────────────────────────────────────────────

def test_redis_client_is_installed():
    assert importlib.util.find_spec("redis") is not None, (
        "the redis client package must be installed (uv sync)."
    )
    from redis.asyncio import Redis  # noqa: F401  — must be importable


def test_valkey_client_is_not_installed():
    assert importlib.util.find_spec("valkey") is None, (
        "the valkey package was replaced by redis; if it is back, some import "
        "still points at the old client."
    )


def test_redis_settings_url_uses_redis_scheme():
    from configs import RedisSettings

    url = RedisSettings().REDIS_URL
    assert url.startswith("redis://"), f"expected a redis:// URL, got {url.split(':')[0]}://"
    assert not hasattr(RedisSettings(), "VALKEY_URL"), (
        "VALKEY_URL should have been renamed to REDIS_URL."
    )
