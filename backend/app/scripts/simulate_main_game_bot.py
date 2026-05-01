#!/usr/bin/env python3
"""
simulate_main_game_bot.py — Bot players tự động cho các vòng thi chính.

Hỗ trợ 4 vòng thi chính:
  • Khởi Động Chung (kd-c)  — gõ đáp án text, 60s
  • Giải Mã (gm)            — gõ đáp án + từ khoá, 15s/gợi ý
  • Bứt Phá (bp)            — gõ đáp án text, 30s, lockout 3s
  • Về Đích Chung (vd-c)    — gõ đáp án text, thời gian tuỳ câu

Bot này:
  • Đăng nhập N test players (OC_U_P03TST01..N)
  • Kết nối WebSocket cho mỗi player
  • Lắng nghe sự kiện "start_the_timer" từ admin
  • Tự động gửi đáp án ngẫu nhiên (text) với delay ngẫu nhiên
  • Bứt Phá: tuân thủ lockout 3s giữa các lần nộp
  • Về Đích Riêng: gửi buzz khi answering_window_activated

Chạy trong container:
  podman exec -it -w /backend/app app python scripts/simulate_main_game_bot.py --match-code OC3_M_01

Chạy local:
  python backend/app/scripts/simulate_main_game_bot.py --match-code OC3_M_01 --api-url http://localhost:8000

Tuỳ chọn:
  --match-code CODE   Mã trận đấu (bắt buộc, ví dụ: OC3_M_01)
  --players N         Số bot (default: 20)
  --round MODE        Chế độ: kd-c | gm | bp | vd-c | vd-r | auto (default: auto)
  --answer-rate F     Xác suất nộp đáp án 0.0–1.0 (default: 0.85)
  --min-delay F       Delay tối thiểu giây (default: 1.0)
  --max-delay F       Delay tối đa giây (default: 12.0)
  --api-url URL       Base URL của API (default: http://localhost:8000)
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
except ImportError:
    print("[!] Missing dependency: httpx  →  pip install httpx")
    sys.exit(1)

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
except ImportError:
    print("[!] Missing dependency: websockets  →  pip install websockets")
    sys.exit(1)


# ── Constants ─────────────────────────────────────────────────────────────────

PLAYER_PREFIX = "OC_U_P03TST"
PLAYER_PW = "testpass1"
N_PLAYERS = 4

# Random Vietnamese-style short answers used to simulate real players
_FAKE_ANSWERS = [
    "Hà Nội", "Sài Gòn", "Đà Nẵng", "Huế", "Cần Thơ",
    "1945", "1975", "2024", "42", "100",
    "Nguyễn Du", "Hồ Chí Minh", "Quang Trung", "Lý Thường Kiệt",
    "Mặt Trời", "Mặt Trăng", "Sao Kim", "Sao Mộc",
    "Oxy", "Nitơ", "Hydro", "Carbon",
    "Toán học", "Vật lý", "Hóa học", "Sinh học",
    "Đỏ", "Xanh", "Vàng", "Trắng",
    "Một", "Hai", "Ba", "Bốn",
]

_FAKE_KEYWORDS = [
    "OLYMPIA", "VIETTEL", "HANOI", "SAIGON", "VIETNAM",
    "MATMA123", "KEYWORD", "GIAIMA", "TRALOI", "DAPDUNG",
]

BUZZER_ANNOUNCE = "Bứt phá"


def _random_answer() -> str:
    return random.choice(_FAKE_ANSWERS)


def _random_keyword() -> str:
    return random.choice(_FAKE_KEYWORDS)


def _build_api_url() -> str:
    return os.environ.get("API_URL", "http://localhost:8000")


def _build_ws_url(api_url: str, match_code: str, token: str) -> str:
    ws_base = api_url.replace("http://", "ws://", 1).replace("https://", "wss://", 1)
    return f"{ws_base}/ws/{match_code}?token={token}"


def sep(title: str = "") -> None:
    line = "─" * 64
    if title:
        print(f"\n{line}\n  {title}\n{line}")
    else:
        print(line)


# ── Per-player bot ─────────────────────────────────────────────────────────────

class PlayerBot:
    def __init__(
        self,
        player_code: str,
        token: str,
        client: httpx.AsyncClient,
        api_url: str,
        match_code: str,
        answer_rate: float,
        min_delay: float,
        max_delay: float,
        mode: str,
    ):
        self.player_code = player_code
        self.token = token
        self.client = client
        self.api_url = api_url
        self.match_code = match_code
        self.answer_rate = answer_rate
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.mode = mode  # "kd-c" | "gm" | "bp" | "vd-c" | "vd-r" | "auto"
        self.short_name = player_code.replace(PLAYER_PREFIX, "P")

        self._ws: Any = None
        self._answered_questions: set[str] = set()
        self._pending_tasks: list[asyncio.Task] = []
        self._pending_question_code: str | None = None
        self._time_limit: float = 30.0
        # Bứt phá: track last submission time for 3s lockout
        self._last_submit_time: float = 0.0
        # Về đích riêng: track buzz state
        self._has_buzzed: bool = False
        self._buzzer_winner: str | None = None

    async def connect(self, ws_url: str) -> None:
        self._ws = await websockets.connect(ws_url)
        await self._ws.send(json.dumps({"type": "player_online"}))

    @property
    def is_connected(self) -> bool:
        return self._ws is not None and not getattr(self._ws, "closed", True)

    async def run(self) -> None:
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
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
            if q_code:
                self._pending_question_code = q_code
            self._has_buzzed = False
            self._buzzer_winner = None

        elif msg_type == "navigate":
            # Detect which round we're in from path if mode is auto
            path = msg.get("path", "")
            if self.mode == "auto":
                if "/kd" in path:
                    self.mode = "kd-c"
                elif "/gm" in path:
                    self.mode = "gm"
                elif "/bp" in path:
                    self.mode = "bp"
                elif "/vd" in path:
                    self.mode = "vd-c"

        elif msg_type == "start_the_timer":
            q_code = msg.get("question_code") or self._pending_question_code
            self._time_limit = float(msg.get("time_limit", 30))
            if not q_code or q_code in self._answered_questions:
                return
            # Schedule delayed answer submission
            effective_max = min(self.max_delay, self._time_limit - 0.5)
            effective_max = max(self.min_delay, effective_max)
            task = asyncio.create_task(
                self._delayed_answer(q_code, effective_max)
            )
            self._pending_tasks.append(task)

        elif msg_type == "answering_window_activated":
            # Về đích riêng: other players can buzz within countdown seconds
            countdown = float(msg.get("countdown", 5))
            q_code = self._pending_question_code
            if q_code and not self._has_buzzed and not self._buzzer_winner:
                task = asyncio.create_task(
                    self._delayed_buzz(q_code, countdown)
                )
                self._pending_tasks.append(task)

        elif msg_type == "buzzer_winner":
            self._buzzer_winner = msg.get("user_code")

        elif msg_type == "clear_question":
            for task in self._pending_tasks:
                task.cancel()
            self._pending_tasks = [t for t in self._pending_tasks if not t.done()]
            self._pending_question_code = None
            self._has_buzzed = False
            self._buzzer_winner = None

        elif msg_type == "clear_buzz":
            self._has_buzzed = False
            self._buzzer_winner = None

    async def _delayed_answer(self, question_code: str, max_delay: float) -> None:
        try:
            if random.random() > self.answer_rate:
                return  # this bot skips this question

            delay = random.uniform(self.min_delay, max_delay)

            # Bứt phá: enforce 3-second lockout from last submission
            if self.mode == "bp":
                since_last = asyncio.get_event_loop().time() - self._last_submit_time
                if since_last < 3.0:
                    delay = max(delay, 3.0 - since_last + 0.1)

            await asyncio.sleep(delay)

            if question_code in self._answered_questions:
                return

            answer = _random_answer()
            ts = round(delay, 3)

            ok = await self._submit_answer(question_code, answer, ts)
            if ok:
                self._answered_questions.add(question_code)
                self._last_submit_time = asyncio.get_event_loop().time()
                print(
                    f"    {self.short_name:<5}  '{answer:<12}'  t={delay:.1f}s  [{question_code}]"
                )

                # Giải mã: also submit a random keyword attempt for the Mật Mã
                if self.mode == "gm" and random.random() < 0.3:
                    await asyncio.sleep(random.uniform(0.5, 2.0))
                    kw = _random_keyword()
                    kw_ok = await self._submit_answer(question_code, kw, ts + 1.0)
                    if kw_ok:
                        print(f"    {self.short_name:<5}  [KW] '{kw}'  [{question_code}]")
            else:
                print(f"    {self.short_name:<5}  FAIL  [{question_code}]")

        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def _delayed_buzz(self, question_code: str, window: float) -> None:
        """Về đích riêng: buzz within the answering window."""
        try:
            delay = random.uniform(0.5, min(window - 0.2, self.max_delay))
            await asyncio.sleep(delay)

            if self._has_buzzed or self._buzzer_winner:
                return

            ok = await self._submit_buzz(question_code)
            if ok:
                self._has_buzzed = True
                print(f"    {self.short_name:<5}  [BUZZ]  [{question_code}]")
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def _submit_answer(
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
                    "match_code": self.match_code,
                    "question_code": question_code,
                    "answer_text": answer_text,
                    "has_buzzed": False,
                    "timestamp": timestamp,
                },
                timeout=10,
            )
            # Also broadcast over WS so admin sees it in real-time
            if self._ws and not getattr(self._ws, "closed", True):
                await self._ws.send(json.dumps({
                    "type": "answer",
                    "user_code": self.player_code,
                    "question_code": question_code,
                    "answer_text": answer_text,
                    "timestamp": timestamp,
                }))
            return resp.status_code in (200, 201)
        except Exception:
            return False

    async def _submit_buzz(self, question_code: str) -> bool:
        try:
            resp = await self.client.post(
                f"{self.api_url}/answers/",
                headers={"Authorization": f"Bearer {self.token}"},
                json={
                    "user_code": self.player_code,
                    "match_code": self.match_code,
                    "question_code": question_code,
                    "has_buzzed": True,
                },
                timeout=10,
            )
            if self._ws and not getattr(self._ws, "closed", True):
                await self._ws.send(json.dumps({
                    "type": "buzz",
                    "user_code": self.player_code,
                    "question_code": question_code,
                    "has_buzzed": True,
                }))
            return resp.status_code in (200, 201)
        except Exception:
            return False

    async def send_heartbeat(self) -> None:
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


# ── Login ─────────────────────────────────────────────────────────────────────

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
    match_code: str,
    n_players: int,
    mode: str,
    answer_rate: float,
    min_delay: float,
    max_delay: float,
    api_url: str,
) -> None:
    mode_labels = {
        "kd-c": "Khởi Động Chung",
        "gm": "Giải Mã",
        "bp": "Bứt Phá",
        "vd-c": "Về Đích Chung",
        "vd-r": "Về Đích Riêng (buzz)",
        "auto": "Tự động (nhận từ navigate event)",
    }

    sep("MAIN GAME BOT — Chế độ tương tác")
    print(f"  API        : {api_url}")
    print(f"  Match      : {match_code}")
    print(f"  Bots       : {n_players} players")
    print(f"  Chế độ     : {mode_labels.get(mode, mode)}")
    print(f"  Nộp đáp án : {answer_rate:.0%}  |  Delay: {min_delay}–{max_delay}s")
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  Admin điều khiển trình duyệt bình thường.              ║")
    print("  ║  Khi admin click BẤM GIỜ, bots tự động gửi đáp án.     ║")
    print("  ║  Nhấn Ctrl+C để dừng bots.                              ║")
    print("  ╚══════════════════════════════════════════════════════════╝")

    sep("Bước 1 — Đăng nhập players")

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
                    match_code=match_code,
                    answer_rate=answer_rate,
                    min_delay=min_delay,
                    max_delay=max_delay,
                    mode=mode,
                )
                bots.append(bot)
            else:
                print(f"  [!] Đăng nhập thất bại: {code}")

        print(f"  Đăng nhập thành công: {len(bots)}/{n_players}")

        if not bots:
            print("  [!] Không có bot nào.")
            print("  →  Hãy chạy scripts/seed_test_players.py --count 20 trước.")
            return

        sep("Bước 2 — Kết nối WebSocket")
        connected_bots: list[PlayerBot] = []

        for bot in bots:
            ws_url = _build_ws_url(api_url, match_code, bot.token)
            try:
                await bot.connect(ws_url)
                connected_bots.append(bot)
            except Exception as e:
                print(f"  [!] WS thất bại ({bot.player_code}): {e}")

        print(f"  WS connected: {len(connected_bots)}/{len(bots)}")

        if not connected_bots:
            print("  [!] Không có WS connection. Kiểm tra backend đang chạy.")
            return

        sep(f"Bước 3 — {len(connected_bots)} bots sẵn sàng. Đang chờ admin...")
        print()
        print("  Vào admin browser → BẮT ĐẦU VÒNG → chọn câu → BẤM GIỜ.")
        print("  Bots sẽ tự nộp đáp án. Admin xem kết quả và tính điểm.")
        print()

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
        description="Bot players tự động trả lời câu hỏi vòng thi chính (Khởi Động / Giải Mã / Bứt Phá / Về Đích)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ:
  # Khởi Động Chung với 20 bots
  python scripts/simulate_main_game_bot.py --match-code OC3_M_01

  # Bứt Phá
  python scripts/simulate_main_game_bot.py --match-code OC3_M_01 --round bp

  # Giải Mã với 10 bots, 90%% nộp đáp án
  python scripts/simulate_main_game_bot.py --match-code OC3_M_01 --round gm --players 10 --answer-rate 0.9

  # Về Đích Chung (bots gõ đáp án)
  python scripts/simulate_main_game_bot.py --match-code OC3_M_01 --round vd-c

  # Chế độ tự động (bot nhận round từ navigate event)
  python scripts/simulate_main_game_bot.py --match-code OC3_M_01 --round auto
        """,
    )
    parser.add_argument("--match-code", required=True, help="Mã trận đấu (ví dụ: OC3_M_01)")
    parser.add_argument("--players", type=int, default=N_PLAYERS, help=f"Số bot players (default {N_PLAYERS}, mỗi trận 3–4 thí sinh)")
    parser.add_argument(
        "--round",
        default="auto",
        choices=["kd-c", "gm", "bp", "vd-c", "vd-r", "auto"],
        help="Chế độ vòng thi (default: auto)",
    )
    parser.add_argument("--answer-rate", type=float, default=0.85, help="Xác suất nộp đáp án 0.0–1.0 (default 0.85)")
    parser.add_argument("--min-delay", type=float, default=1.0, help="Delay tối thiểu giây (default 1.0)")
    parser.add_argument("--max-delay", type=float, default=12.0, help="Delay tối đa giây (default 12.0)")
    parser.add_argument("--api-url", default=None, help="API base URL (default: http://localhost:8000)")
    args = parser.parse_args()

    if args.api_url:
        os.environ["API_URL"] = args.api_url

    try:
        asyncio.run(
            main(
                match_code=args.match_code,
                n_players=args.players,
                mode=args.round,
                answer_rate=args.answer_rate,
                min_delay=args.min_delay,
                max_delay=args.max_delay,
                api_url=_build_api_url(),
            )
        )
    except KeyboardInterrupt:
        print("\n  [Ctrl+C] Đã dừng.")
