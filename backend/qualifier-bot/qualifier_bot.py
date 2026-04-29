#!/usr/bin/env python3
"""qualifier_bot.py — Auto-seed + passive bot simulator for Vòng Loại.

Startup sequence:
  Phase 0 — Poll PostgreSQL until the DB accepts connections.
  Phase 1 — Idempotent seed: 20 players, match OC3_M_VL, R1–R5 questions.
  Phase 2 — Poll GET /health until the backend is ready.
  Phase 3 — Login 20 players concurrently, connect WebSocket, run passive bots.
             Admin drives the UI; bots auto-answer when the timer starts.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import random
import sys
import uuid
from pathlib import Path

# ---------------------------------------------------------------------------
# Load env before importing configs
# ---------------------------------------------------------------------------
for _p in ("/app/.env", str(Path(__file__).parent.parent.parent / "configs" / ".env")):
    if os.path.isfile(_p):
        try:
            from dotenv import load_dotenv
            load_dotenv(_p)
        except ImportError:
            pass
        break

import configs  # noqa: E402 — after env load

try:
    import httpx
except ImportError:
    print("[!] Missing httpx — pip install httpx", file=sys.stderr)
    sys.exit(1)

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
except ImportError:
    print("[!] Missing websockets — pip install websockets", file=sys.stderr)
    sys.exit(1)

try:
    from passlib.context import CryptContext
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
except ImportError as _e:
    print(f"[!] Missing dependency: {_e}", file=sys.stderr)
    sys.exit(1)

_pwd_ctx = CryptContext(schemes=["bcrypt"])

# ---------------------------------------------------------------------------
# Question data (R1–R5)
# ---------------------------------------------------------------------------

Q_PREFIX = "OC3_Q_VL"

ROUND_1_QUESTIONS = [
    {"code": f"{Q_PREFIX}_1_01", "answer": "A", "content": "Hành tinh nào lớn nhất trong Hệ Mặt Trời?",
     "options": ["Sao Mộc", "Sao Thổ", "Sao Thiên Vương", "Sao Hải Vương", "Sao Hỏa", "Trái Đất"],
     "explanation": "Sao Mộc (Jupiter) là hành tinh lớn nhất trong Hệ Mặt Trời."},
    {"code": f"{Q_PREFIX}_1_02", "answer": "C", "content": "Nguyên tố hóa học nào có ký hiệu Au?",
     "options": ["Nhôm", "Bạc", "Vàng", "Đồng", "Sắt", "Chì"],
     "explanation": "Au là ký hiệu của Vàng (Gold) trong bảng tuần hoàn."},
    {"code": f"{Q_PREFIX}_1_03", "answer": "B", "content": "Ai là tác giả của cuốn tiểu thuyết 'Truyện Kiều'?",
     "options": ["Nguyễn Du", "Nguyễn Du", "Tố Hữu", "Hồ Xuân Hương", "Nam Quốc Sơn Hà", "Nguyễn Trãi"],
     "explanation": "Truyện Kiều do đại thi hào Nguyễn Du sáng tác."},
    {"code": f"{Q_PREFIX}_1_04", "answer": "D", "content": "Tốc độ ánh sáng trong chân không xấp xỉ bao nhiêu km/s?",
     "options": ["100.000", "200.000", "250.000", "300.000", "350.000", "400.000"],
     "explanation": "Tốc độ ánh sáng ≈ 299.792 km/s, làm tròn ~300.000 km/s."},
    {"code": f"{Q_PREFIX}_1_05", "answer": "A", "content": "Quốc gia nào có diện tích lớn nhất thế giới?",
     "options": ["Nga", "Canada", "Trung Quốc", "Mỹ", "Brazil", "Úc"],
     "explanation": "Nga có diện tích ~17,1 triệu km² — lớn nhất thế giới."},
    {"code": f"{Q_PREFIX}_1_06", "answer": "B", "content": "Ngọn núi nào cao nhất thế giới?",
     "options": ["K2", "Everest", "Kangchenjunga", "Lhotse", "Makalu", "Cho Oyu"],
     "explanation": "Đỉnh Everest cao 8.849 m — cao nhất thế giới."},
    {"code": f"{Q_PREFIX}_1_07", "answer": "E", "content": "DNA là chữ viết tắt của cụm từ nào?",
     "options": ["Digital Nucleic Acid", "Deoxyribose Nucleotide Arrangement", "Dynamic Nucleic Antigen",
                 "Deoxyribose Nucleic Acid", "Deoxyribonucleic Acid", "Di-Nucleic Acid"],
     "explanation": "DNA = Deoxyribonucleic Acid (Axit deoxyribonucleic)."},
    {"code": f"{Q_PREFIX}_1_08", "answer": "C", "content": "Thủ đô của Nhật Bản là thành phố nào?",
     "options": ["Osaka", "Kyoto", "Tokyo", "Nagoya", "Sapporo", "Yokohama"],
     "explanation": "Tokyo là thủ đô của Nhật Bản."},
]

ROUND_2_QUESTIONS = [
    {"code": f"{Q_PREFIX}_2_01", "answer": "B", "content": "Sông nào dài nhất thế giới?",
     "options": ["Amazon", "Sông Nile", "Trường Giang", "Mississippi", "Hoàng Hà", "Mê Kông"],
     "explanation": "Sông Nile dài khoảng 6.650 km, là sông dài nhất thế giới."},
    {"code": f"{Q_PREFIX}_2_02", "answer": "A", "content": "Ai là người phát minh ra bóng đèn điện?",
     "options": ["Thomas Edison", "Nikola Tesla", "Alexander Bell", "Benjamin Franklin", "Michael Faraday", "James Watt"],
     "explanation": "Thomas Edison được công nhận là người phát minh bóng đèn điện thực dụng."},
    {"code": f"{Q_PREFIX}_2_03", "answer": "C", "content": "Nguyên tố hóa học nào có số hiệu nguyên tử bằng 1?",
     "options": ["Helium", "Oxy", "Hydro", "Carbon", "Nitơ", "Neon"],
     "explanation": "Hydro (H) có số hiệu nguyên tử Z = 1."},
    {"code": f"{Q_PREFIX}_2_04", "answer": "D", "content": "Đại dương nào lớn nhất trên Trái Đất?",
     "options": ["Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương", "Thái Bình Dương", "Nam Đại Dương", "Biển Đông"],
     "explanation": "Thái Bình Dương là đại dương lớn nhất, chiếm khoảng 1/3 bề mặt Trái Đất."},
]

ROUND_3_QUESTIONS = [
    {"code": f"{Q_PREFIX}_3_01", "answer": "E", "content": "Năm nào Việt Nam giành được độc lập?",
     "options": ["1944", "1946", "1954", "1975", "1945", "1930"],
     "explanation": "Ngày 2/9/1945, Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập."},
    {"code": f"{Q_PREFIX}_3_02", "answer": "A", "content": "Công thức hóa học của nước là gì?",
     "options": ["H₂O", "CO₂", "NaCl", "H₂SO₄", "NH₃", "O₂"],
     "explanation": "Nước có công thức H₂O (2 nguyên tử hydro, 1 nguyên tử oxy)."},
]

ROUND_4_QUESTIONS = [
    {"code": f"{Q_PREFIX}_4_01", "answer": "B", "content": "Ai là tác giả của thuyết tương đối?",
     "options": ["Isaac Newton", "Albert Einstein", "Stephen Hawking", "Niels Bohr", "Max Planck", "Richard Feynman"],
     "explanation": "Albert Einstein công bố thuyết tương đối hẹp (1905) và tổng quát (1915)."},
    {"code": f"{Q_PREFIX}_4_02", "answer": "F", "content": "Đồng tiền chung châu Âu gọi là gì?",
     "options": ["Dollar", "Pound", "Franc", "Yen", "Won", "Euro"],
     "explanation": "Euro (€) là đồng tiền chung của nhiều quốc gia thuộc Liên minh Châu Âu."},
]

ROUND_5_QUESTIONS = [
    {"code": f"{Q_PREFIX}_5_01", "answer": "D", "content": "Vitamin nào được tổng hợp khi da tiếp xúc với ánh nắng mặt trời?",
     "options": ["Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D", "Vitamin E", "Vitamin K"],
     "explanation": "Vitamin D được tổng hợp qua da khi tiếp xúc với tia UV từ ánh nắng."},
    {"code": f"{Q_PREFIX}_5_02", "answer": "C", "content": "Thành phố nào được mệnh danh là 'Thành phố tình yêu'?",
     "options": ["Venice", "Rome", "Paris", "Barcelona", "Vienna", "Prague"],
     "explanation": "Paris (Pháp) được mệnh danh là 'Thành phố tình yêu' (City of Love)."},
    {"code": f"{Q_PREFIX}_5_03", "answer": "A", "content": "Loài động vật nào lớn nhất từng tồn tại trên Trái Đất?",
     "options": ["Cá voi xanh", "Khủng long T-Rex", "Voi châu Phi", "Cá mập trắng", "Bạch tuộc khổng lồ", "Hươu cao cổ"],
     "explanation": "Cá voi xanh (Blue Whale) dài tới 30m, nặng ~150 tấn — lớn nhất mọi thời đại."},
    {"code": f"{Q_PREFIX}_5_04", "answer": "B", "content": "Trái Đất quay quanh Mặt Trời mất khoảng bao lâu?",
     "options": ["30 ngày", "365 ngày", "180 ngày", "24 giờ", "12 tháng", "52 tuần"],
     "explanation": "Trái Đất mất khoảng 365,25 ngày để hoàn thành một vòng quay quanh Mặt Trời."},
    {"code": f"{Q_PREFIX}_5_05", "answer": "E", "content": "Kim cương được tạo thành chủ yếu từ nguyên tố nào?",
     "options": ["Silicon", "Sắt", "Oxy", "Nhôm", "Carbon", "Hydro"],
     "explanation": "Kim cương là dạng thù hình tinh thể của carbon (C)."},
    {"code": f"{Q_PREFIX}_5_06", "answer": "C", "content": "Quốc gia nào có dân số đông nhất thế giới (2024)?",
     "options": ["Trung Quốc", "Mỹ", "Ấn Độ", "Indonesia", "Brazil", "Pakistan"],
     "explanation": "Ấn Độ đã vượt Trung Quốc trở thành quốc gia đông dân nhất năm 2023."},
    {"code": f"{Q_PREFIX}_5_07", "answer": "F", "content": "Ngôn ngữ lập trình nào do Guido van Rossum tạo ra?",
     "options": ["Java", "C++", "JavaScript", "Ruby", "Go", "Python"],
     "explanation": "Python được Guido van Rossum tạo ra vào cuối những năm 1980."},
    {"code": f"{Q_PREFIX}_5_08", "answer": "A", "content": "Bức tranh 'Mona Lisa' được trưng bày ở bảo tàng nào?",
     "options": ["Louvre", "British Museum", "Uffizi", "Metropolitan", "Prado", "Hermitage"],
     "explanation": "Mona Lisa của Leonardo da Vinci được trưng bày tại Bảo tàng Louvre, Paris."},
]

ALL_QUESTIONS = ROUND_1_QUESTIONS + ROUND_2_QUESTIONS + ROUND_3_QUESTIONS + ROUND_4_QUESTIONS + ROUND_5_QUESTIONS

# Map question_code → correct answer letter
KNOWN_CORRECT: dict[str, str] = {q["code"]: q["answer"] for q in ALL_QUESTIONS}

OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sep(title: str = "") -> None:
    line = "─" * 70
    if title:
        print(f"\n{line}\n  {title}\n{line}")
    else:
        print(line)


def _db_url() -> str:
    return (
        f"postgresql+asyncpg://{configs.POSTGRES_DB_USER}:{configs.POSTGRES_DB_PASSWORD}"
        f"@{configs.POSTGRES_DB_HOST}:{configs.POSTGRES_DB_PORT}/{configs.POSTGRES_DB_NAME}"
    )


def _ws_url(token: str) -> str:
    ws_base = configs.API_URL.replace("http://", "ws://").replace("https://", "wss://")
    return f"{ws_base}/ws/{configs.MATCH_CODE}?token={token}"


def _pick_answer(q_code: str, available_options: list[str]) -> str:
    correct = KNOWN_CORRECT.get(q_code)
    opts = available_options or OPTION_LETTERS
    if correct and random.random() < configs.CORRECT_RATE:
        return correct
    wrong_opts = [o for o in opts if o != correct] if correct else opts
    return random.choice(wrong_opts or opts)


# ---------------------------------------------------------------------------
# Phase 0 — Wait for PostgreSQL
# ---------------------------------------------------------------------------

async def _wait_for_db() -> None:
    _sep("Phase 0 — Waiting for PostgreSQL")
    import asyncpg  # type: ignore
    attempt = 0
    while True:
        attempt += 1
        try:
            conn = await asyncpg.connect(
                user=configs.POSTGRES_DB_USER,
                password=configs.POSTGRES_DB_PASSWORD,
                host=configs.POSTGRES_DB_HOST,
                port=configs.POSTGRES_DB_PORT,
                database=configs.POSTGRES_DB_NAME,
                timeout=5,
            )
            await conn.close()
            print(f"  DB ready after {attempt} attempt(s).")
            return
        except Exception as exc:
            print(f"  [{attempt}] DB not ready yet ({exc.__class__.__name__}), retrying in 3s...")
            await asyncio.sleep(3)


# ---------------------------------------------------------------------------
# Phase 1 — Seed players + match + questions (idempotent)
# ---------------------------------------------------------------------------

async def _seed() -> None:
    _sep("Phase 1 — Seeding players, match, questions")
    engine = create_async_engine(_db_url(), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as s:
        async with s.begin():
            # ── Match ─────────────────────────────────────────────────────────
            row = (await s.execute(
                text("SELECT id FROM matches WHERE match_code=:c"), {"c": configs.MATCH_CODE}
            )).fetchone()
            if row:
                match_id = str(row[0])
                print(f"  Match {configs.MATCH_CODE} already exists (id={match_id[:8]}…)")
            else:
                match_id = str(uuid.uuid4())
                await s.execute(
                    text(
                        "INSERT INTO matches (id,match_code,match_name,match_status,is_deleted,created_at,updated_at) "
                        "VALUES (:id,:code,:name,'setup',false,now(),now())"
                    ),
                    {"id": match_id, "code": configs.MATCH_CODE, "name": configs.MATCH_NAME},
                )
                print(f"  Created match {configs.MATCH_CODE}")

            # ── Players ───────────────────────────────────────────────────────
            created_p = 0
            for i in range(1, configs.N_PLAYERS + 1):
                code = f"{configs.PLAYER_PREFIX}{i:02d}"
                exists = (await s.execute(
                    text("SELECT id FROM users WHERE user_code=:c"), {"c": code}
                )).fetchone()
                if not exists:
                    await s.execute(
                        text(
                            "INSERT INTO users (id,user_code,user_name,hashed_password,role,is_deleted,created_at,updated_at) "
                            "VALUES (:id,:code,:name,:pw,'player',false,now(),now())"
                        ),
                        {
                            "id": str(uuid.uuid4()),
                            "code": code,
                            "name": f"Thi sinh {i:02d}",
                            "pw": _pwd_ctx.hash(configs.PLAYER_PW),
                        },
                    )
                    created_p += 1
            print(f"  Players: {created_p} created, {configs.N_PLAYERS - created_p} already exist")

            # ── Questions ─────────────────────────────────────────────────────
            created_q = 0
            skipped_q = 0
            for q in ALL_QUESTIONS:
                exists = (await s.execute(
                    text("SELECT id FROM questions WHERE question_code=:c"), {"c": q["code"]}
                )).fetchone()
                if exists:
                    skipped_q += 1
                    continue
                await s.execute(
                    text(
                        "INSERT INTO questions "
                        "(id,question_code,content,answer,options,explanation,match_id,is_used,is_deleted,created_at,updated_at) "
                        "VALUES (:id,:code,:content,:answer,:options,:expl,:match_id,false,false,now(),now())"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "code": q["code"],
                        "content": q["content"],
                        "answer": q["answer"],
                        "options": json.dumps(q["options"], ensure_ascii=False),
                        "expl": q["explanation"],
                        "match_id": match_id,
                    },
                )
                created_q += 1
            print(f"  Questions: {created_q} created, {skipped_q} already exist")

    await engine.dispose()
    print("  Phase 1 complete.")


# ---------------------------------------------------------------------------
# Phase 2 — Wait for backend /health
# ---------------------------------------------------------------------------

async def _wait_for_backend() -> None:
    _sep("Phase 2 — Waiting for backend")
    health_url = f"{configs.API_URL}/health"
    attempt = 0
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            attempt += 1
            try:
                resp = await client.get(health_url)
                if resp.status_code == 200 and resp.json().get("status") == "healthy":
                    print(f"  Backend ready after {attempt} attempt(s).")
                    return
            except Exception:
                pass
            print(f"  [{attempt}] Backend not ready yet, retrying in 3s...")
            await asyncio.sleep(3)


# ---------------------------------------------------------------------------
# Phase 3 — Login + WebSocket passive bots
# ---------------------------------------------------------------------------

async def _login_one(client: httpx.AsyncClient, code: str) -> tuple[str, str | None]:
    try:
        resp = await client.post(
            f"{configs.API_URL}/auth/login",
            data={"username": code, "password": configs.PLAYER_PW},
            timeout=15,
        )
        if resp.status_code == 200:
            return code, resp.json().get("access_token")
    except Exception:
        pass
    return code, None


class PlayerBot:
    def __init__(self, player_code: str, token: str) -> None:
        self.player_code = player_code
        self.token = token
        self._short = player_code.replace(configs.PLAYER_PREFIX, "P")
        self._answered: set[str] = set()
        self._pending_q_code: str | None = None
        self._pending_q_opts: list[str] = []
        self._answer_tasks: list[asyncio.Task] = []

    async def _submit(self, q_code: str, answer: str, timestamp: float) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{configs.API_URL}/answers/",
                    headers={"Authorization": f"Bearer {self.token}"},
                    json={
                        "user_code": self.player_code,
                        "match_code": configs.MATCH_CODE,
                        "question_code": q_code,
                        "answer_text": answer,
                        "has_buzzed": False,
                        "timestamp": timestamp,
                    },
                )
                return resp.status_code in (200, 201)
        except Exception:
            return False

    async def _delayed_answer(self, q_code: str, opts: list[str], eff_max: float) -> None:
        try:
            if random.random() < configs.SKIP_RATE:
                return

            delay = random.uniform(configs.MIN_DELAY, max(configs.MIN_DELAY, eff_max))
            await asyncio.sleep(delay)

            if q_code in self._answered:
                return

            answer = _pick_answer(q_code, opts)
            ok = await self._submit(q_code, answer, round(delay, 3))

            if ok:
                self._answered.add(q_code)
                known = KNOWN_CORRECT.get(q_code)
                mark = (" ✓" if answer == known else " ✗") if known else ""
                print(f"  {self._short:<6}  {answer}{mark:<3}  {delay:.1f}s  [{q_code}]")
            else:
                print(f"  {self._short:<6}  FAIL  [{q_code}]")
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

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
            time_limit = msg.get("time_limit", configs.MAX_DELAY)
            eff_max = min(configs.MAX_DELAY, float(time_limit) - 0.3)
            eff_max = max(configs.MIN_DELAY, eff_max)
            task = asyncio.create_task(self._delayed_answer(q_code, opts, eff_max))
            self._answer_tasks.append(task)
            self._answer_tasks = [t for t in self._answer_tasks if not t.done()]

        elif msg_type == "clear_question":
            for t in self._answer_tasks:
                t.cancel()
            self._answer_tasks = []
            self._pending_q_code = None
            self._pending_q_opts = []

    async def _heartbeat(self, ws) -> None:
        try:
            while True:
                await asyncio.sleep(15)
                await ws.send(json.dumps({"type": "player_heartbeat"}))
        except (asyncio.CancelledError, Exception):
            pass

    async def run(self) -> None:
        url = _ws_url(self.token)
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
            except (ConnectionClosed, Exception):
                await asyncio.sleep(3)
                continue

        for t in self._answer_tasks:
            t.cancel()
        with contextlib.suppress(Exception):
            if self._answer_tasks:
                await asyncio.gather(*self._answer_tasks, return_exceptions=True)


def _parse_options(options) -> list[str]:
    # Always return letter keys (A-F), never full option texts.
    # The WS message sends display text (e.g. "Sao Mộc"), not letters.
    if isinstance(options, list):
        return OPTION_LETTERS[: len(options)]
    if isinstance(options, dict):
        return OPTION_LETTERS[: len(options)]
    return OPTION_LETTERS


async def _run_bots() -> None:
    _sep("Phase 3 — Logging in players concurrently")
    async with httpx.AsyncClient(timeout=20) as client:
        results: list[tuple[str, str | None]] = await asyncio.gather(*[
            _login_one(client, f"{configs.PLAYER_PREFIX}{i:02d}")
            for i in range(1, configs.N_PLAYERS + 1)
        ])

    tokens: dict[str, str] = {}
    for code, token in results:
        if token:
            tokens[code] = token
        else:
            print(f"  [!] Login failed: {code}")

    print(f"  Logged in: {len(tokens)}/{configs.N_PLAYERS}")
    if not tokens:
        print("  [!] No players logged in — exiting.")
        return

    bots = [PlayerBot(code, token) for code, token in tokens.items()]

    print(f"\n  {len(bots)} bots connecting to WebSocket...")
    print()
    print("  ╔══════════════════════════════════════════════════════════════════╗")
    print("  ║  Admin điều khiển UI bình thường.                               ║")
    print("  ║  Khi BẤM GIỜ, tất cả bots tự động trả lời cùng lúc.            ║")
    print("  ╚══════════════════════════════════════════════════════════════════╝")
    print()

    tasks = [asyncio.create_task(bot.run()) for bot in bots]
    try:
        await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        for t in tasks:
            t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.gather(*tasks, return_exceptions=True)
        print(f"\n  {len(bots)} bots disconnected.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main() -> None:
    _sep("QUALIFIER BOT — Auto-seed + Passive Bots")
    print(f"  API      : {configs.API_URL}")
    print(f"  Match    : {configs.MATCH_CODE}")
    print(f"  Players  : {configs.N_PLAYERS}")
    print(f"  Đúng     : {configs.CORRECT_RATE:.0%}  |  Bỏ: {configs.SKIP_RATE:.0%}")
    print(f"  Delay    : {configs.MIN_DELAY}–{configs.MAX_DELAY}s")

    await _wait_for_db()
    await _seed()
    await _wait_for_backend()
    await _run_bots()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n  [Ctrl+C] Stopped.")
