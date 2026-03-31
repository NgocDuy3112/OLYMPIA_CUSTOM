#!/usr/bin/env python3
"""Load test script for the Qualifier round with concurrent players.

Simulates N players connecting via WebSocket, sending answers, and
measuring server response times.

Usage:
    pip install websockets aiohttp
    python scripts/load_test_qualifier.py

Configuration (edit constants below or use CLI args):
    --users       Number of concurrent players (default: 300)
    --match-code  Match code to connect to (default: OC3_M_VL)
    --base-url    Backend base URL (default: http://localhost:8000)
    --ws-url      WebSocket base URL (default: ws://localhost:8000)
    --ramp-up     Seconds to stagger connections (default: 5)
"""

import argparse
import asyncio
import json
import random
import statistics
import time
from dataclasses import dataclass, field
from typing import Any

import aiohttp
import websockets


# ── Configuration ────────────────────────────────────────────────────────────

DEFAULT_USERS = 300
DEFAULT_MATCH_CODE = "OC3_M_VL"
DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_WS_URL = "ws://localhost:8000"
DEFAULT_RAMP_UP = 5  # seconds to stagger all connections
DEFAULT_PASSWORD = "loadtest123"
USER_CODE_PREFIX = "OC_U_LT"  # "LT" = load test


# ── Metrics ──────────────────────────────────────────────────────────────────

@dataclass
class Metrics:
    """Collects latency and error metrics across all simulated users."""
    connect_times: list[float] = field(default_factory=list)
    answer_times: list[float] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    connected: int = 0
    answered: int = 0

    def report(self, total_users: int) -> None:
        print("\n" + "=" * 60)
        print(f"  LOAD TEST REPORT  ({total_users} users)")
        print("=" * 60)

        print(f"\n  Connections:  {self.connected}/{total_users} succeeded")
        if self.connect_times:
            self._print_latency("Connect", self.connect_times)

        print(f"\n  Answers:      {self.answered}/{self.connected} succeeded")
        if self.answer_times:
            self._print_latency("Answer", self.answer_times)

        if self.errors:
            print(f"\n  Errors ({len(self.errors)}):")
            # Show unique error types with counts
            from collections import Counter
            for err, count in Counter(self.errors).most_common(10):
                print(f"    [{count}x] {err}")

        print("\n" + "=" * 60)

    @staticmethod
    def _print_latency(label: str, times: list[float]) -> None:
        sorted_t = sorted(times)
        p50 = sorted_t[len(sorted_t) // 2]
        p95 = sorted_t[int(len(sorted_t) * 0.95)]
        p99 = sorted_t[int(len(sorted_t) * 0.99)]
        avg = statistics.mean(times)
        print(f"    {label:8s}  avg={avg:.3f}s  p50={p50:.3f}s  "
              f"p95={p95:.3f}s  p99={p99:.3f}s  min={min(times):.3f}s  "
              f"max={max(times):.3f}s")


metrics = Metrics()


# ── Helpers ──────────────────────────────────────────────────────────────────

async def create_user(session: aiohttp.ClientSession, user_code: str,
                      base_url: str) -> str | None:
    """Register a test user and return the access token."""
    try:
        async with session.post(
            f"{base_url}/auth/signup",
            json={
                "user_name": f"LoadTest {user_code}",
                "user_code": user_code,
                "password": DEFAULT_PASSWORD,
                "role": "player",
            },
        ) as resp:
            if resp.status in (201, 200):
                data = await resp.json()
                return data.get("data", {}).get("access_token")
            # User may already exist — try login
            if resp.status == 400:
                return await login_user(session, user_code, base_url)
            return None
    except Exception:
        return None


async def login_user(session: aiohttp.ClientSession, user_code: str,
                     base_url: str) -> str | None:
    """Login an existing test user and return the access token."""
    try:
        async with session.post(
            f"{base_url}/auth/login",
            json={
                "user_code": user_code,
                "password": DEFAULT_PASSWORD,
            },
        ) as resp:
            if resp.status in (200, 201):
                data = await resp.json()
                return data.get("data", {}).get("access_token")
            return None
    except Exception:
        return None


async def simulate_player(
    user_index: int,
    match_code: str,
    ws_url: str,
    base_url: str,
    semaphore: asyncio.Semaphore,
) -> None:
    """Simulate a single player: connect → answer → disconnect."""
    user_code = f"{USER_CODE_PREFIX}{user_index:04d}"
    token: str | None = None

    # ── Step 1: Get JWT token ────────────────────────────────────────────
    async with aiohttp.ClientSession() as session:
        token = await create_user(session, user_code, base_url)
        if not token:
            token = await login_user(session, user_code, base_url)

    if not token:
        metrics.errors.append(f"Auth failed: {user_code}")
        return

    # ── Step 2: Connect WebSocket ────────────────────────────────────────
    ws_uri = f"{ws_url}/ws/{match_code}"
    t0 = time.monotonic()
    try:
        async with semaphore:
            async with websockets.connect(
                ws_uri,
                additional_headers={"Authorization": f"Bearer {token}"},
                ping_interval=None,  # disable ping for load test
            ) as ws:
                connect_ms = (time.monotonic() - t0) * 1000
                metrics.connect_times.append(connect_ms)
                metrics.connected += 1

                # Small random delay to simulate human thinking
                await asyncio.sleep(random.uniform(0.5, 2.0))

                # ── Step 3: Send answer ────────────────────────────────────
                answer_text = random.choice(["A", "B", "C", "D", "E", "F"])
                t1 = time.monotonic()
                await ws.send(json.dumps({
                    "type": "answer",
                    "user_code": user_code,
                    "content": answer_text,
                    "timestamp": int(time.time() * 1000),
                }))

                # Wait for server acknowledgment (timeout 5s)
                try:
                    resp = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    answer_ms = (time.monotonic() - t1) * 1000
                    metrics.answer_times.append(answer_ms)
                    metrics.answered += 1
                except asyncio.TimeoutError:
                    metrics.errors.append(f"Answer timeout: {user_code}")

    except websockets.exceptions.InvalidStatusCode as exc:
        metrics.errors.append(f"WS connect {exc.status_code}: {user_code}")
    except Exception as exc:
        metrics.errors.append(f"WS error: {user_code} ({exc})")


# ── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    parser = argparse.ArgumentParser(description="Qualifier round load test")
    parser.add_argument("--users", type=int, default=DEFAULT_USERS,
                        help=f"Number of concurrent players (default: {DEFAULT_USERS})")
    parser.add_argument("--match-code", default=DEFAULT_MATCH_CODE,
                        help=f"Match code (default: {DEFAULT_MATCH_CODE})")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"Backend URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--ws-url", default=DEFAULT_WS_URL,
                        help=f"WebSocket URL (default: {DEFAULT_WS_URL})")
    parser.add_argument("--ramp-up", type=float, default=DEFAULT_RAMP_UP,
                        help=f"Seconds to stagger connections (default: {DEFAULT_RAMP_UP})")
    args = parser.parse_args()

    n_users: int = args.users
    match_code: str = args.match_code
    base_url: str = args.base_url.rstrip("/")
    ws_url: str = args.ws_url.rstrip("/")
    ramp_up: float = args.ramp_up

    print(f"Starting load test: {n_users} users, match={match_code}")
    print(f"  Backend: {base_url}")
    print(f"  WebSocket: {ws_url}")
    print(f"  Ramp-up: {ramp_up}s")
    print()

    # Limit concurrent connections to avoid overwhelming the local machine
    # (server-side concurrency is still n_users)
    semaphore = asyncio.Semaphore(n_users)

    stagger = ramp_up / n_users if n_users > 0 else 0
    tasks: list[asyncio.Task[None]] = []

    t_start = time.monotonic()
    for i in range(1, n_users + 1):
        task = asyncio.create_task(
            simulate_player(i, match_code, ws_url, base_url, semaphore)
        )
        tasks.append(task)
        if stagger > 0:
            await asyncio.sleep(stagger)

    # Wait for all players to finish
    await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.monotonic() - t_start

    metrics.report(n_users)
    print(f"\n  Total wall time: {elapsed:.1f}s")
    if elapsed > 0:
        print(f"  Throughput:      {n_users / elapsed:.1f} users/sec")


if __name__ == "__main__":
    asyncio.run(main())
