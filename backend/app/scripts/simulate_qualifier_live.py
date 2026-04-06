#!/usr/bin/env python3
"""
simulate_qualifier_live.py — Interactive simulation of the qualifier round.

Simulates players submitting answers live so admin can watch answers arrive
on the AQualifierPage in real-time.

Flow per question:
  1. Script prints which question is next.
  2. Admin selects the question on UI and clicks "BẤM GIỜ" (or just be ready).
  3. Admin presses Enter in this terminal → script submits answers one-by-one.
  4. Admin watches player bars update with answers.
  5. Admin clicks "TÍNH ĐIỂM" on UI.
  6. Admin presses Enter → next question.

Run inside the app container:
  podman exec -it -w /backend/app app python scripts/simulate_qualifier_live.py

Or locally with a venv that has httpx + sqlalchemy + passlib:
  python backend/app/scripts/simulate_qualifier_live.py
"""

import argparse
import asyncio
import contextlib
import json
import os
import random
import sys
from typing import Any
from pathlib import Path

_ENV_FILE = Path(__file__).parent.parent / "configs" / ".env"
if _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
    except ImportError:
        pass

try:
    import httpx
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
except ImportError as e:
    print(f"[!] Missing dependency: {e}")
    sys.exit(1)

try:
    import websockets
except ImportError:
    websockets = None

# ── Constants ────────────────────────────────────────────────────────────────

MATCH_CODE    = "OC3_M_VL"
ROUND_NUMBER  = 1
QUESTION_CODES = [f"OC3_Q_VL_1_{i:02d}" for i in range(1, 9)]
CORRECT_ANSWERS = ["A", "C", "B", "D", "A", "B", "E", "C"]   # matches QUESTIONS_DATA in simulate_qualifier.py

ADMIN_CODE = "OC_U_ADMIN_TST"
ADMIN_PW   = "admintest1"
PLAYER_PREFIX = "OC_U_P03TST"
PLAYER_PW     = "testpass1"
N_PLAYERS     = 20   # use first 20 test players

OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"]

# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_db_url() -> str:
    # Allow full override via DATABASE_URL env var
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    user = os.environ.get("POSTGRES_DB_USER", "postgres")
    pw   = os.environ.get("POSTGRES_DB_PASSWORD", "")
    host = os.environ.get("POSTGRES_DB_HOST", "postgresql")
    port = os.environ.get("POSTGRES_DB_PORT", "5432")
    name = os.environ.get("POSTGRES_DB_NAME", "oc3")
    return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{name}"


def _build_api_url() -> str:
    return os.environ.get("API_URL", "http://localhost:8000")


def _build_ws_url(api_url: str, token: str) -> str:
    ws_base = api_url.replace("http://", "ws://", 1).replace("https://", "wss://", 1)
    return f"{ws_base}/ws/{MATCH_CODE}?token={token}"


async def clean_qualifier_data(db_url: str) -> None:
    """Delete all qualifier records, advancements, and answers for this match."""
    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        async with s.begin():
            r1 = await s.execute(
                text("DELETE FROM qualifier_records WHERE match_id=(SELECT id FROM matches WHERE match_code=:mc)"),
                {"mc": MATCH_CODE},
            )
            r2 = await s.execute(
                text("DELETE FROM qualifier_advancements WHERE match_id=(SELECT id FROM matches WHERE match_code=:mc)"),
                {"mc": MATCH_CODE},
            )
            q_ph = ", ".join(f":q{i}" for i in range(len(QUESTION_CODES)))
            params = {f"q{i}": c for i, c in enumerate(QUESTION_CODES)}
            params["mc"] = MATCH_CODE
            r3 = await s.execute(
                text(
                    f"DELETE FROM answers WHERE question_id IN "
                    f"(SELECT id FROM questions WHERE question_code IN ({q_ph})) "
                    f"AND match_id=(SELECT id FROM matches WHERE match_code=:mc)"
                ),
                params,
            )
    await engine.dispose()
    print(f"  [clean] records={r1.rowcount} advancements={r2.rowcount} answers={r3.rowcount}")

    # Clean Valkey
    try:
        valkey_url = os.environ.get("VALKEY_URL") or (
            f"valkey://{os.environ.get('VALKEY_USER','user')}:{os.environ.get('VALKEY_PASSWORD','')}@"
            f"{os.environ.get('VALKEY_HOST','localhost')}:{os.environ.get('VALKEY_PORT','6379')}"
        )
        from valkey.asyncio import Valkey  # type: ignore
        vk = Valkey.from_url(valkey_url, decode_responses=True)
        cursor, deleted = 0, 0
        while True:
            cursor, keys = await vk.scan(cursor, match=f"answer:{MATCH_CODE}:*", count=200)
            if keys:
                await vk.delete(*keys)
                deleted += len(keys)
            if cursor == 0:
                break
        for k in [
            f"qualifier_leaderboard:{MATCH_CODE}",
            f"qualifier_correct_score:{MATCH_CODE}",
            f"qualifier_response_time:{MATCH_CODE}",
            f"qualifier_response_count:{MATCH_CODE}",
        ]:
            await vk.delete(k)
        await vk.aclose()
        print(f"  [clean] Valkey answer keys={deleted}")
    except Exception as e:
        print(f"  [warn] Valkey clean skipped: {e}")


async def login(client: httpx.AsyncClient, api_url: str, code: str, pw: str) -> str | None:
    resp = await client.post(f"{api_url}/auth/login", data={"username": code, "password": pw})
    if resp.status_code != 200:
        return None
    return resp.json().get("access_token")


async def submit_answer(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
    player_code: str,
    question_code: str,
    answer_text: str,
    timestamp: float,
) -> bool:
    resp = await client.post(
        f"{api_url}/answers/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "user_code": player_code,
            "match_code": MATCH_CODE,
            "question_code": question_code,
            "answer_text": answer_text,
            "has_buzzed": False,
            "timestamp": round(timestamp, 3),
        },
        timeout=10,
    )
    return resp.status_code in (200, 201)


async def open_player_socket(api_url: str, token: str, player_code: str) -> dict[str, Any] | None:
    if websockets is None:
        return None

    ws = await websockets.connect(_build_ws_url(api_url, token))

    async def drain_messages() -> None:
        try:
            async for _ in ws:
                # keep the connection healthy; admin/player messages are not needed by this script
                pass
        except Exception:
            return

    async def send_heartbeat() -> None:
        try:
            while True:
                await asyncio.sleep(15)
                await ws.send(json.dumps({"type": "player_heartbeat"}))
        except Exception:
            return

    await ws.send(json.dumps({"type": "player_online"}))
    await ws.send(json.dumps({"type": "request_qualifier_state"}))

    return {
        "ws": ws,
        "drain_task": asyncio.create_task(drain_messages()),
        "heartbeat_task": asyncio.create_task(send_heartbeat()),
        "player_code": player_code,
    }


async def close_player_sockets(player_sockets: dict[str, dict[str, Any]]) -> None:
    for entry in player_sockets.values():
        for task_name in ("heartbeat_task", "drain_task"):
            task = entry.get(task_name)
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        ws = entry.get("ws")
        if ws:
            with contextlib.suppress(Exception):
                await ws.close()


async def mirror_answer_via_ws(
    socket_entry: dict[str, Any] | None,
    question_code: str,
    answer_text: str,
    timestamp: float,
) -> bool:
    if not socket_entry:
        return False
    ws = socket_entry.get("ws")
    if not ws:
        return False
    try:
        await ws.send(
            json.dumps(
                {
                    "type": "answer",
                    "question_code": question_code,
                    "answer_text": answer_text,
                    "timestamp": round(timestamp, 3),
                }
            )
        )
        return True
    except Exception:
        return False


async def submit_answer_live(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
    player_code: str,
    question_code: str,
    answer_text: str,
    timestamp: float,
    socket_entry: dict[str, Any] | None = None,
) -> tuple[bool, bool]:
    post_ok = await submit_answer(
        client,
        api_url,
        token,
        player_code,
        question_code,
        answer_text,
        timestamp,
    )
    ws_ok = await mirror_answer_via_ws(socket_entry, question_code, answer_text, timestamp)
    return post_ok, ws_ok


async def calculate_scores(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
    question_code: str,
    correct_answer: str,
) -> dict | None:
    resp = await client.post(
        f"{api_url}/qualifier/calculate-scores",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "match_code": MATCH_CODE,
            "question_code": question_code,
            "correct_answer": correct_answer,
            "round_number": ROUND_NUMBER,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  [!] calculate-scores: {resp.status_code} {resp.text[:150]}")
        return None
    return resp.json().get("data")


async def end_round(client: httpx.AsyncClient, api_url: str, token: str) -> None:
    resp = await client.post(
        f"{api_url}/qualifier/end-round",
        headers={"Authorization": f"Bearer {token}"},
        json={"match_code": MATCH_CODE, "round_number": ROUND_NUMBER},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  [!] end-round: {resp.status_code} {resp.text[:150]}")
    else:
        data = resp.json().get("data", {})
        passed = data.get("passed_count", "?")
        reserve = data.get("reserve_count", "?")
        print(f"  [OK] Round ended — passed={passed} reserve={reserve}")


def prompt(msg: str, auto: bool = False) -> None:
    """Print msg and wait for Enter (skip in auto mode)."""
    if auto:
        print(f"\n  [auto] {msg}")
        return
    input(f"\n  {msg} [nhấn Enter để tiếp tục] ")


def sep(title: str = "") -> None:
    line = "─" * 64
    if title:
        print(f"\n{line}")
        print(f"  {title}")
        print(line)
    else:
        print(f"\n{line}")


# ── Main ─────────────────────────────────────────────────────────────────────

async def main(
    auto: bool,
    delay: float,
    n_players: int,
    skip_clean: bool,
    auto_score: bool,
    burst: bool,
    question_limit: int | None,
    no_end_round: bool,
    no_ws: bool,
) -> None:
    random.seed(42)

    api_url = _build_api_url()
    db_url  = _build_db_url()

    sep("SIMULATE QUALIFIER LIVE")
    print(f"  API: {api_url}  |  Players: {n_players}  |  Delay: {delay}s  |  Burst: {burst}")

    # ── Step 1: Clean ────────────────────────────────────────────────────────
    if skip_clean:
        print("\n  [skip] Bỏ qua bước xóa dữ liệu cũ.")
    else:
        sep("Bước 1 — Xóa dữ liệu qualifier cũ")
        await clean_qualifier_data(db_url)

    # ── Step 2: Login ────────────────────────────────────────────────────────
    sep("Bước 2 — Đăng nhập Admin + Players")
    async with httpx.AsyncClient(timeout=30) as client:
        player_sockets: dict[str, dict[str, Any]] = {}

        admin_token = await login(client, api_url, ADMIN_CODE, ADMIN_PW)
        if not admin_token:
            print(f"  [!] Login admin thất bại — kiểm tra backend đang chạy.")
            return
        print(f"  Admin ({ADMIN_CODE}): OK")

        player_tokens: dict[str, str] = {}
        for i in range(1, n_players + 1):
            code = f"{PLAYER_PREFIX}{i:02d}"
            tok = await login(client, api_url, code, PLAYER_PW)
            if tok:
                player_tokens[code] = tok
        print(f"  Players đăng nhập: {len(player_tokens)}/{n_players}")

        if not player_tokens:
            print("  [!] Không có player token — chạy seed_test_players.py trước.")
            return

        player_codes = list(player_tokens.keys())

        if not no_ws:
            if websockets is None:
                print("  [warn] Không có thư viện websockets — bỏ qua WS mirror, chỉ test API.")
            else:
                sep("Bước 2.5 — Kết nối WebSocket cho players")
                for code in player_codes:
                    try:
                        entry = await open_player_socket(api_url, player_tokens[code], code)
                        if entry:
                            player_sockets[code] = entry
                    except Exception as e:
                        print(f"  [warn] WS connect failed for {code}: {e}")
                print(f"  Players WS connected: {len(player_sockets)}/{len(player_codes)}")
                # Give the admin UI a short moment to process player_online events.
                await asyncio.sleep(1.0)

        # ── Step 3: Per-question simulation ─────────────────────────────────
        sep("Bước 3 — Mô phỏng từng câu hỏi")

        if not auto:
            print("\n  💡 Hướng dẫn:")
            print("     • Trên tab admin UI, click 'BẮT ĐẦU VÒNG' nếu chưa bắt đầu.")
            print("     • Mỗi câu: chọn câu hỏi trên UI, click 'BẤM GIỜ', rồi nhấn Enter ở đây.")
            print("     • Script sẽ submit đáp án của tất cả players.")
            print("     • Sau đó: click 'TÍNH ĐIỂM' trên UI rồi Enter để sang câu tiếp theo.")

        question_pairs = list(zip(QUESTION_CODES, CORRECT_ANSWERS))
        if question_limit is not None:
            question_pairs = question_pairs[: max(0, question_limit)]

        for qi, (q_code, correct) in enumerate(question_pairs, start=1):
            sep(f"Câu {qi}/8  [{q_code}]  Đáp án đúng: {correct}")

            if not auto:
                prompt(f"Admin: chọn câu {qi} trên UI, click 'BẤM GIỜ'")

            # Build answer distribution: ~55% correct, ~30% wrong, ~15% no-answer
            answers: list[tuple[str, str]] = []
            for code in player_codes:
                roll = random.random()
                if roll < 0.15:
                    continue  # no answer
                elif roll < 0.70:
                    ans = correct
                else:
                    ans = random.choice([o for o in OPTION_LETTERS if o != correct])
                answers.append((code, ans))

            random.shuffle(answers)  # mix correct/wrong order for realistic arrival

            print(f"\n  Submitting {len(answers)} answers ({len(player_codes) - len(answers)} skipped)...")

            ok = fail = 0
            ws_ok_count = 0

            if burst:
                async def run_one(idx: int, code: str, ans: str) -> tuple[int, str, str, float, bool, bool]:
                    ts = round(random.uniform(1.5, 9.5), 3)
                    post_ok, ws_ok = await submit_answer_live(
                        client,
                        api_url,
                        player_tokens[code],
                        code,
                        q_code,
                        ans,
                        ts,
                        player_sockets.get(code),
                    )
                    return idx, code, ans, ts, post_ok, ws_ok

                results = await asyncio.gather(
                    *(run_one(idx, code, ans) for idx, (code, ans) in enumerate(answers, start=1))
                )
                for idx, code, ans, ts, post_ok, ws_ok in results:
                    short = code.replace("OC_U_P03TST", "TST")
                    marker = "✓" if ans == correct else "✗"
                    if post_ok:
                        ok += 1
                    else:
                        fail += 1
                    if ws_ok:
                        ws_ok_count += 1
                    status = marker if post_ok else "!!"
                    print(f"    [{idx:>2}/{len(answers)}]  {status} {short:<8}  → {ans}  ({ts}s)  ws={'OK' if ws_ok else '--'}")
            else:
                for idx, (code, ans) in enumerate(answers, start=1):
                    ts = round(random.uniform(1.5, 9.5), 3)
                    post_ok, ws_ok = await submit_answer_live(
                        client,
                        api_url,
                        player_tokens[code],
                        code,
                        q_code,
                        ans,
                        ts,
                        player_sockets.get(code),
                    )
                    if post_ok:
                        ok += 1
                        marker = "✓" if ans == correct else "✗"
                        short = code.replace("OC_U_P03TST", "TST")
                        print(f"    [{idx:>2}/{len(answers)}]  {marker} {short:<8}  → {ans}  ({ts}s)  ws={'OK' if ws_ok else '--'}")
                    else:
                        fail += 1
                        print(f"    [{idx:>2}/{len(answers)}]  !! {code} FAIL")
                    if ws_ok:
                        ws_ok_count += 1
                    await asyncio.sleep(delay)

            print(f"\n  Done: {ok} submitted, {fail} failed")
            if player_sockets:
                print(f"  WS mirrored: {ws_ok_count}/{len(answers)}")
            correct_count = sum(1 for _, a in answers if a == correct)
            print(f"  Phân bổ: {correct_count} đúng / {len(answers) - correct_count} sai / {len(player_codes) - len(answers)} bỏ")

            if auto_score or auto:
                # Auto calculate scores without waiting for admin
                await asyncio.sleep(1.0)
                result = await calculate_scores(client, api_url, admin_token, q_code, correct)
                if result:
                    print(f"  [auto-score] correct={result.get('correct_count')}  wrong={result.get('wrong_count')}")
            else:
                prompt("Admin: click 'TÍNH ĐIỂM' trên UI", auto=auto)

        # ── Step 4: End round ────────────────────────────────────────────────
        if no_end_round:
            sep("Hoàn thành!")
            print("  Đã dừng trước bước KẾT THÚC VÒNG để bạn quan sát trạng thái players trên UI.")
        else:
            sep("Bước 4 — Kết thúc Vòng")
            prompt("Admin: click 'KẾT THÚC VÒNG' trên UI (hoặc Enter để script gọi API)", auto=auto)
            await end_round(client, api_url, admin_token)
            sep("Hoàn thành!")
            print("  Kết quả đã lưu trong DB. Refresh trang admin để xem BXH.")

        await close_player_sockets(player_sockets)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate qualifier live answers")
    parser.add_argument("--auto",       action="store_true", help="Không hỏi admin, tự động chạy hết")
    parser.add_argument("--auto-score", action="store_true", help="Tự động tính điểm (không cần admin click)")
    parser.add_argument("--burst",      action="store_true", help="Submit answer gần như đồng thời cho mỗi câu")
    parser.add_argument("--delay",      type=float, default=0.4, help="Delay giữa các answer (giây, default 0.4)")
    parser.add_argument("--players",    type=int,   default=N_PLAYERS, help=f"Số players (default {N_PLAYERS})")
    parser.add_argument("--question-limit", type=int, default=None, help="Chỉ chạy N câu đầu tiên")
    parser.add_argument("--no-end-round", action="store_true", help="Không gọi end-round, giữ nguyên trạng thái để quan sát UI")
    parser.add_argument("--no-ws", action="store_true", help="Chỉ submit API, không mirror qua WebSocket")
    parser.add_argument("--skip-clean", action="store_true", help="Bỏ qua bước xóa data cũ")
    parser.add_argument("--api-url",    default=None, help="API base URL")
    args = parser.parse_args()

    if args.api_url:
        os.environ["API_URL"] = args.api_url

    asyncio.run(main(
        auto=args.auto,
        delay=args.delay,
        n_players=args.players,
        skip_clean=args.skip_clean,
        auto_score=args.auto_score,
        burst=args.burst,
        question_limit=args.question_limit,
        no_end_round=args.no_end_round,
        no_ws=args.no_ws,
    ))
