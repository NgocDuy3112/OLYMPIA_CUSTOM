"""Regression test for the prod buzzer-race bug (2026-06-28).

Symptom
-------
Two players buzz within ~150 ms of each other. The first player's buzz
correctly wins (``buzzer_winner`` published, ``buzzer_lock`` set with
10 s TTL). The second player's buzz ALSO wins — backend returns 201
instead of 409. The room sees two ``buzzer_winner`` events for the
same ``question_code`` and the Zap icon flips between the two players.

Root cause
----------
``backend/app/core/answer.py::post_answer_to_db`` released the Valkey
buzzer lock IMMEDIATELY after publishing the winner (the comment said
"so the answering window can be reopened by clear_buzz"). That meant
the lock was held only for the duration of one DB commit + two Valkey
publishes — typically <50 ms. By the time the second player's POST
arrived, the lock was already gone and ``HSETNX`` would have happily
written a second ``buzzer_winner``.

Fix
---
Removed the early release. The success path now sets
``buzzer_lock_token = None`` before returning so the ``finally`` block
does NOT release the lock — the lock lives for the full 10 s TTL
(or until ``apply_buzzer_clear`` deletes it on the admin's
``clear_buzz`` button). Exception paths still release so a crashed
backend worker doesn't lock the question for the full 10 s.

What this test verifies
-----------------------
With the fix, the sequence below yields a 409 on the second buzz,
NOT a 201. We mock Valkey + DB session so we don't need a live
backend / Postgres / Valkey container to repro the race.
"""

from __future__ import annotations

import asyncio
import os
import sys
import types
from typing import Any

# ── Stub heavy deps that ``post_answer_to_db`` imports ──────────────────
# We don't actually need a live valkey-py / fastapi here — only the
# attribute access patterns. ``post_answer_to_db`` imports them
# transitively through ``models.answer`` etc.; we replace them with
# lightweight stubs that satisfy attribute lookups without side effects.
#
# Note: real packages (sqlalchemy, valkey, pydantic-settings) are
# installed in the test environment via ``requirements.txt``. The
# stubs below are belt-and-suspenders for cases where a developer
# runs the test without those installed.

class _HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"{status_code}: {detail}")

_fastapi = types.ModuleType("fastapi")
_fastapi.WebSocket = type("WebSocket", (), {})
_fastapi.WebSocketDisconnect = type("WebSocketDisconnect", (Exception,), {})
_fastapi.HTTPException = _HTTPException
sys.modules.setdefault("fastapi", _fastapi)

_valkey_mod = types.ModuleType("valkey")
_valkey_asyncio = types.ModuleType("valkey.asyncio")
_valkey_asyncio.Valkey = type("Valkey", (), {})
sys.modules.setdefault("valkey", _valkey_mod)
sys.modules.setdefault("valkey.asyncio", _valkey_asyncio)

_jwt = types.ModuleType("jwt")
_jwt.PyJWTError = type("PyJWTError", (Exception,), {})
sys.modules.setdefault("jwt", _jwt)

# ── Provide minimal env so ``configs.PostgreSQLSettings`` can be built ──
# The pydantic-settings model requires the five POSTGRES_DB_* vars.
# We never actually open a connection — we stub ``create_async_engine``
# before ``dependencies.postgresql_db`` imports it — but the settings
# instance must still construct cleanly.
os.environ.setdefault("POSTGRES_DB_USER", "test")
os.environ.setdefault("POSTGRES_DB_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB_HOST", "localhost")
os.environ.setdefault("POSTGRES_DB_PORT", "5432")
os.environ.setdefault("POSTGRES_DB_NAME", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("APP_HOST", "127.0.0.1")
os.environ.setdefault("APP_PORT", "8000")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")

# ── Stub the heavy external deps that ``post_answer_to_db`` imports ───────
# We don't actually need a live valkey-py / fastapi here — only the
# attribute access patterns. ``post_answer_to_db`` imports them
# transitively through ``models.answer`` etc.; we replace them with
# lightweight stubs that satisfy attribute lookups without side effects.

_fastapi = types.ModuleType("fastapi")
_fastapi.WebSocket = type("WebSocket", (), {})
_fastapi.WebSocketDisconnect = type("WebSocketDisconnect", (Exception,), {})
sys.modules.setdefault("fastapi", _fastapi)

_valkey_mod = types.ModuleType("valkey")
_valkey_asyncio = types.ModuleType("valkey.asyncio")
_valkey_asyncio.Valkey = type("Valkey", (), {})
sys.modules.setdefault("valkey", _valkey_mod)
sys.modules.setdefault("valkey.asyncio", _valkey_asyncio)

_jwt = types.ModuleType("jwt")
_jwt.PyJWTError = type("PyJWTError", (Exception,), {})
sys.modules.setdefault("jwt", _jwt)

# Bring backend.app onto the import path.
import os
import pathlib
_BACKEND_APP = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_APP))


# ── Mocks ──────────────────────────────────────────────────────────────────
class _FakeResult:
    def __init__(self, value: Any = None) -> None:
        self._value = value

    def scalars(self) -> "_FakeResult":
        return self

    def first(self) -> Any:
        return self._value

    def scalar(self) -> Any:
        return self._value


class _FakeScalarResult:
    def __init__(self, value: Any) -> None:
        self._value = value

    async def scalar(self) -> Any:
        return self._value

    async def execute(self, *_args: Any, **_kw: Any) -> _FakeResult:
        return _FakeResult(self._value)


class _FakeValkey:
    """Minimal async Valkey stub covering SET-NX-EX, HSETNX, HGETALL,
    PUBLISH, EVAL. Used to repro the lock lifecycle in isolation."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.publish_log: list[tuple[str, str]] = []

    async def set(self, key: str, value: str, nx: bool = False, ex: Any = None) -> Any:
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    async def get(self, key: str) -> Any:
        return self.store.get(key)

    async def eval(self, script: str, num_keys: int, key: str, token: str) -> int:
        # Mimics the buzzer_lock release Lua: DEL only if value matches token.
        if self.store.get(key) == token:
            del self.store[key]
            return 1
        return 0

    async def publish(self, channel: str, message: str) -> int:
        self.publish_log.append((channel, message))
        return 1

    async def hsetnx(self, *_args: Any, **_kw: Any) -> bool:
        return True

    async def hgetall(self, *_args: Any, **_kw: Any) -> dict[str, str]:
        return {}

    async def hset(self, *_args: Any, **_kw: Any) -> int:
        return 1

    async def expire(self, *_args: Any, **_kw: Any) -> bool:
        return True

    async def delete(self, *_args: Any, **_kw: Any) -> int:
        return 0


class _FakeSession:
    """Stub for an AsyncSession. Lets the lookup queries return whatever
    the caller pre-loaded, and short-circuits the INSERT / commit cycle.

    The ``scalar()`` coroutine must accept the SA ``select(...)`` stmt as
    a positional arg and return a scalar; we route the result based on
    the SELECT target's column name so ``select(Match.id)`` /
    ``select(User.id)`` / ``select(Question.id)`` all return distinct
    UUIDs and ``select(Answer.id).where(...).where(...).where(...)``
    returns ``None`` (no existing buzz yet).
    """

    def __init__(
        self,
        match_id: str = "m-uuid",
        player_id: str = "p-uuid-A",
        player_id_2: str = "p-uuid-B",
        question_id: str = "q-uuid",
    ) -> None:
        self.match_id = match_id
        self.player_id = player_id
        self.player_id_2 = player_id_2
        self.question_id = question_id
        self._current_player_id = player_id

    def _set_player(self, pid: str) -> None:
        self._current_player_id = pid

    async def scalar(self, stmt: Any = None) -> Any:
        # Inspect the statement to decide which fake ID to return.
        # SQLAlchemy ``select(...)`` statements expose ``_raw_columns`` /
        # ``column_descriptions``; we duck-type on the type name to keep
        # this robust against SA version churn.
        col = None
        try:
            cols = list(getattr(stmt, "column_descriptions", []) or [])
            if cols:
                col = cols[0].get("entity") or cols[0].get("type")
        except Exception:  # noqa: BLE001
            col = None
        name = getattr(col, "__name__", "") if col is not None else ""
        if name == "Match":
            return self.match_id
        if name == "User":
            return self._current_player_id
        if name == "Question":
            return self.question_id
        return None

    async def execute(self, _stmt: Any) -> _FakeResult:
        # ``select(Answer).where(...).where(...).where(...)`` returns no
        # rows (no existing buzz); ``select(Answer.id).where(...)`` also
        # returns no row. We just return an empty result wrapper.
        return _FakeResult(None)

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None

    async def refresh(self, _obj: Any) -> None:
        return None

    def add(self, _obj: Any) -> None:
        # ``session.add(new_answer)`` is the only place that mutates
        # session state in the success path — and the test doesn't care
        # about the resulting row, just whether the publish step runs.
        return None


def _build_request(user_code: str, question_code: str = "OC3_Q_VD_TTTK_20") -> Any:
    """Mimics ``schemas.answer.AnswerPostRequest`` with only the fields
    ``post_answer_to_db`` reads."""
    return types.SimpleNamespace(
        match_code="OC3_M12",
        user_code=user_code,
        question_code=question_code,
        answer_text="x",
        has_buzzed=True,
        timestamp=None,
    )


# ── Test ───────────────────────────────────────────────────────────────────
async def _run_two_consecutive_buzzes() -> tuple[str, str]:
    """Reproduce the prod sequence:
      T0: OC_U_3004 buzzes → 201 winner
      T0+150 ms: OC_U_3005 buzzes again → MUST be 409 with the fix.

    Returns ``(status_for_first, status_for_second)``.
    """

    # Import lazily so the stubs above are in place first.
    from core.answer import post_answer_to_db  # noqa: WPS433 (test-time import)
    from fastapi import HTTPException

    valkey = _FakeValkey()
    session_A = _FakeSession()  # OC_U_3004 path
    session_A._set_player(session_A.player_id)
    session_B = _FakeSession()  # OC_U_3005 path
    session_B._set_player(session_B.player_id_2)

    # First buzz — OC_U_3004.
    first_status = "unknown"
    try:
        await post_answer_to_db(_build_request("OC_U_3004"), session_A, valkey)
        first_status = "201"
    except HTTPException as exc:
        first_status = f"{exc.status_code}"

    # Verify lock is still held after the winner returned.
    # (Pre-fix: lock was released; post-fix: lock remains until TTL.)
    lock_still_held = bool(any(k.startswith("buzzer_lock:") for k in valkey.store))

    # Second buzz — OC_U_3005, ~150 ms later.
    second_status = "unknown"
    try:
        await post_answer_to_db(_build_request("OC_U_3005"), session_B, valkey)
        second_status = "201"
    except HTTPException as exc:
        second_status = f"{exc.status_code}"

    # Also check: how many ``buzzer_winner`` events got published? With
    # the fix there must be exactly one. Pre-fix there were two.
    winner_count = sum(
        1
        for _channel, payload in valkey.publish_log
        if '"buzzer_winner"' in payload
    )

    # Print summary so a human running pytest -s sees the repro clearly.
    print(
        f"\n[prod repro] first_status={first_status} "
        f"second_status={second_status} "
        f"lock_held_after_first={lock_still_held} "
        f"buzzer_winner_publishes={winner_count}"
    )

    return first_status, second_status


def test_prod_buzzer_race_lock_is_held():
    """Post-fix invariant: after the winner returned, the lock is still
    held, so the second buzzer gets a 409 instead of a 201."""
    first, second = asyncio.run(_run_two_consecutive_buzzes())
    assert first == "201", f"first buzz should win, got {first}"
    assert second == "409", (
        f"second buzz must lose the race (409) per the 2026-06-28 fix; "
        f"got {second}. The buzzer lock is being released too early — "
        f"see the prod incident note in core/answer.py::post_answer_to_db."
    )


def test_prod_buzzer_race_single_winner_event():
    """Post-fix invariant: exactly one ``buzzer_winner`` event is published
    for the same ``(match, question)`` pair, regardless of how many
    players spam the buzz button."""
    _first, second = asyncio.run(_run_two_consecutive_buzzes())
    assert second == "409", "second buzz must be 409"
    # The publish_log is captured in a fresh Valkey instance each call;
    # re-run with a single shared instance to count publishes.
    valkey = _FakeValkey()
    session_A = _FakeSession()
    session_A._set_player(session_A.player_id)
    session_B = _FakeSession()
    session_B._set_player(session_B.player_id_2)

    from core.answer import post_answer_to_db  # noqa: WPS433
    from fastapi import HTTPException

    async def _both() -> None:
        try:
            await post_answer_to_db(_build_request("OC_U_3004"), session_A, valkey)
        except HTTPException:
            pass
        try:
            await post_answer_to_db(_build_request("OC_U_3005"), session_B, valkey)
        except HTTPException:
            pass

    asyncio.run(_both())
    winner_publishes = sum(
        1 for _ch, p in valkey.publish_log if '"buzzer_winner"' in p
    )
    assert winner_publishes == 1, (
        f"exactly one buzzer_winner event must be published for a "
        f"single question; got {winner_publishes}. Pre-fix this was 2."
    )
