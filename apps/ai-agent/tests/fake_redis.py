"""Stub cache for tests — no Valkey required."""

from __future__ import annotations


class FakeRedis:
    def __init__(self) -> None:
        self._data: dict[str, str] = {}
        self._rates: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._data[key] = value

    async def incr(self, key: str) -> int:
        self._rates[key] = self._rates.get(key, 0) + 1
        return self._rates[key]

    async def expire(self, key: str, seconds: int) -> None:
        pass
