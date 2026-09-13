"""Adapter: hot match state from Valkey.

Key contract MUST match apps/api/src/state/match-state.ts:
- snapshot:{matchCode} hash, JSON-serialized fields, TTL 3h
"""

from __future__ import annotations

import json

import redis.asyncio as redis

SNAPSHOT_PREFIX = "snapshot:"


class ValkeySnapshotRepo:
    def __init__(self, client: redis.Redis) -> None:
        self._client = client

    async def get_snapshot(self, match_code: str) -> dict | None:
        raw = await self._client.hgetall(f"{SNAPSHOT_PREFIX}{match_code}")
        if not raw:
            return None
        snapshot: dict = {}
        for field, value in raw.items():
            key = field.decode() if isinstance(field, bytes) else field
            text = value.decode() if isinstance(value, bytes) else value
            try:
                snapshot[key] = json.loads(text)
            except (json.JSONDecodeError, TypeError):
                snapshot[key] = text
        return snapshot
