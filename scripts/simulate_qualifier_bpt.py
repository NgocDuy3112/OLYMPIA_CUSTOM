#!/usr/bin/env python3
"""
simulate_qualifier_bpt.py — Bot players simulate nhiều người cùng lúc.

Cải tiến so với simulate_qualifier_bot.py:
  • Login N players SONG SONG (asyncio.gather) — không chờ từng người
  • Connect WebSocket N players SONG SONG
  • Trả lời SONG SONG với delay ngẫu nhiên mỗi người
  • Reconnect tự động nếu WS bị ngắt
  • In progress bar khi đăng nhập / kết nối

Luồng hoạt động:
  Admin điều khiển UI bình thường:
    BẮT ĐẦU VÒNG → chọn câu → BẤM GIỜ (bots tự trả lời) → TÍNH ĐIỂM → KẾT THÚC VÒNG

Chạy:
  python scripts/simulate_qualifier_bpt.py
  python scripts/simulate_qualifier_bpt.py --players 25 --correct-rate 0.8

Trong container:
  podman exec -it -w /backend/app app python simulate_qualifier_bpt.py

Tuỳ chọn:
  --players N        Số bot players     (default: 20)
  --correct-rate F   Tỷ lệ trả lời đúng (default: 0.75)
  --skip-rate F      Tỷ lệ bỏ câu       (default: 0.10)
  --min-delay F      Delay tối thiểu s  (default: 0.5)
  --max-delay F      Delay tối đa s     (default: 9.0)
  --api-url URL      API base URL       (default: http://localhost:8000)
  --reconnect        Tự động reconnect nếu WS bị đứt (default: bật)
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import random
import sys
from pathlib import Path

_ENV_FILE = Path(__file__).parent.parent / "configs" / ".env"
if _ENV_FILE.exists():
    with contextlib.suppress(ImportError):
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)

try:
    import httpx
except ImportError:
    print("[!] Thiếu httpx  →  pip install httpx", file=sys.stderr)
    sys.exit(1)

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
except ImportError:
    print("[!] Thiếu websockets  →  pip install websockets", file=sys.stderr)
    sys.exit(1)


# ── Cấu hình cố định ─────────────────────────────────────────────────────────

MATCH_CODE    = "OC3_M_VL"
PLAYER_PREFIX = "OC_U_P03TST"
PLAYER_PW     = "testpass1"
N_PLAYERS     = 20
OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"]

# Đáp án đúng của từng câu (dùng để quyết định đúng/sai theo correct_rate)
KNOWN_CORRECT: dict[str, str] = {
    "OC3_Q_VL_1_01": "A",
    "OC3_Q_VL_1_02": "C",
    "OC3_Q_VL_1_03": "B",
    "OC3_Q_VL_1_04": "D",
    "OC3_Q_VL_1_05": "A",
    "OC3_Q_VL_1_06": "B",
    "OC3_Q_VL_1_07": "E",
    "OC3_Q_VL_1_08": "C",
    "OC3_Q_VL_2_01": "B",
    "OC3_Q_VL_2_02": "A",
    "OC3_Q_VL_2_03": "C",
    "OC3_Q_VL_2_04": "D",
    "OC3_Q_VL_3_01": "E",
    "OC3_Q_VL_3_02": "A",
    "OC3_Q_VL_4_01": "B",
    "OC3_Q_VL_4_02": "F",
    "OC3_Q_VL_5_01": "D",
    "OC3_Q_VL_5_02": "C",
    "OC3_Q_VL_5_03": "A",
    "OC3_Q_VL_5_04": "B",
    "OC3_Q_VL_5_05": "E",
    "OC3_Q_VL_5_06": "C",
    "OC3_Q_VL_5_07": "F",
    "OC3_Q_VL_5_08": "A",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _api_url() -> str:
    return os.environ.get("API_URL", "http://localhost:8000")


def _ws_url(api_url: str, match_code: str, token: str) -> str:
    ws_base = api_url.replace("http://", "ws://").replace("https://", "wss://")
    return f"{ws_base}/ws/{match_code}?token={token}"


def _parse_options(options) -> list[str]:
    if isinstance(options, list):
        return [str(o) for o in options if o]
    if isinstance(options, dict):
        return list(options.keys())
    return OPTION_LETTERS


def _pick_answer(q_code: str, available_options: list[str], correct_rate: float) -> str:
    correct = KNOWN_CORRECT.get(q_code)
    opts = available_options or OPTION_LETTERS
    if correct and random.random() < correct_rate:
        return correct
    wrong_opts = [o for o in opts if o != correct] if correct else opts
    return random.choice(wrong_opts or opts)


def _sep(title: str = "") -> None:
    line = "─" * 68
    if title:
        print(f"\n{line}\n  {title}\n{line}")
    else:
        print(f"\n{line}")


# ── Login một player (chạy concurrent) ───────────────────────────────────────

async def _login_one(
    client: httpx.AsyncClient,
    api_url: str,
    code: str,
    pw: str,
) -> tuple[str, str | None]:
    """Trả về (player_code, token | None)."""
    try:
        resp = await client.post(
            f"{api_url}/auth/login",
            data={"username": code, "password": pw},
            timeout=15,
        )
        if resp.status_code == 200:
            return code, resp.json().get("access_token")
        return code, None
    except Exception:
        return code, None


# ── Bot một player ────────────────────────────────────────────────────────────

class PlayerBot:
    def __init__(
        self,
        *,
        player_code: str,
        token: str,
        api_url: str,
        match_code: str,
        correct_rate: float,
        skip_rate: float,
        min_delay: float,
        max_delay: float,
        auto_reconnect: bool,
    ) -> None:
        self.player_code   = player_code
        self.token         = token
        self.api_url       = api_url
        self.match_code    = match_code
        self.correct_rate  = correct_rate
        self.skip_rate     = skip_rate
        self.min_delay     = min_delay
        self.max_delay     = max_delay
        self.auto_reconnect = auto_reconnect

        self._short = player_code.replace(PLAYER_PREFIX, "P")
        self._answered: set[str] = set()
        self._pending_q_code: str | None = None
        self._pending_q_opts: list[str] = []
        self._answer_tasks: list[asyncio.Task] = []

    # ── REST submit ──────────────────────────────────────────────────────────

    async def _submit(self, q_code: str, answer: str, timestamp: float) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.api_url}/answers/",
                    headers={"Authorization": f"Bearer {self.token}"},
                    json={
                        "user_code": self.player_code,
                        "match_code": self.match_code,
                        "question_code": q_code,
                        "answer_text": answer,
                        "has_buzzed": False,
                        "timestamp": timestamp,
                    },
                )
                return resp.status_code in (200, 201)
        except Exception:
            return False

    # ── Delayed answer ───────────────────────────────────────────────────────

    async def _delayed_answer(
        self, q_code: str, opts: list[str], effective_max: float
    ) -> None:
        try:
            if random.random() < self.skip_rate:
                return  # bỏ câu này

            delay = random.uniform(self.min_delay, max(self.min_delay, effective_max))
            await asyncio.sleep(delay)

            if q_code in self._answered:
                return

            answer = _pick_answer(q_code, opts, self.correct_rate)
            ok = await self._submit(q_code, answer, round(delay, 3))

            if ok:
                self._answered.add(q_code)
                known = KNOWN_CORRECT.get(q_code)
                mark = (" ✓" if answer == known else " ✗") if known else ""
                print(
                    f"  {self._short:<6}  {answer}{mark:<3}"
                    f"  {delay:.1f}s  [{q_code}]"
                )
            else:
                print(f"  {self._short:<6}  FAIL  [{q_code}]")
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    # ── WS message handler ───────────────────────────────────────────────────

    async def _handle(self, msg: dict) -> None:
        msg_type = msg.get("type")

        if msg_type == "send_question":
            q_code = msg.get("question_code") or msg.get("code")
            if not q_code:
                return
            self._pending_q_code = q_code
            self._pending_q_opts = _parse_options(msg.get("options"))

        elif msg_type == "start_the_timer":
            q_code = msg.get("question_code") or self._pending_q_code
            if not q_code or q_code in self._answered:
                return
            opts = self._pending_q_opts or []
            time_limit = msg.get("time_limit", self.max_delay)
            eff_max = min(self.max_delay, float(time_limit) - 0.3)
            eff_max = max(self.min_delay, eff_max)
            task = asyncio.create_task(self._delayed_answer(q_code, opts, eff_max))
            self._answer_tasks.append(task)
            # Dọn tasks đã xong
            self._answer_tasks = [t for t in self._answer_tasks if not t.done()]

        elif msg_type == "clear_question":
            for t in self._answer_tasks:
                t.cancel()
            self._answer_tasks = []
            self._pending_q_code = None
            self._pending_q_opts = []

    # ── Heartbeat ────────────────────────────────────────────────────────────

    async def _heartbeat(self, ws) -> None:
        try:
            while True:
                await asyncio.sleep(15)
                await ws.send(json.dumps({"type": "player_heartbeat"}))
        except (asyncio.CancelledError, Exception):
            pass

    # ── Main WS loop (với reconnect) ─────────────────────────────────────────

    async def run(self) -> None:
        url = _ws_url(self.api_url, self.match_code, self.token)
        while True:
            try:
                async with websockets.connect(url) as ws:
                    await ws.send(json.dumps({"type": "player_online"}))
                    await ws.send(json.dumps({"type": "request_qualifier_state"}))

                    hb_task = asyncio.create_task(self._heartbeat(ws))
                    try:
                        async for raw in ws:
                            try:
                                msg = json.loads(raw)
                                # Hỗ trợ envelope { "message": {...} }
                                if isinstance(msg.get("message"), dict):
                                    msg = msg["message"]
                                await self._handle(msg)
                            except (json.JSONDecodeError, Exception):
                                continue
                    finally:
                        hb_task.cancel()
                        with contextlib.suppress(Exception):
                            await hb_task
            except asyncio.CancelledError:
                raise
            except ConnectionClosed:
                if self.auto_reconnect:
                    await asyncio.sleep(3)
                    continue
                break
            except Exception:
                if self.auto_reconnect:
                    await asyncio.sleep(3)
                    continue
                break
            break  # Thoát bình thường (không reconnect)

        # Dọn answer tasks
        for t in self._answer_tasks:
            t.cancel()
        with contextlib.suppress(Exception):
            if self._answer_tasks:
                await asyncio.gather(*self._answer_tasks, return_exceptions=True)


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(
    n_players: int,
    correct_rate: float,
    skip_rate: float,
    min_delay: float,
    max_delay: float,
    api_url: str,
    auto_reconnect: bool,
) -> None:
    _sep("QUALIFIER BOT — Nhiều người chơi cùng lúc")
    print(f"  API     : {api_url}")
    print(f"  Match   : {MATCH_CODE}")
    print(f"  Players : {n_players}")
    print(f"  Đúng    : {correct_rate:.0%}  |  Bỏ: {skip_rate:.0%}")
    print(f"  Delay   : {min_delay}–{max_delay}s")
    print(f"  Reconnect: {'bật' if auto_reconnect else 'tắt'}")

    # ── Bước 1: Login song song ───────────────────────────────────────────────
    _sep("Bước 1 — Đăng nhập song song")

    async with httpx.AsyncClient(timeout=20) as client:
        login_tasks = [
            _login_one(client, api_url, f"{PLAYER_PREFIX}{i:02d}", PLAYER_PW)
            for i in range(1, n_players + 1)
        ]
        results: list[tuple[str, str | None]] = await asyncio.gather(*login_tasks)

    tokens: dict[str, str] = {}
    for code, token in results:
        if token:
            tokens[code] = token
        else:
            print(f"  [!] Đăng nhập thất bại: {code}")

    ok_count = len(tokens)
    print(f"\n  Đăng nhập thành công: {ok_count}/{n_players}")

    if not tokens:
        print("\n  [!] Không có player nào — hãy chạy seed_test_players.py trước.")
        return

    # ── Bước 2: Tạo bots ──────────────────────────────────────────────────────
    bots = [
        PlayerBot(
            player_code=code,
            token=token,
            api_url=api_url,
            match_code=MATCH_CODE,
            correct_rate=correct_rate,
            skip_rate=skip_rate,
            min_delay=min_delay,
            max_delay=max_delay,
            auto_reconnect=auto_reconnect,
        )
        for code, token in tokens.items()
    ]

    # ── Bước 3: Kết nối WS song song ──────────────────────────────────────────
    _sep("Bước 2 — Kết nối WebSocket song song")

    # Tất cả bots chạy run() song song — bên trong run() sẽ connect WS
    # In thông báo sẵn sàng
    print(f"\n  {len(bots)} bots đang kết nối WS...")
    print()
    print("  ╔══════════════════════════════════════════════════════════════╗")
    print("  ║  Admin điều khiển UI bình thường.                           ║")
    print("  ║  Khi BẤM GIỜ, tất cả bots tự động trả lời cùng lúc.        ║")
    print("  ║  Nhấn Ctrl+C để dừng.                                       ║")
    print("  ╚══════════════════════════════════════════════════════════════╝")
    print()

    # ── Chạy tất cả bots ──────────────────────────────────────────────────────
    tasks = [asyncio.create_task(bot.run()) for bot in bots]
    try:
        await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        _sep("Dừng bots...")
        for t in tasks:
            t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.gather(*tasks, return_exceptions=True)
        print(f"  {len(bots)} bots đã ngắt kết nối.\n")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Bot simulator — nhiều player trả lời qualifier cùng lúc",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ:
  python scripts/simulate_qualifier_bpt.py
  python scripts/simulate_qualifier_bpt.py --players 25 --correct-rate 0.8
  python scripts/simulate_qualifier_bpt.py --players 10 --skip-rate 0.2 --min-delay 2 --max-delay 8
  podman exec -it -w /backend/app app python simulate_qualifier_bpt.py --players 20
        """,
    )
    parser.add_argument("--players",      type=int,   default=N_PLAYERS, help=f"Số bot players (default {N_PLAYERS})")
    parser.add_argument("--correct-rate", type=float, default=0.75,      help="Tỷ lệ trả lời đúng 0.0–1.0 (default 0.75)")
    parser.add_argument("--skip-rate",    type=float, default=0.10,      help="Tỷ lệ bỏ qua câu 0.0–1.0 (default 0.10)")
    parser.add_argument("--min-delay",    type=float, default=0.5,       help="Delay tối thiểu giây (default 0.5)")
    parser.add_argument("--max-delay",    type=float, default=9.0,       help="Delay tối đa giây (default 9.0)")
    parser.add_argument("--api-url",      default=None,                  help="API base URL (default: http://localhost:8000)")
    parser.add_argument("--no-reconnect", action="store_true",           help="Tắt auto reconnect WS")
    args = parser.parse_args()

    if args.api_url:
        os.environ["API_URL"] = args.api_url

    try:
        asyncio.run(
            main(
                n_players=args.players,
                correct_rate=args.correct_rate,
                skip_rate=args.skip_rate,
                min_delay=args.min_delay,
                max_delay=args.max_delay,
                api_url=_api_url(),
                auto_reconnect=not args.no_reconnect,
            )
        )
    except KeyboardInterrupt:
        print("\n  [Ctrl+C] Đã dừng.")
