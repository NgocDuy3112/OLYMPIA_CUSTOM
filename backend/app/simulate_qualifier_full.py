#!/usr/bin/env python3
"""
simulate_qualifier_full.py — Full 5-round qualifier simulation.

Runs all 5 rounds sequentially:
  Round 1: 8 questions → advance top 8
  Round 2: 4 questions → advance top 4
  Round 3: 2 questions → advance top 2
  Round 4: 2 questions → advance top 2
  Round 5 (dự phòng): 8 questions → fill remaining to 16

After each round, calls end-round API, then queries advancements
to determine which players continue to the next round.

Run inside the app container:
  podman exec -it -w /backend/app app python simulate_qualifier_full.py --auto --burst --players 10
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

# ── Round configuration ──────────────────────────────────────────────────────

MATCH_CODE = "OC3_M_VL"
ADMIN_CODE = "OC_U_ADMIN_TST"
ADMIN_PW   = "admintest1"
PLAYER_PREFIX = "OC_U_P03TST"
PLAYER_PW     = "testpass1"
OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"]

# Per-round: question codes + correct answers (must match seed data)
ROUNDS = {
    1: {
        "questions": [
            ("OC3_Q_VL_1_01", "A"),
            ("OC3_Q_VL_1_02", "C"),
            ("OC3_Q_VL_1_03", "B"),
            ("OC3_Q_VL_1_04", "D"),
            ("OC3_Q_VL_1_05", "A"),
            ("OC3_Q_VL_1_06", "B"),
            ("OC3_Q_VL_1_07", "E"),
            ("OC3_Q_VL_1_08", "C"),
        ],
    },
    2: {
        "questions": [
            ("OC3_Q_VL_2_01", "B"),
            ("OC3_Q_VL_2_02", "A"),
            ("OC3_Q_VL_2_03", "C"),
            ("OC3_Q_VL_2_04", "D"),
        ],
    },
    3: {
        "questions": [
            ("OC3_Q_VL_3_01", "E"),
            ("OC3_Q_VL_3_02", "A"),
        ],
    },
    4: {
        "questions": [
            ("OC3_Q_VL_4_01", "B"),
            ("OC3_Q_VL_4_02", "F"),
        ],
    },
    5: {
        "questions": [
            ("OC3_Q_VL_5_01", "D"),
            ("OC3_Q_VL_5_02", "C"),
            ("OC3_Q_VL_5_03", "A"),
            ("OC3_Q_VL_5_04", "B"),
            ("OC3_Q_VL_5_05", "E"),
            ("OC3_Q_VL_5_06", "C"),
            ("OC3_Q_VL_5_07", "F"),
            ("OC3_Q_VL_5_08", "A"),
        ],
    },
}

ALL_QUESTION_CODES = [qc for r in ROUNDS.values() for qc, _ in r["questions"]]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_db_url() -> str:
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


async def clean_all_qualifier_data(db_url: str) -> None:
    """Delete ALL qualifier records, advancements, and answers for ALL rounds."""
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
            # Delete answers for ALL question codes across all rounds
            q_ph = ", ".join(f":q{i}" for i in range(len(ALL_QUESTION_CODES)))
            params = {f"q{i}": c for i, c in enumerate(ALL_QUESTION_CODES)}
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
        from valkey.asyncio import Valkey
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
        print(f"  [clean] Valkey: answer keys={deleted}, leaderboard cleared")
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

    async def drain():
        try:
            async for _ in ws:
                pass
        except Exception:
            return

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(15)
                await ws.send(json.dumps({"type": "player_heartbeat"}))
        except Exception:
            return

    await ws.send(json.dumps({"type": "player_online"}))
    return {
        "ws": ws,
        "drain_task": asyncio.create_task(drain()),
        "heartbeat_task": asyncio.create_task(heartbeat()),
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
        await ws.send(json.dumps({
            "type": "answer",
            "question_code": question_code,
            "answer_text": answer_text,
            "timestamp": round(timestamp, 3),
        }))
        return True
    except Exception:
        return False


async def calculate_scores(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
    question_code: str,
    correct_answer: str,
    round_number: int,
) -> dict | None:
    resp = await client.post(
        f"{api_url}/qualifier/calculate-scores",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "match_code": MATCH_CODE,
            "question_code": question_code,
            "correct_answer": correct_answer,
            "round_number": round_number,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  [!] calculate-scores: {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json().get("data")


async def end_round(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
    round_number: int,
) -> dict | None:
    resp = await client.post(
        f"{api_url}/qualifier/end-round",
        headers={"Authorization": f"Bearer {token}"},
        json={"match_code": MATCH_CODE, "round_number": round_number},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  [!] end-round {round_number}: {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json().get("data")


async def get_advancements(
    client: httpx.AsyncClient,
    api_url: str,
    token: str,
) -> list[dict]:
    resp = await client.get(
        f"{api_url}/qualifier/advancements/{MATCH_CODE}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code != 200:
        return []
    body = resp.json().get("data", {})
    # API returns {"data": {"advancements": [...]}}
    if isinstance(body, dict):
        return body.get("advancements", [])
    return body if isinstance(body, list) else []


def sep(title: str = "") -> None:
    line = "═" * 70
    if title:
        print(f"\n{line}")
        print(f"  {title}")
        print(line)
    else:
        print(f"\n{line}")


def prompt(msg: str, auto: bool = False) -> None:
    if auto:
        print(f"  [auto] {msg}")
        return
    input(f"  {msg} [Enter] ")


# ── Main ─────────────────────────────────────────────────────────────────────

async def main(
    auto: bool,
    delay: float,
    n_players: int,
    skip_clean: bool,
    burst: bool,
    no_ws: bool,
    rounds_to_run: list[int],
    pause_between_rounds: bool,
) -> None:
    random.seed(42)
    api_url = _build_api_url()
    db_url  = _build_db_url()

    sep("SIMULATE FULL QUALIFIER — 5 VÒNG LOẠI")
    print(f"  API: {api_url}")
    print(f"  Players: {n_players}  |  Rounds: {rounds_to_run}")
    print(f"  Burst: {burst}  |  Delay: {delay}s  |  WS: {'ON' if not no_ws else 'OFF'}")

    # ── Clean ────────────────────────────────────────────────────────────────
    if not skip_clean:
        sep("XÓA DỮ LIỆU QUALIFIER CŨ")
        await clean_all_qualifier_data(db_url)

    # ── Login ────────────────────────────────────────────────────────────────
    sep("ĐĂNG NHẬP")
    async with httpx.AsyncClient(timeout=30) as client:
        player_sockets: dict[str, dict[str, Any]] = {}

        admin_token = await login(client, api_url, ADMIN_CODE, ADMIN_PW)
        if not admin_token:
            print("  [!] Admin login failed")
            return
        print(f"  Admin: OK")

        all_player_tokens: dict[str, str] = {}
        for i in range(1, n_players + 1):
            code = f"{PLAYER_PREFIX}{i:02d}"
            tok = await login(client, api_url, code, PLAYER_PW)
            if tok:
                all_player_tokens[code] = tok
        print(f"  Players: {len(all_player_tokens)}/{n_players}")
        if not all_player_tokens:
            print("  [!] No players — run seed scripts first")
            return

        # WS connections
        if not no_ws and websockets is not None:
            sep("KẾT NỐI WEBSOCKET")
            for code, tok in all_player_tokens.items():
                try:
                    entry = await open_player_socket(api_url, tok, code)
                    if entry:
                        player_sockets[code] = entry
                except Exception as e:
                    print(f"  [warn] WS {code}: {e}")
            print(f"  WS connected: {len(player_sockets)}/{len(all_player_tokens)}")
            await asyncio.sleep(1.0)

        # Track which players are still active (not eliminated)
        active_players = set(all_player_tokens.keys())
        total_answers = 0
        total_failures = 0

        # ── Round loop ───────────────────────────────────────────────────────
        for round_num in rounds_to_run:
            if round_num not in ROUNDS:
                print(f"\n  [skip] Round {round_num} not configured")
                continue

            round_config = ROUNDS[round_num]
            questions = round_config["questions"]
            round_name = f"Vòng {round_num}" if round_num <= 4 else "Vòng Dự Phòng"

            sep(f"VÒNG {round_num} — {round_name} ({len(questions)} câu, {len(active_players)} players)")

            round_players = sorted(active_players)
            if not round_players:
                print("  [!] No active players remaining — stopping.")
                break

            if pause_between_rounds and not auto:
                prompt(f"Bắt đầu {round_name}?")

            # Per-question loop
            for qi, (q_code, correct) in enumerate(questions, start=1):
                print(f"\n  ── Câu {qi}/{len(questions)} [{q_code}] đáp án đúng: {correct} ──")

                # Build answer distribution
                answers: list[tuple[str, str]] = []
                for code in round_players:
                    roll = random.random()
                    if roll < 0.08:
                        continue  # skip
                    elif roll < 0.82:
                        ans = correct
                    else:
                        ans = random.choice([o for o in OPTION_LETTERS if o != correct])
                    answers.append((code, ans))

                random.shuffle(answers)
                print(f"  Submitting {len(answers)} answers ({len(round_players) - len(answers)} skipped)...")

                ok = fail = ws_ok = 0

                if burst:
                    async def run_one(code: str, ans: str) -> tuple[str, str, float, bool, bool]:
                        ts = round(random.uniform(1.5, 9.5), 3)
                        post_ok = await submit_answer(
                            client, api_url, all_player_tokens[code],
                            code, q_code, ans, ts,
                        )
                        ws_sent = await mirror_answer_via_ws(
                            player_sockets.get(code), q_code, ans, ts,
                        )
                        return code, ans, ts, post_ok, ws_sent

                    results = await asyncio.gather(
                        *(run_one(c, a) for c, a in answers)
                    )
                    for code, ans, ts, post_ok, ws_sent in results:
                        short = code.replace("OC_U_P03TST", "P")
                        marker = "✓" if ans == correct else "✗"
                        if post_ok:
                            ok += 1
                        else:
                            fail += 1
                        if ws_sent:
                            ws_ok += 1
                        print(f"    {marker} {short:<5} → {ans}  ({ts}s)  ws={'ok' if ws_sent else '--'}")
                else:
                    for code, ans in answers:
                        ts = round(random.uniform(1.5, 9.5), 3)
                        post_ok = await submit_answer(
                            client, api_url, all_player_tokens[code],
                            code, q_code, ans, ts,
                        )
                        ws_sent = await mirror_answer_via_ws(
                            player_sockets.get(code), q_code, ans, ts,
                        )
                        short = code.replace("OC_U_P03TST", "P")
                        marker = "✓" if ans == correct else "✗"
                        if post_ok:
                            ok += 1
                        else:
                            fail += 1
                        if ws_sent:
                            ws_ok += 1
                        print(f"    {marker} {short:<5} → {ans}  ({ts}s)  ws={'ok' if ws_sent else '--'}")
                        await asyncio.sleep(delay)

                total_answers += ok
                total_failures += fail
                correct_n = sum(1 for _, a in answers if a == correct)
                print(f"  Result: {ok} ok, {fail} fail | {correct_n} correct, {len(answers)-correct_n} wrong, {len(round_players)-len(answers)} skip")

                # Auto score
                await asyncio.sleep(0.5)
                score_data = await calculate_scores(client, api_url, admin_token, q_code, correct, round_num)
                if score_data:
                    print(f"  Scored: correct={score_data.get('correct_count')} wrong={score_data.get('wrong_count')}")

            # ── End round ────────────────────────────────────────────────────
            print(f"\n  ── Kết thúc Vòng {round_num} ──")
            await asyncio.sleep(0.5)
            end_data = end_round(client, api_url, admin_token, round_num)
            er = await end_data
            if er:
                passed = er.get("passed_count", "?")
                reserve = er.get("reserve_count", "?")
                print(f"  [OK] Vòng {round_num}: passed={passed}, reserve={reserve}")

            # Query advancements to update active player set
            await asyncio.sleep(0.5)
            advancements = await get_advancements(client, api_url, admin_token)
            round_passed = set()
            total_passed = set()
            for a in advancements:
                status = a.get("status")
                user_code = a.get("user_code")
                adv_round = a.get("round_number")
                if status == "passed":
                    total_passed.add(user_code)
                    if adv_round == round_num:
                        round_passed.add(user_code)

            if round_passed:
                active_players = round_passed
                print(f"  Players advancing from round {round_num}: {len(round_passed)}")
                for pc in sorted(round_passed):
                    print(f"    → {pc.replace('OC_U_P03TST', 'P')}")
            else:
                # Round 5 or no advancement info: keep active_players unchanged
                print(f"  No advancement changes (round {round_num})")

        # ── Summary ──────────────────────────────────────────────────────────
        sep("KẾT QUẢ TỔNG")
        print(f"  Total answers: {total_answers}")
        print(f"  Total failures: {total_failures}")
        print(f"  Rounds completed: {len(rounds_to_run)}")

        # Final advancements
        advancements = await get_advancements(client, api_url, admin_token)
        by_round: dict[int, dict[str, list[str]]] = {}
        for a in advancements:
            rn = a.get("round_number", 0)
            status = a.get("status", "?")
            user_code = a.get("user_code", "?")
            if rn not in by_round:
                by_round[rn] = {"passed": [], "reserve": []}
            if status in by_round[rn]:
                by_round[rn][status].append(user_code.replace("OC_U_P03TST", "P"))

        for rn in sorted(by_round):
            p = by_round[rn]["passed"]
            r = by_round[rn]["reserve"]
            print(f"\n  Vòng {rn}: {len(p)} passed, {len(r)} reserve")
            if p:
                print(f"    Passed:  {', '.join(sorted(p))}")
            if r:
                print(f"    Reserve: {', '.join(sorted(r))}")

        await close_player_sockets(player_sockets)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Full 5-round qualifier simulation")
    parser.add_argument("--auto",    action="store_true", help="Skip prompts")
    parser.add_argument("--burst",   action="store_true", help="Submit answers concurrently")
    parser.add_argument("--delay",   type=float, default=0.3, help="Delay between sequential answers (default 0.3)")
    parser.add_argument("--players", type=int,   default=10,  help="Number of players (default 10)")
    parser.add_argument("--no-ws",   action="store_true",     help="Skip WebSocket mirroring")
    parser.add_argument("--skip-clean", action="store_true",  help="Don't clean previous data")
    parser.add_argument("--rounds",  type=str, default="1,2,3,4,5", help="Rounds to run, comma-separated (default: 1,2,3,4,5)")
    parser.add_argument("--pause",   action="store_true", help="Pause between rounds (requires --auto=false)")
    parser.add_argument("--api-url", default=None, help="API base URL override")
    args = parser.parse_args()

    if args.api_url:
        os.environ["API_URL"] = args.api_url

    rounds_to_run = [int(r.strip()) for r in args.rounds.split(",")]

    asyncio.run(main(
        auto=args.auto,
        delay=args.delay,
        n_players=args.players,
        skip_clean=args.skip_clean,
        burst=args.burst,
        no_ws=args.no_ws,
        rounds_to_run=rounds_to_run,
        pause_between_rounds=args.pause,
    ))
