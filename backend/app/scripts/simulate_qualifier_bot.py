#!/usr/bin/env python3
"""
simulate_qualifier_bot.py — Bot players phản ứng tự động với admin UI.

Admin tự tay điều khiển trình duyệt:
  • BẮT ĐẦU VÒNG  → sync round cho players
  • BẤM GIỜ       → broadcast send_question tới WS
  • HIỆN ĐÁP ÁN   → hiện đáp án
  • TÍNH ĐIỂM     → calculate scores
  • KẾT THÚC VÒNG → end round

Script này:
  • Đăng nhập N players test
  • Kết nối từng player qua WebSocket
  • Lắng nghe event "send_question" từ WS
  • Tự động submit đáp án với delay ngẫu nhiên (simulating human reaction)
  • In status ra terminal để admin biết bots đang trả lời

Chạy trong container:
  podman exec -it -w /backend/app app python scripts/simulate_qualifier_bot.py

Hoặc local từ root repo:
  python backend/app/scripts/simulate_qualifier_bot.py --api-url http://localhost:8000

Tuỳ chọn:
  --players N        Số bot players (default: 20)
  --correct-rate F   Xác suất trả lời đúng 0.0–1.0 (default: 0.75)
  --skip-rate F      Xác suất bỏ qua câu hỏi (default: 0.10)
  --min-delay F      Delay tối thiểu giây (default: 1.0)
  --max-delay F      Delay tối đa giây (default: 9.0)
  --api-url URL      Base URL của API (default: http://localhost:8000)
  --round N          Chỉ load player từ prefix của round (không ảnh hưởng login)
"""

import argparse
import asyncio
import contextlib
import json
import os
import random
import sys
from pathlib import Path
from typing import Any

_ENV_FILE = Path(__file__).parent.parent / "configs" / ".env"
if _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
    except ImportError:
        pass

try:
    import httpx
except ImportError as e:
    print(f"[!] Missing dependency: {e}  →  pip install httpx")
    sys.exit(1)

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
except ImportError:
    print("[!] Missing dependency: websockets  →  pip install websockets")
    sys.exit(1)


# ── Constants ─────────────────────────────────────────────────────────────────

MATCH_CODE    = "OC3_M_VL"
PLAYER_PREFIX = "OC_U_P03TST"
PLAYER_PW     = "testpass1"
N_PLAYERS     = 20
OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"]

# Correct answers for all seeded questions.
# Script can still function without these — it'll just pick randomly.
KNOWN_CORRECT: dict[str, str] = {
    # Round 1
    "OC3_Q_VL_1_01": "A",
    "OC3_Q_VL_1_02": "C",
    "OC3_Q_VL_1_03": "B",
    "OC3_Q_VL_1_04": "D",
    "OC3_Q_VL_1_05": "A",
    "OC3_Q_VL_1_06": "B",
    "OC3_Q_VL_1_07": "E",
    "OC3_Q_VL_1_08": "C",
    # Round 2
    "OC3_Q_VL_2_01": "B",
    "OC3_Q_VL_2_02": "A",
    "OC3_Q_VL_2_03": "C",
    "OC3_Q_VL_2_04": "D",
    # Round 3
    "OC3_Q_VL_3_01": "E",
    "OC3_Q_VL_3_02": "A",
    # Round 4
    "OC3_Q_VL_4_01": "B",
    "OC3_Q_VL_4_02": "F",
    # Round 5 (backup)
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

def _build_api_url() -> str:
    return os.environ.get("API_URL", "http://localhost:8000")


def _build_ws_url(api_url: str, token: str) -> str:
    ws_base = api_url.replace("http://", "ws://", 1).replace("https://", "wss://", 1)
    return f"{ws_base}/ws/{MATCH_CODE}?token={token}"


def parse_ws_options(options: Any) -> list[str]:
    """Extract option letters from various option formats sent in WS events."""
    if isinstance(options, list):
        return [str(o) for o in options if o]
    if isinstance(options, dict):
        return list(options.keys())
    return OPTION_LETTERS


def pick_answer(
    question_code: str,
    available_options: list[str],
    correct_rate: float,
) -> str:
    """Pick an answer letter with configurable correctness probability."""
    correct = KNOWN_CORRECT.get(question_code)
    options = available_options if available_options else OPTION_LETTERS

    if correct and random.random() < correct_rate:
        return correct

    wrong_options = [o for o in options if o != correct] if correct else options
    return random.choice(wrong_options if wrong_options else options)


def sep(title: str = "") -> None:
    line = "─" * 64
    if title:
        print(f"\n{line}")
        print(f"  {title}")
        print(line)
    else:
        print(f"\n{line}")


# ── Per-player bot ─────────────────────────────────────────────────────────────

class PlayerBot:
    def __init__(
        self,
        player_code: str,
        token: str,
        client: httpx.AsyncClient,
        api_url: str,
        correct_rate: float,
        skip_rate: float,
        min_delay: float,
        max_delay: float,
    ):
        self.player_code = player_code
        self.token = token
        self.client = client
        self.api_url = api_url
        self.correct_rate = correct_rate
        self.skip_rate = skip_rate
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.short_name = player_code.replace("OC_U_P03TST", "P")

        self._ws: Any = None
        self._answered: set[str] = set()
        self._pending_tasks: list[asyncio.Task] = []

    async def connect(self, ws_url: str) -> None:
        self._ws = await websockets.connect(ws_url)
        await self._ws.send(json.dumps({"type": "player_online"}))
        await self._ws.send(json.dumps({"type": "request_qualifier_state"}))

    @property
    def is_connected(self) -> bool:
        return self._ws is not None and not getattr(self._ws, "closed", True)

    async def run(self) -> None:
        """Main message loop — listen for WS events and react."""
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    # Support { "message": {...} } envelope or raw frame
                    if "message" in msg and isinstance(msg["message"], dict):
                        msg = msg["message"]
                    await self._handle_message(msg)
                except (json.JSONDecodeError, Exception):
                    continue
        except ConnectionClosed:
            pass
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def _handle_message(self, msg: dict) -> None:
        msg_type = msg.get("type")

        if msg_type == "send_question":
            q_code = msg.get("question_code") or msg.get("code")
            if not q_code or q_code in self._answered:
                return
            options = parse_ws_options(msg.get("options"))
            task = asyncio.create_task(self._delayed_answer(q_code, options))
            self._pending_tasks.append(task)

        elif msg_type == "clear_question":
            # Cancel any pending answers — this question was cleared before timer ended
            for task in self._pending_tasks:
                task.cancel()
            self._pending_tasks = [t for t in self._pending_tasks if not t.done()]

    async def _delayed_answer(self, question_code: str, available_options: list[str]) -> None:
        """Wait a human-like random delay then submit answer via REST API."""
        try:
            if random.random() < self.skip_rate:
                return  # This player decides not to answer

            delay = random.uniform(self.min_delay, self.max_delay)
            await asyncio.sleep(delay)

            # Check again after waking up (might have been answered already)
            if question_code in self._answered:
                return

            answer = pick_answer(question_code, available_options, self.correct_rate)
            timestamp = round(delay, 3)

            ok = await self._submit_rest(question_code, answer, timestamp)

            if ok:
                self._answered.add(question_code)
                known = KNOWN_CORRECT.get(question_code)
                mark = ""
                if known:
                    mark = " ✓" if answer == known else " ✗"
                print(
                    f"    {self.short_name:<5}  {answer}{mark:<3}"
                    f"  t={delay:.1f}s  [{question_code}]"
                )
            else:
                print(f"    {self.short_name:<5}  FAIL  [{question_code}]")

        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def _submit_rest(
        self,
        question_code: str,
        answer_text: str,
        timestamp: float,
    ) -> bool:
        try:
            resp = await self.client.post(
                f"{self.api_url}/answers/",
                headers={"Authorization": f"Bearer {self.token}"},
                json={
                    "user_code": self.player_code,
                    "match_code": MATCH_CODE,
                    "question_code": question_code,
                    "answer_text": answer_text,
                    "has_buzzed": False,
                    "timestamp": timestamp,
                },
                timeout=10,
            )
            return resp.status_code in (200, 201)
        except Exception:
            return False

    async def send_heartbeat(self) -> None:
        """Periodic heartbeat to keep WS connection alive."""
        try:
            while True:
                await asyncio.sleep(15)
                if self.is_connected:
                    await self._ws.send(json.dumps({"type": "player_heartbeat"}))
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def close(self) -> None:
        for task in self._pending_tasks:
            task.cancel()
        with contextlib.suppress(Exception):
            if self._pending_tasks:
                await asyncio.gather(*self._pending_tasks, return_exceptions=True)
        if self._ws:
            with contextlib.suppress(Exception):
                await self._ws.close()


# ── Login helpers ─────────────────────────────────────────────────────────────

async def login(client: httpx.AsyncClient, api_url: str, code: str, pw: str) -> str | None:
    try:
        resp = await client.post(
            f"{api_url}/auth/login",
            data={"username": code, "password": pw},
        )
        if resp.status_code != 200:
            return None
        return resp.json().get("access_token")
    except Exception:
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(
    n_players: int,
    correct_rate: float,
    skip_rate: float,
    min_delay: float,
    max_delay: float,
    api_url: str,
) -> None:
    sep("QUALIFIER BOT — Chế độ tương tác")
    print(f"  API  : {api_url}")
    print(f"  Bots : {n_players} players")
    print(f"  Đúng : {correct_rate:.0%}  |  Bỏ: {skip_rate:.0%}")
    print(f"  Delay: {min_delay}–{max_delay}s")
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  Admin điều khiển trình duyệt bình thường.              ║")
    print("  ║  Khi admin click BẤM GIỜ, bots tự động trả lời.        ║")
    print("  ║  Nhấn Ctrl+C để dừng bots.                              ║")
    print("  ╚══════════════════════════════════════════════════════════╝")

    # ── Đăng nhập tất cả players ───────────────────────────────────────────
    sep("Bước 1 — Đăng nhập players")

    # Use a long-lived client for all REST calls during the session
    async with httpx.AsyncClient(timeout=30) as client:
        bots: list[PlayerBot] = []

        for i in range(1, n_players + 1):
            code = f"{PLAYER_PREFIX}{i:02d}"
            token = await login(client, api_url, code, PLAYER_PW)
            if token:
                bot = PlayerBot(
                    player_code=code,
                    token=token,
                    client=client,
                    api_url=api_url,
                    correct_rate=correct_rate,
                    skip_rate=skip_rate,
                    min_delay=min_delay,
                    max_delay=max_delay,
                )
                bots.append(bot)
            else:
                print(f"  [!] Đăng nhập thất bại: {code}")

        print(f"  Đăng nhập thành công: {len(bots)}/{n_players}")

        if not bots:
            print("  [!] Không có bot nào — hãy chạy scripts/seed_test_players.py trước.")
            return

        # ── Connect WebSockets ─────────────────────────────────────────────
        sep("Bước 2 — Kết nối WebSocket")
        connected_bots: list[PlayerBot] = []

        for bot in bots:
            ws_url = _build_ws_url(api_url, bot.token)
            try:
                await bot.connect(ws_url)
                connected_bots.append(bot)
            except Exception as e:
                print(f"  [!] WS thất bại ({bot.player_code}): {e}")

        print(f"  WS connected: {len(connected_bots)}/{len(bots)}")

        if not connected_bots:
            print("  [!] Không có WS connection. Kiểm tra backend đang chạy.")
            return

        # ── Chờ admin ──────────────────────────────────────────────────────
        sep(f"Bước 3 — {len(connected_bots)} bots sẵn sàng. Đang chờ admin...")
        print()
        print("  Vào tab admin browser → BẮT ĐẦU VÒNG → chọn câu → BẤM GIỜ.")
        print("  Bots sẽ tự trả lời. Admin click TÍNH ĐIỂM và KẾT THÚC VÒNG như bình thường.")
        print()

        # ── Chạy tất cả bots song song ─────────────────────────────────────
        all_tasks: list[asyncio.Task] = []
        for bot in connected_bots:
            all_tasks.append(asyncio.create_task(bot.run()))
            all_tasks.append(asyncio.create_task(bot.send_heartbeat()))

        try:
            await asyncio.gather(*all_tasks)
        except (asyncio.CancelledError, KeyboardInterrupt):
            pass
        finally:
            sep("Dừng bots...")
            for task in all_tasks:
                task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.gather(*all_tasks, return_exceptions=True)
            for bot in connected_bots:
                await bot.close()
            print(f"  {len(connected_bots)} bots đã ngắt kết nối.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Bot players tự động trả lời khi admin broadcast câu hỏi qua WS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ:
  # Chạy local
  python backend/app/scripts/simulate_qualifier_bot.py --api-url http://localhost:8000

  # Trong container
  podman exec -it -w /backend/app app python scripts/simulate_qualifier_bot.py

  # Tuỳ chọn nâng cao
  python backend/app/scripts/simulate_qualifier_bot.py --players 10 --correct-rate 0.8 --min-delay 2 --max-delay 7
        """,
    )
    parser.add_argument(
        "--players",
        type=int,
        default=N_PLAYERS,
        help=f"Số bot players (default {N_PLAYERS})",
    )
    parser.add_argument(
        "--correct-rate",
        type=float,
        default=0.75,
        help="Xác suất trả lời đúng 0.0–1.0 (default 0.75)",
    )
    parser.add_argument(
        "--skip-rate",
        type=float,
        default=0.10,
        help="Xác suất bỏ qua câu hỏi (default 0.10)",
    )
    parser.add_argument(
        "--min-delay",
        type=float,
        default=1.0,
        help="Delay tối thiểu trước khi trả lời giây (default 1.0)",
    )
    parser.add_argument(
        "--max-delay",
        type=float,
        default=9.0,
        help="Delay tối đa trước khi trả lời giây (default 9.0)",
    )
    parser.add_argument(
        "--api-url",
        default=None,
        help="API base URL (default: http://localhost:8000)",
    )
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
                api_url=_build_api_url(),
            )
        )
    except KeyboardInterrupt:
        print("\n  [Ctrl+C] Đã dừng.")
