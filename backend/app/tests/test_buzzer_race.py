
from __future__ import annotations

import asyncio
import os
import sys
import types
from typing import Any


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


import os
import pathlib
_BACKEND_APP = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_APP))


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


        col = None
        try:
            cols = list(getattr(stmt, "column_descriptions", []) or [])
            if cols:
                col = cols[0].get("entity") or cols[0].get("type")
        except Exception:
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


        return _FakeResult(None)

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None

    async def refresh(self, _obj: Any) -> None:
        return None

    def add(self, _obj: Any) -> None:


        return None


def _build_request(user_code: str, question_code: str = "OC3_Q_VD_TTTK_20") -> Any:
    return types.SimpleNamespace(
        match_code="OC3_M12",
        user_code=user_code,
        question_code=question_code,
        answer_text="x",
        has_buzzed=True,
        timestamp=None,
    )


async def _run_two_consecutive_buzzes() -> tuple[str, str]:


    from core.answer import post_answer_to_db
    from fastapi import HTTPException

    valkey = _FakeValkey()
    session_A = _FakeSession()
    session_A._set_player(session_A.player_id)
    session_B = _FakeSession()
    session_B._set_player(session_B.player_id_2)


    first_status = "unknown"
    try:
        await post_answer_to_db(_build_request("OC_U_3004"), session_A, valkey)
        first_status = "201"
    except HTTPException as exc:
        first_status = f"{exc.status_code}"


    lock_still_held = bool(any(k.startswith("buzzer_lock:") for k in valkey.store))


    second_status = "unknown"
    try:
        await post_answer_to_db(_build_request("OC_U_3005"), session_B, valkey)
        second_status = "201"
    except HTTPException as exc:
        second_status = f"{exc.status_code}"


    winner_count = sum(
        1
        for _channel, payload in valkey.publish_log
        if '"buzzer_winner"' in payload
    )


    print(
        f"\n[prod repro] first_status={first_status} "
        f"second_status={second_status} "
        f"lock_held_after_first={lock_still_held} "
        f"buzzer_winner_publishes={winner_count}"
    )

    return first_status, second_status


def test_prod_buzzer_race_lock_is_held():
    first, second = asyncio.run(_run_two_consecutive_buzzes())
    assert first == "201", f"first buzz should win, got {first}"
    assert second == "409", (
        f"second buzz must lose the race (409) per the 2026-06-28 fix; "
        f"got {second}. The buzzer lock is being released too early — "
        f"see the prod incident note in core/answer.py::post_answer_to_db."
    )


def test_prod_buzzer_race_single_winner_event():
    _first, second = asyncio.run(_run_two_consecutive_buzzes())
    assert second == "409", "second buzz must be 409"


    valkey = _FakeValkey()
    session_A = _FakeSession()
    session_A._set_player(session_A.player_id)
    session_B = _FakeSession()
    session_B._set_player(session_B.player_id_2)

    from core.answer import post_answer_to_db
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
