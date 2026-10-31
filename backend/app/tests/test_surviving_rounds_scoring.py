"""
Regression tests for the SURVIVING rounds' scoring after kdc / gm / vdc removal.

Context: Khởi Động Chung (`kdc`), Giải Mã (`gm`) and Về Đích Chung (`vdc`) were
removed from the app. `core/scoreboard.py::calculate_score_event` still contains
their branches, but the rounds that remain reachable are:

    kdr (Khởi Động Riêng) → bp (Bứt Phá) → vdr (Về Đích Riêng)

These tests pin the arithmetic for the surviving rounds so a future cleanup of
the dead branches cannot silently change how the live rounds score.

Style mirrors tests/test_buzzer_race.py: heavy third-party modules are stubbed
via sys.modules, env vars are set at import time, and the DB layer is faked —
no Postgres, no Redis, no conftest.py needed.
"""

from __future__ import annotations

import os
import pathlib
import sys
import types
from types import SimpleNamespace
from typing import Any


# ── Stub third-party / infra modules BEFORE importing the code under test ────

class _HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"{status_code}: {detail}")


_fastapi = types.ModuleType("fastapi")
_fastapi.HTTPException = _HTTPException
sys.modules.setdefault("fastapi", _fastapi)

_redis_mod = types.ModuleType("redis")
_redis_asyncio = types.ModuleType("redis.asyncio")
_redis_asyncio.Redis = type("Redis", (), {})
sys.modules.setdefault("redis", _redis_mod)
sys.modules.setdefault("redis.asyncio", _redis_asyncio)

_jwt = types.ModuleType("jwt")
_jwt.PyJWTError = type("PyJWTError", (Exception,), {})
sys.modules.setdefault("jwt", _jwt)


# Stub the two utils modules scoreboard.py imports, so importing it never tries
# to build a real Redis client.
class _FakeManager:
    def __init__(self) -> None:
        self.broadcasts: list[tuple[str, dict]] = []

    async def broadcast_to_room(self, room: str, payload: dict) -> None:
        self.broadcasts.append((room, payload))


_ws_connection = types.ModuleType("utils.ws_connection")
_ws_connection.manager = _FakeManager()
sys.modules.setdefault("utils.ws_connection", _ws_connection)

_ve_dich_powers = types.ModuleType("utils.ve_dich_powers")


async def _no_used_power_records(*_args: Any, **_kwargs: Any) -> list:
    return []


_ve_dich_powers.get_used_power_records = _no_used_power_records
sys.modules.setdefault("utils.ve_dich_powers", _ve_dich_powers)


# ── Required settings are read at import time by pydantic-settings ──────────
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
# OCF is the single prefix scheme; SEASON no longer exists.
os.environ.setdefault("MATCH_CODE", "OCF_M*")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test-key")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("REDIS_USER", "default")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")

_BACKEND_APP = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_APP))


import pytest  # noqa: E402

MATCH = "OCF_M_TEST01"

# Schemas require player codes to start with "OCF_U" (schemas/scoreboard.py).
PLAYER_1 = "OCF_U_0001"
PLAYER_2 = "OCF_U_0002"
PLAYER_3 = "OCF_U_0003"
UNKNOWN_PLAYER = "OCF_U_9999"


# ── Fakes ───────────────────────────────────────────────────────────────────

class _FakeRows:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows

    def all(self) -> list[tuple]:
        return self._rows

    def __iter__(self):
        return iter(self._rows)


class _FakeSession:
    """Returns a match id, then a question, then the match's player list."""

    def __init__(self, players: list[str], question_id: int = 1) -> None:
        self.players = players
        self.question_id = question_id
        self.scalar_calls = 0

    async def scalar(self, _stmt: Any) -> Any:
        self.scalar_calls += 1
        if self.scalar_calls == 1:
            return 42  # match id
        return SimpleNamespace(id=self.question_id)  # question

    async def execute(self, _stmt: Any) -> _FakeRows:
        return _FakeRows([(p,) for p in self.players])


class _FakeRedis:
    """Only the two operations calculate_score_event touches for kdr."""

    def __init__(self, attempts: Any = None) -> None:
        self.attempts = attempts
        self.incr_log: list[str] = []
        self.get_log: list[str] = []

    async def get(self, key: str) -> Any:
        self.get_log.append(key)
        return self.attempts

    async def incr(self, key: str) -> int:
        self.incr_log.append(key)
        return 1


@pytest.fixture()
def scoreboard(monkeypatch):
    """Import the module and capture scoring writes instead of hitting the DB."""
    import core.scoreboard as sb

    written: list[tuple[str, int]] = []

    async def fake_update(req: Any, _redis: Any, _session: Any) -> None:
        written.append((req.user_code, req.points))

    async def fake_scoreboard(*_args: Any, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(sb, "update_player_question_score", fake_update)
    monkeypatch.setattr(sb, "get_scoreboard_for_a_match_from_db", fake_scoreboard)
    sb.written = written  # type: ignore[attr-defined]
    return sb


def _request(sb, action: str, question_code: str, user_codes: list[str]):
    return sb.ScoreEventRequest(
        match_code=MATCH,
        question_code=question_code,
        action=action,
        user_codes=user_codes,
    )


# ── KDR — Khởi Động Riêng ───────────────────────────────────────────────────
# 10 pts on the first correct answer, 5 after one wrong attempt, 0 after two.

@pytest.mark.asyncio
async def test_kdr_correct_first_attempt_scores_10(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1, PLAYER_2])
    redis = _FakeRedis(attempts=None)

    await sb.calculate_score_event(
        _request(sb, "kdr_correct", "OCF_Q_KD_1_1", [PLAYER_1]), redis, session
    )

    assert sb.written == [(PLAYER_1, 10)], (
        f"first-attempt correct answer must score 10, got {sb.written}"
    )


@pytest.mark.asyncio
async def test_kdr_correct_after_one_wrong_scores_5(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])
    redis = _FakeRedis(attempts="1")

    await sb.calculate_score_event(
        _request(sb, "kdr_correct", "OCF_Q_KD_1_1", [PLAYER_1]), redis, session
    )

    assert sb.written == [(PLAYER_1, 5)], (
        f"correct answer after one wrong attempt must score 5, got {sb.written}"
    )


@pytest.mark.asyncio
async def test_kdr_correct_after_two_wrong_scores_0(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])
    redis = _FakeRedis(attempts="2")

    await sb.calculate_score_event(
        _request(sb, "kdr_correct", "OCF_Q_KD_1_1", [PLAYER_1]), redis, session
    )

    # Zero-point writes are skipped entirely, so nothing should be recorded.
    assert sb.written == [], (
        f"a third attempt must score 0 and be skipped entirely, got {sb.written}"
    )


@pytest.mark.asyncio
async def test_kdr_correct_requires_exactly_one_player(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1, PLAYER_2])
    redis = _FakeRedis(attempts=None)

    with pytest.raises(_HTTPException) as excinfo:
        await sb.calculate_score_event(
            _request(sb, "kdr_correct", "OCF_Q_KD_1_1", [PLAYER_1, PLAYER_2]),
            redis,
            session,
        )

    assert excinfo.value.status_code == 422, (
        "kdr_correct must reject multiple players with 422"
    )


@pytest.mark.asyncio
async def test_kdr_wrong_increments_attempts_without_scoring(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])
    redis = _FakeRedis(attempts=None)

    await sb.calculate_score_event(
        _request(sb, "kdr_wrong", "OCF_Q_KD_1_1", [PLAYER_1]), redis, session
    )

    assert len(redis.incr_log) == 1, (
        f"kdr_wrong must increment the attempt counter once, got {redis.incr_log}"
    )
    assert "score:kdr:attempts" in redis.incr_log[0], (
        f"unexpected counter key: {redis.incr_log[0]}"
    )
    assert sb.written == [], "kdr_wrong must not write any points"


# ── VDR — Về Đích Riêng ─────────────────────────────────────────────────────
# Points come from the trailing number of the question code, ± for correct/wrong.

@pytest.mark.asyncio
async def test_vdr_correct_awards_points_from_question_code(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1, PLAYER_2, PLAYER_3])
    redis = _FakeRedis()

    await sb.calculate_score_event(
        _request(sb, "vdr_correct", "OCF_Q_VD_TTTK_20", [PLAYER_1, PLAYER_3]),
        redis,
        session,
    )

    assert sb.written == [(PLAYER_1, 20), (PLAYER_3, 20)], (
        f"vdr_correct must award +20 to each named player, got {sb.written}"
    )


@pytest.mark.asyncio
async def test_vdr_wrong_deducts_points_from_question_code(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])
    redis = _FakeRedis()

    await sb.calculate_score_event(
        _request(sb, "vdr_wrong", "OCF_Q_VD_TTTK_30", [PLAYER_1]), redis, session
    )

    assert sb.written == [(PLAYER_1, -30)], (
        f"vdr_wrong must deduct 30, got {sb.written}"
    )


@pytest.mark.asyncio
async def test_vdr_points_require_numeric_suffix(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])
    redis = _FakeRedis()

    with pytest.raises(_HTTPException) as excinfo:
        await sb.calculate_score_event(
            _request(sb, "vdr_correct", "OCF_Q_VD_TTTK", [PLAYER_1]), redis, session
        )

    assert excinfo.value.status_code == 422, (
        "a Về Đích question code without a trailing number must be rejected with 422"
    )


# ── Guard rails ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_action_is_rejected(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])
    redis = _FakeRedis()

    with pytest.raises(_HTTPException) as excinfo:
        await sb.calculate_score_event(
            _request(sb, "not_a_real_action", "OCF_Q_KD_1_1", [PLAYER_1]),
            redis,
            session,
        )

    assert excinfo.value.status_code == 422, (
        "an unrecognised score action must be rejected with 422"
    )


@pytest.mark.asyncio
async def test_players_outside_the_match_are_rejected(scoreboard):
    sb = scoreboard
    session = _FakeSession(players=[PLAYER_1])  # only PLAYER_1 is in the match
    redis = _FakeRedis(attempts=None)

    with pytest.raises(_HTTPException) as excinfo:
        await sb.calculate_score_event(
            _request(sb, "kdr_correct", "OCF_Q_KD_1_1", [UNKNOWN_PLAYER]),
            redis,
            session,
        )

    assert excinfo.value.status_code == 422, (
        "a user_code that is not a player in this match must be rejected"
    )
